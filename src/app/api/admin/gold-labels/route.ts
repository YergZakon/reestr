import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, initDB } from "@/lib/db";
import { computeGoldLabel, GoldLabel } from "@/lib/agreement";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const url = new URL(req.url);
    const sphere = url.searchParams.get("sphere");
    const category = url.searchParams.get("category");
    const minVotes = parseInt(url.searchParams.get("min_votes") || "3");
    const goldConfidence = url.searchParams.get("gold_confidence"); // gold | silver | disputed
    const iterationId = url.searchParams.get("iteration_id");

    // Build requirement filters
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

    // Filter by iteration on both requirements and votes
    let voteFilter = "";
    if (iterationId) {
      const itId = parseInt(iterationId);
      where += ` AND r.iteration_id = $${idx}`;
      params.push(itId);
      idx++;
      voteFilter = ` AND ev.iteration_id = ${itId}`;
    }

    const result = await query(
      `SELECT r.id as requirement_id, r.external_id, r.category,
              r.text_original, r.text_summary, r.article_ref, r.subject,
              COALESCE(r.sphere, 'land') as sphere,
              n.title as npa_title,
              COALESCE(
                json_agg(
                  json_build_object('vote', ev.vote)
                ) FILTER (WHERE ev.vote IS NOT NULL),
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

    const labels: (GoldLabel & { external_id: string; category: string; sphere: string; npa_title: string })[] = [];
    const summary = { total: 0, gold: 0, silver: 0, disputed: 0, insufficient: 0 };

    for (const row of result.rows) {
      summary.total++;
      const votes = row.votes || [];
      const gl = computeGoldLabel(row.requirement_id, votes, {
        majorityThreshold: 0.75,
        minVotes,
      });

      summary[gl.gold_confidence as keyof typeof summary]++;

      // Apply gold_confidence filter
      if (goldConfidence && gl.gold_confidence !== goldConfidence) continue;

      labels.push({
        ...gl,
        external_id: row.external_id,
        category: row.category,
        sphere: row.sphere,
        npa_title: row.npa_title,
      });
    }

    return NextResponse.json({ summary, labels });
  } catch (error) {
    console.error("Gold labels error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 }
    );
  }
}
