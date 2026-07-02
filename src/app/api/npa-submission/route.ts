import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { moderatorScopeOrgIds } from "@/lib/orgs";
import { zbody, SubmissionBody, NGR_RE } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/npa-submission — модератор подаёт НПА (по ngr) в очередь на парсинг.
 *   Body: {ngr, npa_title, org_id, sphere_code?, ara_deadline?, preview_json?}
 * GET  /api/npa-submission — список подач (модератор — своего поддерева, admin — все).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "moderator")
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });

  const v = await zbody(req, SubmissionBody);
  if (!v.ok) return v.res;
  const b = v.data;
  const ngr = b.ngr.trim().replace(/.*\/docs\//, "").replace(/#.*$/, "");
  const orgId = b.org_id;
  if (!NGR_RE.test(ngr))
    return NextResponse.json({ error: "Некорректный госрегномер (ngr)" }, { status: 400 });

  if (user.role === "moderator") {
    const scope = await moderatorScopeOrgIds(user.id);
    if (!scope.includes(orgId)) return NextResponse.json({ error: "Орган вне вашего поддерева" }, { status: 403 });
  }

  const r = await query(
    `INSERT INTO npa_submission (ngr, npa_title, org_id, sphere_code, ara_deadline, submitted_by, status, preview_json)
     VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7) RETURNING id`,
    [ngr, b.npa_title || null, orgId, b.sphere_code || null, b.ara_deadline || null, user.id,
     b.preview_json ? JSON.stringify(b.preview_json) : null]);
  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'npa_submitted',$2)",
    [user.id, JSON.stringify({ ngr, org_id: orgId })]);
  return NextResponse.json({ ok: true, id: r.rows[0].id });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "moderator")
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });

  const params: unknown[] = [];
  let where = "";
  if (user.role === "moderator") {
    const scope = await moderatorScopeOrgIds(user.id);
    if (!scope.length) return NextResponse.json({ submissions: [] });
    params.push(scope);
    where = `WHERE s.org_id = ANY($1::int[])`;
  }
  const r = await query(
    `SELECT s.id, s.ngr, s.npa_title, s.org_id, o.short_name AS org_short, o.name_ru AS org_name,
            s.sphere_code, s.ara_deadline, s.status, s.cards_created, s.error, s.created_at, s.processed_at,
            u.username AS submitter
     FROM npa_submission s
     LEFT JOIN organizations o ON o.id = s.org_id
     LEFT JOIN users u ON u.id = s.submitted_by
     ${where} ORDER BY s.created_at DESC LIMIT 100`, params);
  return NextResponse.json({ submissions: r.rows });
}
