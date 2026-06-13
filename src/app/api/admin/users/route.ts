import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { query, initDB } from "@/lib/db";

export async function GET() {
  await initDB();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const result = await query(
    `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at,
            COALESCE(
              (SELECT array_agg(sphere_code) FROM user_spheres WHERE user_id = u.id),
              '{}'
            ) AS assigned_spheres,
            COALESCE(
              (SELECT array_agg(authority_code) FROM user_authorities WHERE user_id = u.id),
              '{}'
            ) AS assigned_authorities
     FROM users u
     ORDER BY u.id`
  );

  return NextResponse.json({ users: result.rows });
}

export async function POST(req: NextRequest) {
  await initDB();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = await req.json();
  const { username, password, fullName, role } = body;
  const assignedSpheres: string[] = Array.isArray(body.assigned_spheres)
    ? body.assigned_spheres
    : [];
  const assignedAuthorities: string[] = Array.isArray(body.assigned_authorities)
    ? body.assigned_authorities
    : [];

  if (!username || !password) {
    return NextResponse.json({ error: "Логин и пароль обязательны" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
  }
  if (role && !["admin", "expert"].includes(role)) {
    return NextResponse.json({ error: "Роль должна быть admin или expert" }, { status: 400 });
  }

  // Валидация sphere_code если переданы
  if (assignedSpheres.length > 0) {
    const validation = await query(
      "SELECT code FROM spheres WHERE code = ANY($1::text[])",
      [assignedSpheres],
    );
    const validCodes = new Set(validation.rows.map((r) => r.code));
    const invalid = assignedSpheres.filter((s) => !validCodes.has(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Неизвестные sphere_code: " + invalid.join(", ") },
        { status: 400 },
      );
    }
  }

  // Валидация authority_code если переданы
  if (assignedAuthorities.length > 0) {
    const validation = await query(
      "SELECT code FROM authorities WHERE code = ANY($1::text[])",
      [assignedAuthorities],
    );
    const validCodes = new Set(validation.rows.map((r) => r.code));
    const invalid = assignedAuthorities.filter((s) => !validCodes.has(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Неизвестные authority_code: " + invalid.join(", ") },
        { status: 400 },
      );
    }
  }

  // Check uniqueness
  const existing = await query("SELECT id FROM users WHERE username = $1", [username]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "Пользователь с таким логином уже существует" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, full_name, role, is_active, created_at`,
    [username, passwordHash, fullName || null, role || "expert"]
  );

  const newUserId = result.rows[0].id;

  // Привязка к сферам и органам (только для experts; admin не имеет ограничений)
  if ((role || "expert") === "expert") {
    if (assignedSpheres.length > 0) {
      const values = assignedSpheres.map((_, i) => `($1, $${i + 2})`).join(", ");
      await query(
        `INSERT INTO user_spheres (user_id, sphere_code) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [newUserId, ...assignedSpheres],
      );
    }
    if (assignedAuthorities.length > 0) {
      const values = assignedAuthorities.map((_, i) => `($1, $${i + 2})`).join(", ");
      await query(
        `INSERT INTO user_authorities (user_id, authority_code) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [newUserId, ...assignedAuthorities],
      );
    }
  }

  // Log activity
  await query(
    "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
    [
      user.id,
      "create_user",
      JSON.stringify({
        created_username: username,
        role: role || "expert",
        assigned_spheres: assignedSpheres,
        assigned_authorities: assignedAuthorities,
      }),
    ]
  );

  return NextResponse.json(
    {
      user: {
        ...result.rows[0],
        assigned_spheres: assignedSpheres,
        assigned_authorities: assignedAuthorities,
      },
    },
    { status: 201 },
  );
}

export async function PUT(req: NextRequest) {
  await initDB();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = await req.json();
  const { userId, isActive } = body;

  if (!userId || typeof isActive !== "boolean") {
    return NextResponse.json({ error: "userId и isActive обязательны" }, { status: 400 });
  }

  // Prevent self-deactivation
  if (userId === user.id && !isActive) {
    return NextResponse.json({ error: "Нельзя деактивировать свой аккаунт" }, { status: 400 });
  }

  await query("UPDATE users SET is_active = $1 WHERE id = $2", [isActive, userId]);

  // Log activity
  await query(
    "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
    [user.id, "toggle_user", JSON.stringify({ target_user_id: userId, is_active: isActive })]
  );

  return NextResponse.json({ ok: true });
}
