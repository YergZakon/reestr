import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { query, initDB } from "@/lib/db";
import { moderatorScopeOrgIds } from "@/lib/orgs";

// Управление пользователями. admin — все; moderator — только пользователи своего поддерева органов
// (создаёт только рецензентов role='expert', назначает только узлы своего поддерева).

async function requireManager() {
  const user = await getCurrentUser();
  if (!user) return { err: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  if (user.role !== "admin" && user.role !== "moderator")
    return { err: NextResponse.json({ error: "Нет доступа" }, { status: 403 }) };
  const isAdmin = user.role === "admin";
  const scope = isAdmin ? [] : await moderatorScopeOrgIds(user.id);
  return { user, isAdmin, scope };
}

export async function GET() {
  await initDB();
  const m = await requireManager();
  if (m.err) return m.err;

  const params: unknown[] = [];
  let where = "";
  if (!m.isAdmin) {
    if (!m.scope!.length) return NextResponse.json({ users: [], isAdmin: false, noScope: true });
    params.push(m.scope);
    where = `WHERE u.id IN (SELECT user_id FROM user_orgs WHERE org_id = ANY($1::int[]))`;
  }
  const result = await query(
    `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at,
            COALESCE((SELECT array_agg(sphere_code) FROM user_spheres WHERE user_id = u.id), '{}') AS assigned_spheres,
            COALESCE((SELECT array_agg(authority_code) FROM user_authorities WHERE user_id = u.id), '{}') AS assigned_authorities,
            COALESCE((SELECT array_agg(org_id) FROM user_orgs WHERE user_id = u.id), '{}') AS assigned_org_ids
     FROM users u ${where} ORDER BY u.id`,
    params,
  );
  return NextResponse.json({ users: result.rows, isAdmin: m.isAdmin });
}

export async function POST(req: NextRequest) {
  await initDB();
  const m = await requireManager();
  if (m.err) return m.err;
  const { user, isAdmin, scope } = m;

  const body = await req.json();
  const { username, password, fullName } = body;
  let role = body.role || "expert";
  const assignedSpheres: string[] = Array.isArray(body.assigned_spheres) ? body.assigned_spheres : [];
  const assignedAuthorities: string[] = Array.isArray(body.assigned_authorities) ? body.assigned_authorities : [];
  const assignedOrgs: number[] = Array.isArray(body.assigned_orgs) ? body.assigned_orgs.map(Number).filter(Boolean) : [];

  if (!username || !password) return NextResponse.json({ error: "Логин и пароль обязательны" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
  if (!["admin", "moderator", "expert"].includes(role))
    return NextResponse.json({ error: "Роль: admin, moderator или expert" }, { status: 400 });

  // Модератор: может создавать только рецензентов и только в своём поддереве
  if (!isAdmin) {
    role = "expert";
    if (!assignedOrgs.length) return NextResponse.json({ error: "Укажите орган (узел)" }, { status: 400 });
    const outside = assignedOrgs.filter((o) => !scope!.includes(o));
    if (outside.length) return NextResponse.json({ error: "Орган вне вашего поддерева" }, { status: 403 });
  }

  if (assignedSpheres.length) {
    const v = await query("SELECT code FROM spheres WHERE code = ANY($1::text[])", [assignedSpheres]);
    const ok = new Set(v.rows.map((r) => r.code));
    const bad = assignedSpheres.filter((s) => !ok.has(s));
    if (bad.length) return NextResponse.json({ error: "Неизвестные sphere_code: " + bad.join(", ") }, { status: 400 });
  }
  if (assignedAuthorities.length) {
    const v = await query("SELECT code FROM authorities WHERE code = ANY($1::text[])", [assignedAuthorities]);
    const ok = new Set(v.rows.map((r) => r.code));
    const bad = assignedAuthorities.filter((s) => !ok.has(s));
    if (bad.length) return NextResponse.json({ error: "Неизвестные authority_code: " + bad.join(", ") }, { status: 400 });
  }
  if (assignedOrgs.length) {
    const v = await query("SELECT id FROM organizations WHERE id = ANY($1::int[])", [assignedOrgs]);
    if (v.rows.length !== assignedOrgs.length) return NextResponse.json({ error: "Неизвестный org_id" }, { status: 400 });
  }

  const existing = await query("SELECT id FROM users WHERE username = $1", [username]);
  if (existing.rows.length) return NextResponse.json({ error: "Логин уже существует" }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,$4)
     RETURNING id, username, full_name, role, is_active, created_at`,
    [username, passwordHash, fullName || null, role],
  );
  const uid = result.rows[0].id;

  if (role !== "admin") {
    if (assignedSpheres.length) {
      const vals = assignedSpheres.map((_, i) => `($1, $${i + 2})`).join(", ");
      await query(`INSERT INTO user_spheres (user_id, sphere_code) VALUES ${vals} ON CONFLICT DO NOTHING`, [uid, ...assignedSpheres]);
    }
    if (assignedAuthorities.length) {
      const vals = assignedAuthorities.map((_, i) => `($1, $${i + 2})`).join(", ");
      await query(`INSERT INTO user_authorities (user_id, authority_code) VALUES ${vals} ON CONFLICT DO NOTHING`, [uid, ...assignedAuthorities]);
    }
    if (assignedOrgs.length) {
      // модератор нового пользователя делает member; admin — member (роль в узле повышает отдельно)
      const orgRole = role === "moderator" ? "moderator" : "member";
      const vals = assignedOrgs.map((_, i) => `($1, $${i + 2}, '${orgRole}')`).join(", ");
      await query(`INSERT INTO user_orgs (user_id, org_id, org_role) VALUES ${vals} ON CONFLICT DO NOTHING`, [uid, ...assignedOrgs]);
    }
  }

  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,$2,$3)",
    [user!.id, "create_user", JSON.stringify({ created_username: username, role, assigned_orgs: assignedOrgs })]);

  return NextResponse.json({ user: { ...result.rows[0], assigned_spheres: assignedSpheres, assigned_authorities: assignedAuthorities, assigned_org_ids: assignedOrgs } }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  await initDB();
  const m = await requireManager();
  if (m.err) return m.err;
  const body = await req.json();
  const { userId, isActive } = body;
  if (!userId || typeof isActive !== "boolean") return NextResponse.json({ error: "userId и isActive обязательны" }, { status: 400 });
  if (userId === m.user!.id && !isActive) return NextResponse.json({ error: "Нельзя деактивировать свой аккаунт" }, { status: 400 });

  // модератор — только пользователи своего поддерева
  if (!m.isAdmin) {
    const inScope = await query("SELECT 1 FROM user_orgs WHERE user_id=$1 AND org_id = ANY($2::int[]) LIMIT 1", [userId, m.scope]);
    if (!inScope.rows.length) return NextResponse.json({ error: "Пользователь вне вашего поддерева" }, { status: 403 });
  }
  await query("UPDATE users SET is_active = $1 WHERE id = $2", [isActive, userId]);
  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,$2,$3)",
    [m.user!.id, "toggle_user", JSON.stringify({ target_user_id: userId, is_active: isActive })]);
  return NextResponse.json({ ok: true });
}
