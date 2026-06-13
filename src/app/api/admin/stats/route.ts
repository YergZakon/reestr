import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, initDB } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    // Общая статистика
    const stats = await query(`
      SELECT
        (SELECT COUNT(*) FROM requirements WHERE admin_status = 'active') as total_active,
        (SELECT COUNT(*) FROM requirements WHERE admin_status = 'rejected') as total_rejected,
        (SELECT COUNT(DISTINCT user_id) FROM expert_votes) as active_experts,
        (SELECT COUNT(*) FROM expert_votes) as total_votes
    `);

    // По категориям
    const byCategory = await query(`
      SELECT category, COUNT(*) as count
      FROM requirements WHERE admin_status = 'active'
      GROUP BY category ORDER BY count DESC
    `);

    // По НПА
    const byNpa = await query(`
      SELECT n.title, COUNT(*) as count
      FROM requirements r
      JOIN npa_documents n ON n.id = r.npa_document_id
      WHERE r.admin_status = 'active'
      GROUP BY n.title ORDER BY count DESC
    `);

    // Прогресс по экспертам
    const expertProgress = await query(`
      SELECT u.username, u.full_name,
             COUNT(DISTINCT v.requirement_id) as voted,
             (SELECT COUNT(*) FROM requirements WHERE admin_status = 'active') as total_reqs
      FROM users u
      LEFT JOIN expert_votes v ON v.user_id = u.id
      WHERE u.role = 'expert' AND u.is_active = true
      GROUP BY u.id, u.username, u.full_name
      ORDER BY voted DESC
    `);

    // Консенсус: требования с единогласным подтверждением/отклонением
    const consensus = await query(`
      SELECT
        (SELECT COUNT(*) FROM requirements r WHERE admin_status = 'active' AND
          (SELECT COUNT(*) FROM expert_votes WHERE requirement_id = r.id AND vote = 'confirm') >= 3 AND
          (SELECT COUNT(*) FROM expert_votes WHERE requirement_id = r.id AND vote = 'reject') = 0
        ) as confirmed_unanimously,
        (SELECT COUNT(*) FROM requirements r WHERE admin_status = 'active' AND
          (SELECT COUNT(*) FROM expert_votes WHERE requirement_id = r.id AND vote = 'reject') >= 3 AND
          (SELECT COUNT(*) FROM expert_votes WHERE requirement_id = r.id AND vote = 'confirm') = 0
        ) as rejected_unanimously,
        (SELECT COUNT(*) FROM requirements r WHERE admin_status = 'active' AND
          (SELECT COUNT(*) FROM expert_votes WHERE requirement_id = r.id) >= 3 AND
          (SELECT COUNT(*) FROM expert_votes WHERE requirement_id = r.id AND vote = 'confirm') > 0 AND
          (SELECT COUNT(*) FROM expert_votes WHERE requirement_id = r.id AND vote = 'reject') > 0
        ) as disputed
    `);

    // По сферам — безопасный запрос, проверяем наличие колонки
    let bySphere = [];
    try {
      const sphereResult = await query(`
        SELECT COALESCE(r.sphere, 'land') as sphere, COUNT(*) as count
        FROM requirements r
        WHERE r.admin_status = 'active'
        GROUP BY r.sphere ORDER BY count DESC
      `);
      bySphere = sphereResult.rows;
    } catch {
      // sphere column may not exist yet
      bySphere = [{ sphere: "land", count: stats.rows[0]?.total_active || "0" }];
    }

    return NextResponse.json({
      overview: stats.rows[0],
      byCategory: byCategory.rows,
      byNpa: byNpa.rows,
      bySphere,
      expertProgress: expertProgress.rows,
      consensus: consensus.rows[0],
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 }
    );
  }
}
