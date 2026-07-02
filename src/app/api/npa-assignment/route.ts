import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moderatorScopeOrgIds } from "@/lib/orgs";
import { zbody, escapeLike } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Назначение ответственного комитета за НПА (связка «комитет → НПА»).
 * GET    ?org_id=<министерство>&q=&status=all|assigned|unassigned&page= —
 *        НПА, чьи требования сейчас в поддереве органа: ngr, титул, счётчик,
 *        текущее назначение; + комитеты министерства; + журнал назначений.
 * POST   {ngr, org_id<комитет>, reason?} — назначить: закрывает прежнее активное,
 *        КАСКАДОМ переводит authority_code всех требований НПА на код комитета,
 *        уведомляет комитет (notifications → email часовым тиком).
 * DELETE {ngr} — отменить активное назначение; требования возвращаются на код
 *        родителя комитета (министерство).
 * Доступ: admin — всё; moderator — только в границах своего поддерева.
 */

async function subtree(orgId: number): Promise<{ ids: number[]; codes: string[] }> {
  const r = await query(
    `WITH RECURSIVE sub AS (
       SELECT id, code FROM organizations WHERE id = $1
       UNION ALL
       SELECT c.id, c.code FROM organizations c JOIN sub ON c.parent_id = sub.id)
     SELECT id, code FROM sub`, [orgId]);
  return { ids: r.rows.map((x) => x.id), codes: r.rows.map((x) => x.code) };
}

async function requireManager(orgId: number | null) {
  const user = await getCurrentUser();
  if (!user) return { err: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  if (user.role !== "admin" && user.role !== "moderator")
    return { err: NextResponse.json({ error: "Нет прав" }, { status: 403 }) };
  if (user.role === "moderator" && orgId != null) {
    const scope = await moderatorScopeOrgIds(user.id);
    if (!scope.includes(orgId))
      return { err: NextResponse.json({ error: "Орган вне вашего поддерева" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const orgId = parseInt(sp.get("org_id") || "0", 10);
  if (!orgId) return NextResponse.json({ error: "org_id обязателен" }, { status: 400 });
  const m = await requireManager(orgId);
  if (m.err) return m.err;

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = 15;
  const status = sp.get("status") || "all";
  const q = (sp.get("q") || "").trim();

  const { ids, codes } = await subtree(orgId);
  const params: unknown[] = [codes];
  const conds = [
    `rr.authority_code = ANY($1::text[])`,
    `rr.is_canonical`, `NOT COALESCE(rr.excluded,false)`,
    `(rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`,
    `rr.ngr IS NOT NULL`,
  ];
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    conds.push(`(rr.npa_title ILIKE $${params.length} OR rr.ngr ILIKE $${params.length})`);
  }
  const having =
    status === "assigned" ? "HAVING bool_or(a.id IS NOT NULL)" :
    status === "unassigned" ? "HAVING bool_or(a.id IS NOT NULL) = false" : "";

  params.push(limit); const lp = params.length;
  params.push((page - 1) * limit); const op = params.length;
  const items = await query(
    `SELECT rr.ngr, max(rr.npa_title) AS npa_title, count(*)::int AS req_count,
            max(rr.sphere_code) AS sphere_code,
            max(a.id) AS assignment_id, max(ao.name_ru) AS committee_name,
            max(ao.id)::int AS committee_org_id, max(a.reason) AS reason
     FROM requirement_registry rr
     LEFT JOIN npa_assignment a ON a.ngr = rr.ngr AND a.status = 'назначено'
     LEFT JOIN organizations ao ON ao.id = a.org_id
     WHERE ${conds.join(" AND ")}
     GROUP BY rr.ngr ${having}
     ORDER BY count(*) DESC
     LIMIT $${lp} OFFSET $${op}`, params);

  const committees = await query(
    `SELECT id, code, name_ru, short_name FROM organizations
     WHERE parent_id = $1 AND active ORDER BY name_ru`, [orgId]);

  const log = await query(
    `SELECT a.id, a.ngr, a.status, a.reason, a.created_at, a.cancelled_at,
            o.name_ru AS committee_name, u.username AS assigned_by_name
     FROM npa_assignment a
     JOIN organizations o ON o.id = a.org_id
     LEFT JOIN users u ON u.id = a.assigned_by
     WHERE a.org_id = ANY($1::int[])
     ORDER BY a.created_at DESC LIMIT 20`, [ids]);

  return NextResponse.json({ items: items.rows, committees: committees.rows, log: log.rows, page });
}

const AssignBody = z.object({
  ngr: z.string().min(3).max(24),
  org_id: z.coerce.number().int().positive(),
  reason: z.string().max(500).nullish(),
});

export async function POST(req: NextRequest) {
  const vb = await zbody(req, AssignBody);
  if (!vb.ok) return vb.res;
  const { ngr, org_id, reason } = vb.data;
  const m = await requireManager(org_id);
  if (m.err) return m.err;

  const org = (await query(
    "SELECT id, code, name_ru, parent_id FROM organizations WHERE id=$1 AND active", [org_id])).rows[0];
  if (!org) return NextResponse.json({ error: "Комитет не найден" }, { status: 404 });

  const cl = await pool.connect();
  let assignmentId: number;
  let cascaded: number;
  let npaTitle: string;
  try {
    await cl.query("BEGIN");
    await cl.query(
      `UPDATE npa_assignment SET status='отменено', cancelled_at=now(), cancelled_by=$1
       WHERE ngr=$2 AND status='назначено'`, [m.user!.id, ngr]);
    const ins = await cl.query(
      `INSERT INTO npa_assignment (ngr, org_id, assigned_by, reason) VALUES ($1,$2,$3,$4) RETURNING id`,
      [ngr, org_id, m.user!.id, reason || null]);
    assignmentId = ins.rows[0].id;
    const upd = await cl.query(
      `UPDATE requirement_registry SET authority_code=$1 WHERE ngr=$2 RETURNING npa_title`,
      [org.code, ngr]);
    cascaded = upd.rowCount || 0;
    npaTitle = (upd.rows[0]?.npa_title as string) || ngr;
    await cl.query("COMMIT");
  } catch (e) {
    await cl.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: "Не удалось назначить", detail: String((e as Error).message).slice(0, 150) }, { status: 500 });
  } finally {
    cl.release();
  }

  // уведомление комитету (email уйдёт часовым тиком воркера при заданном SMTP_URL)
  await query(
    `INSERT INTO notifications (authority_code, type, dedup_key, title, payload)
     VALUES ($1,'npa_assigned',$2,$3,$4::jsonb) ON CONFLICT (dedup_key) DO NOTHING`,
    [org.code, `npa_assigned:${assignmentId}`,
     `Вам назначен НПА: ${npaTitle.slice(0, 140)} (${cascaded} требований)`,
     JSON.stringify({ ngr, req_count: cascaded, reason: reason || null, assigned_by: m.user!.username })]).catch(() => {});
  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'npa_assign',$2)",
    [m.user!.id, JSON.stringify({ ngr, org_id, org_code: org.code, cascaded })]).catch(() => {});

  return NextResponse.json({ ok: true, assignment_id: assignmentId, cascaded, committee: org.name_ru });
}

const CancelBody = z.object({ ngr: z.string().min(3).max(24) });

export async function DELETE(req: NextRequest) {
  const vb = await zbody(req, CancelBody);
  if (!vb.ok) return vb.res;
  const { ngr } = vb.data;

  const active = (await query(
    `SELECT a.id, a.org_id, o.code, o.parent_id FROM npa_assignment a
     JOIN organizations o ON o.id=a.org_id WHERE a.ngr=$1 AND a.status='назначено'`, [ngr])).rows[0];
  if (!active) return NextResponse.json({ error: "Активного назначения нет" }, { status: 404 });
  const m = await requireManager(active.org_id);
  if (m.err) return m.err;

  const parent = active.parent_id
    ? (await query("SELECT code FROM organizations WHERE id=$1", [active.parent_id])).rows[0]
    : null;
  const backCode = parent?.code || active.code;

  const cl = await pool.connect();
  try {
    await cl.query("BEGIN");
    await cl.query(
      `UPDATE npa_assignment SET status='отменено', cancelled_at=now(), cancelled_by=$1 WHERE id=$2`,
      [m.user!.id, active.id]);
    const upd = await cl.query(
      `UPDATE requirement_registry SET authority_code=$1 WHERE ngr=$2`, [backCode, ngr]);
    await cl.query("COMMIT");
    await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'npa_assign_cancel',$2)",
      [m.user!.id, JSON.stringify({ ngr, back_to: backCode, cascaded: upd.rowCount })]).catch(() => {});
    return NextResponse.json({ ok: true, cascaded: upd.rowCount, back_to: backCode });
  } catch (e) {
    await cl.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: "Не удалось отменить", detail: String((e as Error).message).slice(0, 150) }, { status: 500 });
  } finally {
    cl.release();
  }
}
