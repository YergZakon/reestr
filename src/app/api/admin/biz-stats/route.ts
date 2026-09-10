import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserWithAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/admin/biz-stats?days=30 — посещаемость бизнес-навигатора (только администратор).
 *  Источник — biz_event (без персданных: IP не хранится, cookie не ставятся). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Доступ только для администратора" }, { status: 403 });

  const d = Math.min(365, Math.max(1, parseInt(new URL(req.url).searchParams.get("days") || "30", 10)));
  const since = `current_date - ${d}`;

  const [kpi, funnel, byDay, tops, langs, devices, refs] = await Promise.all([
    query(`SELECT count(DISTINCT visitor_key)::int visitors, count(DISTINCT session_id)::int visits,
                  count(*)::int events, min(day)::text since
           FROM biz_event WHERE day >= ${since}`),
    // воронка считается по визитам: в скольких вкладках дошли до шага
    query(`SELECT
             count(DISTINCT session_id) FILTER (WHERE event='visit')::int         AS visit,
             count(DISTINCT session_id) FILTER (WHERE event='bin_lookup')::int    AS bin_lookup,
             count(DISTINCT session_id) FILTER (WHERE event='activity_pick')::int AS activity_pick,
             count(DISTINCT session_id) FILTER (WHERE event='report_view')::int   AS report_view,
             count(DISTINCT session_id) FILTER (WHERE event='conclusion')::int    AS conclusion,
             count(DISTINCT session_id) FILTER (WHERE event='pdf')::int           AS pdf
           FROM biz_event WHERE day >= ${since}`),
    query(`SELECT day::text, count(DISTINCT visitor_key)::int visitors,
                  count(DISTINCT session_id)::int visits,
                  count(DISTINCT session_id) FILTER (WHERE event='report_view')::int reports
           FROM biz_event WHERE day >= ${since} GROUP BY day ORDER BY day DESC LIMIT 60`),
    query(`SELECT COALESCE(NULLIF(title,''), oked, section, '—') AS title,
                  count(DISTINCT session_id)::int n
           FROM biz_event WHERE day >= ${since} AND event IN ('activity_pick','report_view')
           GROUP BY 1 ORDER BY n DESC LIMIT 15`),
    query(`SELECT COALESCE(lang,'ru') lang, count(DISTINCT session_id)::int n
           FROM biz_event WHERE day >= ${since} GROUP BY 1 ORDER BY n DESC`),
    query(`SELECT COALESCE(device,'—') device, count(DISTINCT session_id)::int n
           FROM biz_event WHERE day >= ${since} GROUP BY 1 ORDER BY n DESC`),
    query(`SELECT ref_host, count(DISTINCT session_id)::int n
           FROM biz_event WHERE day >= ${since} AND ref_host IS NOT NULL
           GROUP BY 1 ORDER BY n DESC LIMIT 10`),
  ]);

  return NextResponse.json({
    days: d,
    kpi: kpi.rows[0],
    funnel: funnel.rows[0],
    byDay: byDay.rows,
    tops: tops.rows,
    langs: langs.rows,
    devices: devices.rows,
    refs: refs.rows,
  });
}
