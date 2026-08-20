import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserWithAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/ara/my-assignments — поручения АРА текущего пользователя.
 *  Активные (assigned/accepted) + завершённые за 60 дней. lang=kz — kk-названия. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const kz = new URL(req.url).searchParams.get("lang") === "kz";
  const titleExpr = kz ? "COALESCE(nk.title_kk, a.npa_title)" : "a.npa_title";

  const r = await query(`
    SELECT aa.id, aa.review_id, aa.note, aa.due_date::text, aa.status AS assign_status,
           aa.created_at, u.username AS assigned_by_name,
           rev.status AS review_status, rev.conclusion, rev.deadline_snapshot::text,
           a.id AS ara_id, a.ngr, a.authority_code, ${titleExpr} AS npa_title, a.npa_kind,
           a.deadline::text
    FROM ara_assignment aa
    JOIN ara_review rev ON rev.id = aa.review_id
    JOIN npa_ara a ON a.id = rev.ara_id
    LEFT JOIN npa_title_kk nk ON nk.ngr = a.ngr
    LEFT JOIN users u ON u.id = aa.assigned_by
    WHERE aa.assignee_id = $1
      AND (aa.status IN ('assigned','accepted')
           OR (aa.status = 'done' AND aa.status_at >= now() - interval '60 days'))
    ORDER BY (aa.status IN ('assigned','accepted')) DESC, aa.due_date NULLS LAST, aa.created_at DESC
    LIMIT 200`, [user.id]);
  return NextResponse.json({ items: r.rows });
}
