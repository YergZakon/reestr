/**
 * GET /api/cards/export/ml-dataset
 *
 * Узкая разметка для тренировки ML-моделей:
 *   - 1 строка = карточка
 *   - gold_label, gold_confidence, agreement_ratio
 *   - опционально: stratified split на train/val/test
 *
 * Только карточки с достаточным консенсусом (gold_confidence != insufficient).
 *
 * Query params:
 *   format=csv|json
 *   sphere, role_fragment, requirement_type
 *   min_votes=3 (default)
 *   min_agreement=0..1 (default 0)
 *   split=true|false
 *   test_ratio=0.2, val_ratio=0.1, seed=42
 *
 * Доступ: только admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { computeGoldLabel } from "@/lib/agreement";

export const dynamic = "force-dynamic";

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function deterministicHash(id: number, seed: number): number {
  return Math.abs(((id * 2654435761 + seed) | 0) % 1000);
}

interface DataRow {
  card_id: number;
  card_code: string;
  short_title: string | null;
  canonical_text: string | null;
  subject: string | null;
  action: string | null;
  timing: string | null;
  role_fragment: string | null;
  requirement_type: string | null;
  mandatory_level: string | null;
  sphere_code: string;
  sphere_name: string | null;
  npa_title: string | null;
  article_ref: string | null;
  gold_label: string;
  gold_confidence: string;
  agreement_ratio: number;
  total_votes: number;
  split?: string;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin")
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    const sphere = url.searchParams.get("sphere");
    const roleFragment = url.searchParams.get("role_fragment");
    const requirementType = url.searchParams.get("requirement_type");
    const minAgreement = parseFloat(url.searchParams.get("min_agreement") || "0");
    const minVotes = parseInt(url.searchParams.get("min_votes") || "3", 10);
    const doSplit = url.searchParams.get("split") === "true";
    const testRatio = parseFloat(url.searchParams.get("test_ratio") || "0.2");
    const valRatio = parseFloat(url.searchParams.get("val_ratio") || "0.1");
    const seed = parseInt(url.searchParams.get("seed") || "42", 10);

    let where = "WHERE rc.is_canonical = true";
    const params: unknown[] = [];
    let idx = 1;
    if (sphere) {
      where += ` AND rc.sphere_code = $${idx}`;
      params.push(sphere);
      idx++;
    }
    if (roleFragment) {
      where += ` AND rc.role_fragment = $${idx}`;
      params.push(roleFragment);
      idx++;
    }
    if (requirementType) {
      where += ` AND rc.requirement_type = $${idx}`;
      params.push(requirementType);
      idx++;
    }

    // Берём только карточки с голосами — без них всё равно gold_confidence=insufficient.
    const result = await query(
      `SELECT rc.id AS card_id,
              rc.card_code,
              rc.short_title,
              rc.canonical_text,
              rc.subject,
              rc.action,
              rc.timing,
              rc.role_fragment,
              rc.requirement_type,
              rc.mandatory_level,
              rc.sphere_code,
              s.name_ru AS sphere_name,
              (SELECT npa_title FROM npa_links WHERE card_id = rc.id LIMIT 1) AS npa_title,
              (SELECT article_ref FROM npa_links WHERE card_id = rc.id LIMIT 1) AS article_ref,
              json_agg(json_build_object('vote', cv.vote)) AS votes
       FROM requirement_cards rc
       JOIN card_votes cv ON cv.card_id = rc.id
       LEFT JOIN spheres s ON s.code = rc.sphere_code
       ${where}
       GROUP BY rc.id, rc.card_code, rc.short_title, rc.canonical_text,
                rc.subject, rc.action, rc.timing, rc.role_fragment,
                rc.requirement_type, rc.mandatory_level, rc.sphere_code, s.name_ru
       ORDER BY rc.id`,
      params,
    );

    const rows: DataRow[] = [];
    for (const r of result.rows) {
      const votes = r.votes || [];
      const gl = computeGoldLabel(r.card_id, votes, {
        majorityThreshold: 0.75,
        minVotes,
      });
      if (gl.gold_confidence === "insufficient") continue;
      if (minAgreement > 0 && gl.agreement_ratio < minAgreement) continue;

      rows.push({
        card_id: r.card_id,
        card_code: r.card_code,
        short_title: r.short_title,
        canonical_text: r.canonical_text,
        subject: r.subject,
        action: r.action,
        timing: r.timing,
        role_fragment: r.role_fragment,
        requirement_type: r.requirement_type,
        mandatory_level: r.mandatory_level,
        sphere_code: r.sphere_code,
        sphere_name: r.sphere_name,
        npa_title: r.npa_title,
        article_ref: r.article_ref,
        gold_label: gl.label,
        gold_confidence: gl.gold_confidence,
        agreement_ratio: gl.agreement_ratio,
        total_votes: gl.total_votes,
      });
    }

    // Stratified split по (gold_label × role_fragment) — детерминированный hash
    if (doSplit) {
      const groups = new Map<string, DataRow[]>();
      for (const row of rows) {
        const key = `${row.gold_label}__${row.role_fragment || "unknown"}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
      const testThreshold = Math.floor(testRatio * 1000);
      const valThreshold = Math.floor((testRatio + valRatio) * 1000);
      for (const groupRows of Array.from(groups.values())) {
        for (const row of groupRows) {
          const hash = deterministicHash(row.card_id, seed);
          if (hash < testThreshold) row.split = "test";
          else if (hash < valThreshold) row.split = "val";
          else row.split = "train";
        }
      }
    }

    const splitCounts: Record<string, number> = {};
    const labelCounts: Record<string, number> = {};
    for (const row of rows) {
      if (row.split) splitCounts[row.split] = (splitCounts[row.split] || 0) + 1;
      labelCounts[row.gold_label] = (labelCounts[row.gold_label] || 0) + 1;
    }

    const date = new Date().toISOString().split("T")[0];

    if (format === "json") {
      return new NextResponse(
        JSON.stringify(
          {
            metadata: {
              exportedAt: new Date().toISOString(),
              totalRows: rows.length,
              filters: {
                sphere,
                roleFragment,
                requirementType,
                minAgreement,
                minVotes,
                seed,
              },
              splits: doSplit ? splitCounts : null,
              labelDistribution: labelCounts,
              source: "card_votes + requirement_cards",
            },
            data: rows,
          },
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename=cards_ml_dataset_${date}.json`,
          },
        },
      );
    }

    const headers = [
      "card_id",
      "card_code",
      "short_title",
      "canonical_text",
      "subject",
      "action",
      "timing",
      "role_fragment",
      "requirement_type",
      "mandatory_level",
      "sphere_code",
      "sphere_name",
      "npa_title",
      "article_ref",
      "gold_label",
      "gold_confidence",
      "agreement_ratio",
      "total_votes",
      ...(doSplit ? ["split"] : []),
    ];

    let csv = "﻿" + headers.join(";") + "\n";
    for (const row of rows) {
      const values = headers.map((h) => {
        const val = row[h as keyof DataRow];
        return escapeCSV(val != null ? String(val) : "");
      });
      csv += values.join(";") + "\n";
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=cards_ml_dataset_${date}.csv`,
      },
    });
  } catch (error) {
    console.error("[/api/cards/export/ml-dataset] error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 },
    );
  }
}
