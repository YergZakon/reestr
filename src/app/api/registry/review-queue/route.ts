import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserWithAccess } from "@/lib/auth";
import { escapeLike } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET /api/registry/review-queue — очередь апрува требований для госоргана.
 * Эксперт видит только карточки своих органов (authority_code ∈ assigned_authorities), admin — все.
 * Параметры: status (pending|confirmed|rejected|edited|all), sphere[], authority, q, page, limit.
 * Возвращает items + total + сводку counts по статусам (в пределах доступных органов).
 */
const FIELDS = `rr.id, rr.ngr, rr.npa_title, rr.article, rr.ministry, rr.authority_code, rr.sphere_code,
  s.name_ru AS sphere_name, rr.okeds, rr.stages, rr.title, rr.legal_text, rr.canon_text,
  rr.subject, rr.action, rr.object, rr.condition, rr.is_permit, rr.norm_url,
  rr.review_status, rr.ara_status, rr.ara_deadline, rr.review_comment, rr.reviewed_at,
  rr.dup_suspect`;
const ACTIVE = `rr.is_canonical AND NOT COALESCE(rr.excluded, false) AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`;

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const isAdmin = user.role === "admin";
  if (!isAdmin && user.assigned_authorities.length === 0)
    return NextResponse.json({ items: [], total: 0, page: 1, pages: 0, counts: {}, noAuthorities: true });

  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "20", 10)));
  const status = sp.get("status") || "pending";

  const conds = [ACTIVE];
  const params: unknown[] = [];
  if (!isAdmin) { params.push(user.assigned_authorities); conds.push(`rr.authority_code = ANY($${params.length}::text[])`); }
  if (status !== "all") { params.push(status); conds.push(`rr.review_status = $${params.length}`); }
  const sphere = sp.getAll("sphere").filter(Boolean);
  if (sphere.length) { params.push(sphere); conds.push(`rr.sphere_code = ANY($${params.length}::text[])`); }
  const authority = sp.get("authority");
  if (authority) { params.push(authority); conds.push(`rr.authority_code = $${params.length}`); }
  const q = sp.get("q");
  if (q && q.trim()) {
    params.push(`%${escapeLike(q.trim())}%`);
    const p = `$${params.length}`;
    conds.push(`(rr.title ILIKE ${p} OR rr.canon_text ILIKE ${p} OR rr.action ILIKE ${p} OR rr.ngr ILIKE ${p})`);
  }
  const where = conds.join(" AND ");

  const cnt = await query(`SELECT count(*) AS n FROM requirement_registry rr WHERE ${where}`, params);
  const total = parseInt(cnt.rows[0].n, 10);
  params.push(limit); const lp = params.length;
  params.push((page - 1) * limit); const op = params.length;
  const items = await query(
    `SELECT ${FIELDS} FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
     WHERE ${where} ORDER BY rr.authority_code, rr.sphere_code, rr.id LIMIT $${lp} OFFSET $${op}`,
    params);

  // сводка по статусам в пределах доступных органов
  const sumParams: unknown[] = [];
  let sumWhere = ACTIVE;
  if (!isAdmin) { sumParams.push(user.assigned_authorities); sumWhere += ` AND rr.authority_code = ANY($${sumParams.length}::text[])`; }
  const counts = await query(
    `SELECT review_status, count(*) AS n FROM requirement_registry rr WHERE ${sumWhere} GROUP BY 1`, sumParams);
  const c: Record<string, number> = {};
  for (const r of counts.rows) c[r.review_status] = Number(r.n);

  return NextResponse.json({
    items: items.rows, total, page, pages: Math.ceil(total / limit), limit, counts: c,
    isAdmin, authorities: user.assigned_authorities,
  });
}
