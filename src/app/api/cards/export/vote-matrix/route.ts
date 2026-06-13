/**
 * GET /api/cards/export/vote-matrix
 *
 * Широкая матрица голосов: 1 строка = карточка, 1 колонка = эксперт.
 * Использует card_votes + requirement_cards (новая модель).
 *
 * Query params:
 *   format=csv|json (default csv)
 *   sphere=mz_zdrav|...
 *   role_fragment=обязанность бизнеса|...
 *   requirement_type=...
 *   min_votes=N (default 0 — все карточки)
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
    const minVotes = parseInt(url.searchParams.get("min_votes") || "0", 10);

    // Активные эксперты
    const expertsResult = await query(
      "SELECT id, username FROM users WHERE role = 'expert' AND is_active = true ORDER BY id",
    );
    const experts = expertsResult.rows as { id: number; username: string }[];

    // Фильтры на карточки
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

    // Если min_votes > 0 — берём только карточки у которых есть хоть какие-то голоса.
    // Это значительно ускоряет выгрузку на 67К карточек.
    const onlyWithVotes = minVotes > 0;
    const cardsSql = onlyWithVotes
      ? `SELECT DISTINCT rc.id, rc.card_code AS external_id,
                rc.role_fragment, rc.requirement_type, rc.mandatory_level,
                rc.short_title, rc.canonical_text, rc.subject, rc.action,
                rc.timing, rc.evidence_form, rc.consequences,
                rc.sphere_code AS sphere,
                s.name_ru AS sphere_name,
                (SELECT npa_title FROM npa_links WHERE card_id = rc.id LIMIT 1) AS npa_title,
                (SELECT article_ref FROM npa_links WHERE card_id = rc.id LIMIT 1) AS article_ref
         FROM requirement_cards rc
         JOIN card_votes cv ON cv.card_id = rc.id
         LEFT JOIN spheres s ON s.code = rc.sphere_code
         ${where}
         ORDER BY rc.id`
      : `SELECT rc.id, rc.card_code AS external_id,
                rc.role_fragment, rc.requirement_type, rc.mandatory_level,
                rc.short_title, rc.canonical_text, rc.subject, rc.action,
                rc.timing, rc.evidence_form, rc.consequences,
                rc.sphere_code AS sphere,
                s.name_ru AS sphere_name,
                (SELECT npa_title FROM npa_links WHERE card_id = rc.id LIMIT 1) AS npa_title,
                (SELECT article_ref FROM npa_links WHERE card_id = rc.id LIMIT 1) AS article_ref
         FROM requirement_cards rc
         LEFT JOIN spheres s ON s.code = rc.sphere_code
         ${where}
         ORDER BY rc.id`;
    const cardsResult = await query(cardsSql, params);

    // Все голоса по тем же фильтрам, только от активных экспертов
    const activeExpertIds = experts.map((e) => e.id);
    let votesSql = `SELECT cv.card_id, cv.user_id, cv.vote
                    FROM card_votes cv
                    JOIN requirement_cards rc ON rc.id = cv.card_id
                    ${where}`;
    if (activeExpertIds.length > 0) {
      votesSql += ` AND cv.user_id IN (${activeExpertIds.join(",")})`;
    }
    const votesResult = await query(votesSql, params);

    const voteLookup = new Map<number, Map<number, string>>();
    for (const v of votesResult.rows) {
      if (!voteLookup.has(v.card_id)) voteLookup.set(v.card_id, new Map());
      voteLookup.get(v.card_id)!.set(v.user_id, v.vote);
    }

    const rows: Record<string, unknown>[] = [];
    for (const r of cardsResult.rows) {
      const reqVotes = voteLookup.get(r.id);
      const votesList = reqVotes
        ? Array.from(reqVotes.values()).map((v) => ({ vote: v }))
        : [];
      const totalVotes = votesList.length;
      if (minVotes > 0 && totalVotes < minVotes) continue;

      const gl = computeGoldLabel(r.id, votesList, {
        majorityThreshold: 0.75,
        minVotes: 3,
      });

      const row: Record<string, unknown> = {
        card_id: r.id,
        card_code: r.external_id,
        sphere_code: r.sphere,
        sphere_name: r.sphere_name,
        role_fragment: r.role_fragment,
        requirement_type: r.requirement_type,
        mandatory_level: r.mandatory_level,
        short_title: r.short_title,
        canonical_text: r.canonical_text,
        subject: r.subject,
        action: r.action,
        timing: r.timing,
        evidence_form: r.evidence_form,
        consequences: r.consequences,
        npa_title: r.npa_title,
        article_ref: r.article_ref,
      };

      for (const expert of experts) {
        row[expert.username] = reqVotes?.get(expert.id) || "";
      }

      row.gold_label = gl.label;
      row.gold_confidence = gl.gold_confidence;
      row.agreement_ratio = gl.agreement_ratio;
      row.total_votes = totalVotes;

      rows.push(row);
    }

    const date = new Date().toISOString().split("T")[0];

    if (format === "json") {
      return new NextResponse(
        JSON.stringify(
          {
            metadata: {
              exportedAt: new Date().toISOString(),
              totalCards: rows.length,
              experts: experts.map((e) => e.username),
              filters: { sphere, roleFragment, requirementType, minVotes },
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
            "Content-Disposition": `attachment; filename=cards_vote_matrix_${date}.json`,
          },
        },
      );
    }

    // CSV — заголовки + значения. BOM (﻿) для Excel-кириллицы.
    const baseHeaders = [
      "card_id",
      "card_code",
      "sphere_code",
      "sphere_name",
      "role_fragment",
      "requirement_type",
      "mandatory_level",
      "short_title",
      "canonical_text",
      "subject",
      "action",
      "timing",
      "evidence_form",
      "consequences",
      "npa_title",
      "article_ref",
    ];
    const expertCols = experts.map((e) => e.username);
    const tailHeaders = [
      "gold_label",
      "gold_confidence",
      "agreement_ratio",
      "total_votes",
    ];
    const headers = [...baseHeaders, ...expertCols, ...tailHeaders];

    let csv = "﻿" + headers.join(";") + "\n";
    for (const row of rows) {
      csv += headers.map((h) => escapeCSV(String(row[h] ?? ""))).join(";") + "\n";
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=cards_vote_matrix_${date}.csv`,
      },
    });
  } catch (error) {
    console.error("[/api/cards/export/vote-matrix] error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 },
    );
  }
}
