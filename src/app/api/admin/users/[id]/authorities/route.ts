/**
 * PUT /api/admin/users/:id/authorities
 *
 * Перезаписывает список назначенных органов для пользователя.
 * Body: { assigned_authorities: string[] }
 *
 * Транзакция: DELETE + INSERT ... ON CONFLICT DO NOTHING.
 * Доступно только админу.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import pool, { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (!userId || isNaN(userId)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const body = await req.json();
  const assignedAuthorities = body.assigned_authorities;
  if (!Array.isArray(assignedAuthorities)) {
    return NextResponse.json(
      { error: "assigned_authorities должен быть массивом строк" },
      { status: 400 },
    );
  }

  // Целевой юзер существует?
  const targetUser = await query(
    "SELECT id, username, role FROM users WHERE id = $1",
    [userId],
  );
  if (targetUser.rows.length === 0) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  // Валидация authority_code
  if (assignedAuthorities.length > 0) {
    const validation = await query(
      "SELECT code FROM authorities WHERE code = ANY($1::text[])",
      [assignedAuthorities],
    );
    const validCodes = new Set(validation.rows.map((r) => r.code));
    const invalid = assignedAuthorities.filter((s: string) => !validCodes.has(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Неизвестные authority_code: " + invalid.join(", ") },
        { status: 400 },
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_authorities WHERE user_id = $1", [userId]);
    if (assignedAuthorities.length > 0) {
      const values = assignedAuthorities
        .map((_: string, i: number) => `($1, $${i + 2})`)
        .join(", ");
      await client.query(
        `INSERT INTO user_authorities (user_id, authority_code) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [userId, ...assignedAuthorities],
      );
    }
    await client.query(
      "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
      [
        user.id,
        "user_authorities_updated",
        JSON.stringify({
          target_user_id: userId,
          target_username: targetUser.rows[0].username,
          assigned_authorities: assignedAuthorities,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: "Ошибка обновления", details: String(e) },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    assigned_authorities: assignedAuthorities,
  });
}
