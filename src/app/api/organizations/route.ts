import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moderatorScopeOrgIds } from "@/lib/orgs";
import { zbody, OrgCreateBody, OrgUpdateBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET   /api/organizations — плоский список узлов иерархии (клиент строит дерево по parent_id).
 * POST  /api/organizations — добавить узел.
 *        admin — любой; moderator — только ПОДРАЗДЕЛЕНИЕ внутри своего поддерева
 *        (parent обязателен и принадлежит скоупу; тип committee|department).
 * PATCH /api/organizations — переименовать либо отключить узел своего поддерева
 *        (admin — любой). Отключение скрывает узел из справочников, данные сохраняются.
 */

const UNIT_TYPES = ["committee", "department"];

/** Управление узлами: admin — без ограничений, moderator — своё поддерево. */
async function requireOrgManager() {
  const user = await getCurrentUser();
  if (!user) return { err: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  if (user.role !== "admin" && user.role !== "moderator")
    return { err: NextResponse.json({ error: "Нет прав" }, { status: 403 }) };
  const isAdmin = user.role === "admin";
  const scope = isAdmin ? [] : await moderatorScopeOrgIds(user.id);
  if (!isAdmin && scope.length === 0)
    return { err: NextResponse.json({ error: "За вами не закреплён ни один орган — обратитесь к администратору" }, { status: 403 }) };
  return { user, isAdmin, scope };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const r = await query(`
    SELECT o.id, o.code, o.parent_id, o.type, o.name_ru, o.short_name, o.region_code,
           o.sphere_codes, o.is_regulator, o.active,
           (SELECT count(*) FROM requirement_registry rr
             WHERE rr.authority_code = o.code AND NOT COALESCE(rr.excluded, false)
               AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу'))::int AS req_count,
           (SELECT count(DISTINCT rr.ngr) FROM requirement_registry rr
             WHERE rr.authority_code = o.code AND NOT COALESCE(rr.excluded, false)
               AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу'))::int AS npa_count,
           (SELECT count(*) FROM user_orgs uo JOIN users u ON u.id = uo.user_id
             WHERE uo.org_id = o.id AND u.is_active)::int AS user_count
    FROM organizations o
    WHERE o.active
    ORDER BY o.type, o.display_order, o.name_ru`);
  return NextResponse.json({ organizations: r.rows });
}

export async function POST(req: NextRequest) {
  const m = await requireOrgManager();
  if (m.err) return m.err;
  const v = await zbody(req, OrgCreateBody);
  if (!v.ok) return v.res;
  const { code, parent_id, type, name_ru, short_name, region_code, sphere_codes } = v.data;

  // Модератор создаёт только подразделения внутри своего органа
  if (!m.isAdmin) {
    if (!parent_id)
      return NextResponse.json({ error: "Укажите вышестоящий орган" }, { status: 400 });
    if (!m.scope!.includes(parent_id))
      return NextResponse.json({ error: "Вышестоящий орган вне вашего органа" }, { status: 403 });
    if (!UNIT_TYPES.includes(type))
      return NextResponse.json({ error: "Можно создавать только подразделения органа" }, { status: 400 });
  }

  try {
    const r = await query(
      `INSERT INTO organizations (code, parent_id, type, name_ru, short_name, region_code, sphere_codes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [code, parent_id || null, type, name_ru, short_name || null, region_code || null, sphere_codes || null]);
    const id = r.rows[0].id;
    // Создатель-модератор получает узел в управление, иначе узел выпадет из его скоупа
    if (!m.isAdmin) {
      await query(
        `INSERT INTO user_orgs (user_id, org_id, org_role) VALUES ($1,$2,'moderator')
         ON CONFLICT DO NOTHING`, [m.user!.id, id]);
    }
    await query(
      `INSERT INTO activity_log (user_id, action, details) VALUES ($1,'create_org',$2)`,
      [m.user!.id, JSON.stringify({ id, code, name_ru, parent_id, type })]).catch(() => {});
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { error: "Не удалось создать подразделение (код уже занят?)", detail: String(e).slice(0, 120) },
      { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const m = await requireOrgManager();
  if (m.err) return m.err;
  const v = await zbody(req, OrgUpdateBody);
  if (!v.ok) return v.res;
  const { id, name_ru, short_name, active } = v.data;

  const cur = await query(`SELECT id, code, type, parent_id, active FROM organizations WHERE id = $1`, [id]);
  if (!cur.rows[0]) return NextResponse.json({ error: "Подразделение не найдено" }, { status: 404 });
  const node = cur.rows[0];

  if (!m.isAdmin) {
    if (!m.scope!.includes(node.id))
      return NextResponse.json({ error: "Подразделение вне вашего органа" }, { status: 403 });
    if (!UNIT_TYPES.includes(node.type) || node.parent_id == null)
      return NextResponse.json({ error: "Изменять можно только подразделения органа" }, { status: 403 });
  }

  // Отключение запрещено, пока к узлу привязаны требования, сотрудники или вложенные узлы
  if (active === false) {
    const used = await query(
      `SELECT (SELECT count(*) FROM requirement_registry rr
                WHERE rr.authority_code = $1 AND NOT COALESCE(rr.excluded,false))::int AS reqs,
              (SELECT count(*) FROM user_orgs uo JOIN users u ON u.id = uo.user_id
                WHERE uo.org_id = $2 AND u.is_active)::int AS users,
              (SELECT count(*) FROM organizations c WHERE c.parent_id = $2 AND c.active)::int AS kids`,
      [node.code, node.id]);
    const u = used.rows[0];
    if (u.reqs > 0 || u.users > 0 || u.kids > 0) {
      const parts = [
        u.reqs > 0 ? `требований: ${u.reqs}` : null,
        u.users > 0 ? `сотрудников: ${u.users}` : null,
        u.kids > 0 ? `вложенных подразделений: ${u.kids}` : null,
      ].filter(Boolean).join(", ");
      return NextResponse.json(
        { error: `Нельзя отключить — привязаны ${parts}. Сначала переназначьте их.` },
        { status: 400 });
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (name_ru !== undefined) { params.push(name_ru); sets.push(`name_ru = $${params.length}`); }
  if (short_name !== undefined) { params.push(short_name || null); sets.push(`short_name = $${params.length}`); }
  if (active !== undefined) { params.push(active); sets.push(`active = $${params.length}`); }
  if (!sets.length) return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
  params.push(id);
  await query(`UPDATE organizations SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  await query(
    `INSERT INTO activity_log (user_id, action, details) VALUES ($1,'update_org',$2)`,
    [m.user!.id, JSON.stringify({ id, name_ru, short_name, active })]).catch(() => {});
  return NextResponse.json({ ok: true });
}
