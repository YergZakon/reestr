import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { moderatorScopeOrgIds } from "@/lib/orgs";

/** PUT /api/admin/users/:id/orgs — назначить пользователя на узлы органов. Body: {assigned_orgs:[org_id]}. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "moderator")
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  const body = await req.json().catch(() => ({}));
  const orgIds: number[] = Array.isArray(body.assigned_orgs) ? body.assigned_orgs.map(Number).filter(Boolean) : [];

  const isAdmin = user.role === "admin";
  if (!isAdmin) {
    const scope = await moderatorScopeOrgIds(user.id);
    const inScope = await query("SELECT 1 FROM user_orgs WHERE user_id=$1 AND org_id = ANY($2::int[]) LIMIT 1", [uid, scope]);
    if (!inScope.rows.length) return NextResponse.json({ error: "Пользователь вне вашего поддерева" }, { status: 403 });
    const outside = orgIds.filter((o) => !scope.includes(o));
    if (outside.length) return NextResponse.json({ error: "Орган вне вашего поддерева" }, { status: 403 });
  }

  const target = await query("SELECT role FROM users WHERE id=$1", [uid]);
  if (!target.rows.length) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (orgIds.length) {
    const v = await query("SELECT id FROM organizations WHERE id = ANY($1::int[])", [orgIds]);
    if (v.rows.length !== orgIds.length) return NextResponse.json({ error: "Неизвестный org_id" }, { status: 400 });
  }
  const orgRole = target.rows[0].role === "moderator" ? "moderator" : "member";

  await query("DELETE FROM user_orgs WHERE user_id=$1", [uid]);
  if (orgIds.length) {
    const vals = orgIds.map((_, i) => `($1, $${i + 2}, '${orgRole}')`).join(", ");
    await query(`INSERT INTO user_orgs (user_id, org_id, org_role) VALUES ${vals} ON CONFLICT DO NOTHING`, [uid, ...orgIds]);
  }
  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'user_orgs_updated',$2)",
    [user.id, JSON.stringify({ target_user_id: uid, orgs: orgIds })]);
  return NextResponse.json({ ok: true, user_id: uid, assigned_org_ids: orgIds });
}
