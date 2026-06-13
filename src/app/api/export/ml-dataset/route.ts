import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, initDB } from "@/lib/db";
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

// Deterministic hash for reproducible splits
function deterministicHash(id: number, seed: number): number {
  return Math.abs(((id * 2654435761 + seed) | 0) % 1000);
}

interface DataRow {
  requirement_id: number;
  external_id: string;
  text: string;
  summary: string | null;
  category: string;
  subject: string;
  sphere: string;
  article_ref: string | null;
  npa_title: string | null;
  gold_label: string;
  gold_confidence: string;
  agreement_ratio: number;
  total_votes: number;
  split?: string;
}

export async function GET(req: NextRequest) {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    const sphere = url.searchParams.get("sphere");
    const category = url.searchParams.get("category");
    const minAgreement = parseFloat(url.searchParams.get("min_agreement") || "0");
    const minVotes = parseInt(url.searchParams.get("min_votes") || "3");
    const doSplit = url.searchParams.get("split") === "true";
    const testRatio = parseFloat(url.searchParams.get("test_ratio") || "0.2");
    const valRatio = parseFloat(url.searchParams.get("val_ratio") || "0.1");
    const seed = parseInt(url.searchParams.get("seed") || "42");
    const iterationId = url.searchParams.get("iteration_id");

    // Build filters
    let where = "WHERE r.admin_status = 'active'";
    const params: unknown[] = [];
    let idx = 1;

    if (sphere) {
      where += ` AND r.sphere = $${idx}`;
      params.push(sphere);
      idx++;
    }
    if (category) {
      where += ` AND r.category = $${idx}`;
      params.push(category);
      idx++;
    }

    let voteFilter = "";
    if (iterationId) {
      const itId = parseInt(iterationId);
      where += ` AND r.iteration_id = $${idx}`;
      params.push(itId);
      idx++;
      voteFilter = ` AND ev.iteration_id = ${itId}`;
    }

    // Fetch requirements with votes
    const result = await query(
      `SELECT r.id as requirement_id, r.external_id, r.category,
              r.text_original, r.text_summary, r.article_ref, r.subject,
              COALESCE(r.sphere, 'land') as sphere,
              n.title as npa_title,
              COALESCE(
                json_agg(json_build_object('vote', ev.vote)) FILTER (WHERE ev.vote IS NOT NULL),
                '[]'
              ) as votes
       FROM requirements r
       LEFT JOIN npa_documents n ON n.id = r.npa_document_id
       LEFT JOIN expert_votes ev ON ev.requirement_id = r.id${voteFilter}
       ${where}
       GROUP BY r.id, r.external_id, r.category, r.text_original, r.text_summary,
                r.article_ref, r.subject, r.sphere, n.title
       ORDER BY r.id`,
      params
    );

    // Compute gold labels and filter
    const rows: DataRow[] = [];
    for (const r of result.rows) {
      const votes = r.votes || [];
      const gl = computeGoldLabel(r.requirement_id, votes, {
        majorityThreshold: 0.75,
        minVotes,
      });

      if (gl.gold_confidence === "insufficient") continue;
      if (minAgreement > 0 && gl.agreement_ratio < minAgreement) continue;

      rows.push({
        requirement_id: r.requirement_id,
        external_id: r.external_id,
        text: r.text_original,
        summary: r.text_summary,
        category: r.category,
        subject: r.subject,
        sphere: r.sphere,
        article_ref: r.article_ref,
        npa_title: r.npa_title,
        gold_label: gl.label,
        gold_confidence: gl.gold_confidence,
        agreement_ratio: gl.agreement_ratio,
        total_votes: gl.total_votes,
      });
    }

    // Stratified split by gold_label × category
    if (doSplit) {
      // Group by stratification key
      const groups = new Map<string, DataRow[]>();
      for (const row of rows) {
        const key = `${row.gold_label}__${row.category}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      // Within each group, assign splits deterministically
      const testThreshold = Math.floor(testRatio * 1000);
      const valThreshold = Math.floor((testRatio + valRatio) * 1000);

      for (const groupRows of Array.from(groups.values())) {
        for (const row of groupRows) {
          const hash = deterministicHash(row.requirement_id, seed);
          if (hash < testThreshold) row.split = "test";
          else if (hash < valThreshold) row.split = "val";
          else row.split = "train";
        }
      }
    }

    // Build metadata
    const splitCounts: Record<string, number> = {};
    const labelCounts: Record<string, number> = {};
    for (const row of rows) {
      if (row.split) splitCounts[row.split] = (splitCounts[row.split] || 0) + 1;
      labelCounts[row.gold_label] = (labelCounts[row.gold_label] || 0) + 1;
    }

    const date = new Date().toISOString().split("T")[0];

    if (format === "json") {
      return new NextResponse(
        JSON.stringify({
          metadata: {
            exportedAt: new Date().toISOString(),
            totalRows: rows.length,
            filters: { sphere, category, minAgreement, minVotes, seed },
            splits: doSplit ? splitCounts : null,
            labelDistribution: labelCounts,
          },
          data: rows,
        }, null, 2),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename=ml_dataset_${date}.json`,
          },
        }
      );
    }

    // CSV
    const headers = [
      "requirement_id", "external_id", "text", "summary", "category",
      "subject", "sphere", "article_ref", "npa_title",
      "gold_label", "gold_confidence", "agreement_ratio", "total_votes",
      ...(doSplit ? ["split"] : []),
    ];

    let csv = "\uFEFF" + headers.join(";") + "\n";
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
        "Content-Disposition": `attachment; filename=ml_dataset_${date}.csv`,
      },
    });
  } catch (error) {
    console.error("ML dataset error:", error);
    return NextResponse.json({ error: "Ошибка сервера", details: String(error) }, { status: 500 });
  }
}
