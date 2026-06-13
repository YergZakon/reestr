import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, initDB } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const category = url.searchParams.get("category");
    const npaId = url.searchParams.get("npa_id");
    const sphere = url.searchParams.get("sphere");
    const iterationId = url.searchParams.get("iteration_id");
    const status = url.searchParams.get("status") || "active";
    const voteStatus = url.searchParams.get("vote_status"); // voted | unvoted | all
    const offset = (page - 1) * limit;

    // Default to active iteration if not specified
    let activeIterationId: number | null = null;
    if (iterationId) {
      activeIterationId = parseInt(iterationId);
    } else {
      const iterResult = await query(
        "SELECT id FROM iterations WHERE status = 'active' ORDER BY iteration_number DESC LIMIT 1"
      );
      if (iterResult.rows.length > 0) {
        activeIterationId = iterResult.rows[0].id;
      }
    }

    let where = "WHERE r.admin_status = $1";
    const params: unknown[] = [status];
    let paramIdx = 2;

    if (activeIterationId) {
      where += ` AND r.iteration_id = $${paramIdx}`;
      params.push(activeIterationId);
      paramIdx++;
    }

    if (category) {
      where += ` AND r.category = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }
    if (npaId) {
      where += ` AND r.npa_document_id = $${paramIdx}`;
      params.push(parseInt(npaId));
      paramIdx++;
    }
    if (sphere) {
      where += ` AND r.sphere = $${paramIdx}`;
      params.push(sphere);
      paramIdx++;
    }

    // Подзапрос для текущего голоса пользователя
    const voteJoin = `
      LEFT JOIN expert_votes v ON v.requirement_id = r.id
        AND v.user_id = ${user.id}
        AND v.iteration_id = r.iteration_id
    `;

    if (voteStatus === "unvoted") {
      where += " AND v.id IS NULL";
    } else if (voteStatus === "voted") {
      where += " AND v.id IS NOT NULL";
    }

    // Общее количество
    const npaJoin = "LEFT JOIN npa_documents n ON n.id = r.npa_document_id";
    const countResult = await query(
      `SELECT COUNT(*) FROM requirements r ${npaJoin} ${voteJoin} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Данные — агрегация голосов через LEFT JOIN вместо коррелированных подзапросов
    const result = await query(
      `SELECT r.id, r.external_id, r.category, r.text_original, r.text_summary,
              r.article_ref, r.subject, r.expert_category, r.confidence,
              r.detection_method, r.admin_status, r.gold_standard_title,
              r.sphere,
              n.title as npa_title, n.code as npa_code,
              v.vote as my_vote, v.comment as my_comment,
              COALESCE(vc.confirms, 0) as confirms,
              COALESCE(vc.rejects, 0) as rejects,
              COALESCE(vc.total_votes, 0) as total_votes
       FROM requirements r
       LEFT JOIN npa_documents n ON n.id = r.npa_document_id
       ${voteJoin}
       LEFT JOIN (
         SELECT requirement_id, iteration_id,
                COUNT(*) FILTER (WHERE vote = 'confirm') as confirms,
                COUNT(*) FILTER (WHERE vote = 'reject') as rejects,
                COUNT(*) as total_votes
         FROM expert_votes
         GROUP BY requirement_id, iteration_id
       ) vc ON vc.requirement_id = r.id AND vc.iteration_id = r.iteration_id
       ${where}
       ORDER BY r.id
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      requirements: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Requirements error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 }
    );
  }
}