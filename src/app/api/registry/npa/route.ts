import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserWithAccess, isMne } from "@/lib/auth";
import { escapeLike } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET /api/registry/npa?authority=&q=&status=&self=1 — НПА узла органа (по
 * authority_code требований, та же ось что и назначения «комитет↔НПА»). Даты/дедлайн/
 * adilet — обогащение из npa_registry по ngr. Скоуп: не-admin — только коды своего поддерева.
 *
 * По умолчанию включает ПОДДЕРЕВО: при выборе министерства видны и НПА его комитетов
 * (иначе поданные комитетом акты «пропадали» — их authority_code = код комитета).
 * self=1 — только сам узел. status: active (по умолчанию в UI) | dead | all.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const authority = (sp.get("authority") || "").trim();
  if (!authority) return NextResponse.json({ error: "authority обязателен" }, { status: 400 });
  if (!isMne(user.role) && !user.assigned_authorities.includes(authority))
    return NextResponse.json({ error: "Орган вне вашего доступа" }, { status: 403 });

  // коды поддерева выбранного узла (сам узел + все потомки)
  const selfOnly = sp.get("self") === "1";
  let codes: string[] = [authority];
  if (!selfOnly) {
    const sub = await query(
      `WITH RECURSIVE t AS (
         SELECT id, code FROM organizations WHERE code = $1
         UNION ALL
         SELECT o.id, o.code FROM organizations o JOIN t ON o.parent_id = t.id
       ) SELECT code FROM t WHERE code IS NOT NULL`, [authority]);
    if (sub.rows.length) codes = sub.rows.map((r: { code: string }) => r.code);
  }

  const conds: string[] = [
    "rr.authority_code = ANY($1::text[])",
    "NOT COALESCE(rr.excluded, false)", "rr.ngr IS NOT NULL",
  ];
  const params: unknown[] = [codes];
  const q = sp.get("q");
  if (q && q.trim()) {
    params.push(`%${escapeLike(q.trim())}%`);
    conds.push(`(rr.npa_title ILIKE $${params.length} OR rr.ngr ILIKE $${params.length})`);
  }
  const status = sp.get("status");
  const having =
    status === "active" ? "HAVING COALESCE(max(rr.npa_status), max(nr.npa_status), '') <> 'утратил силу'" :
    status === "dead" ? "HAVING COALESCE(max(rr.npa_status), max(nr.npa_status), '') = 'утратил силу'" : "";

  const res = await query(
    `SELECT rr.ngr,
            COALESCE(max(nr.title), max(rr.npa_title), rr.ngr) AS title,
            count(*)::int AS req_count,
            COALESCE(max(rr.npa_status), max(nr.npa_status)) AS npa_status,
            to_char(max(nr.date_adopted), 'DD.MM.YYYY') AS date_adopted,
            to_char(max(nr.date_revision), 'DD.MM.YYYY') AS date_revision,
            to_char(max(nr.review_deadline), 'DD.MM.YYYY') AS review_deadline,
            (max(nr.review_deadline) IS NOT NULL AND max(nr.review_deadline) < now()) AS overdue,
            COALESCE(max(nr.adilet_url), 'https://adilet.zan.kz/rus/docs/' || rr.ngr) AS adilet_url,
            max(rr.authority_code) AS owner_code
     FROM requirement_registry rr
     LEFT JOIN npa_registry nr ON nr.ngr = rr.ngr
     WHERE ${conds.join(" AND ")}
     GROUP BY rr.ngr ${having}
     ORDER BY count(*) DESC, 2`,
    params,
  );
  return NextResponse.json({ npa: res.rows });
}
