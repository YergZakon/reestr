/**
 * PUT /api/admin/users/:id/spheres
 *
 * Перезаписывает список назначенных сфер для пользователя.
 * Body: { assigned_spheres: string[] }
 *
 * Логика — транзакция:
 *   DELETE FROM user_spheres WHERE user_id = $id
 *   INSERT INTO user_spheres (user_id, sphere_code) VALUES ... ON CONFLICT DO NOTHING
 *
 * Доступно только админу.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import pool, { query } from "@/lib/db";
import { zbody, SpheresAssignBody } from "@/lib/validate";

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

  const vb = await zbody(req, SpheresAssignBody);
  if (!vb.ok) return vb.res;
  const assignedSpheres = vb.data.assigned_spheres;

  // Проверим что target-юзер существует
  const targetUser = await query(
    "SELECT id, username, role FROM users WHERE id = $1",
    [userId],
  );
  if (targetUser.rows.length === 0) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  // Валидация sphere_code (отсеиваем несуществующие)
  if (assignedSpheres.length > 0) {
    const validation = await query(
      "SELECT code FROM spheres WHERE code = ANY($1::text[])",
      [assignedSpheres],
    );
    const validCodes = new Set(validation.rows.map((r) => r.code));
    const invalid = assignedSpheres.filter((s: string) => !validCodes.has(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Неизвестные sphere_code: " + invalid.join(", ") },
        { status: 400 },
      );
    }
  }

  // Транзакция: вычистить существующие, вставить новые
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_spheres WHERE user_id = $1", [userId]);
    if (assignedSpheres.length > 0) {
      const values = assignedSpheres
        .map((_: string, i: number) => `($1, $${i + 2})`)
        .join(", ");
      await client.query(
        `INSERT INTO user_spheres (user_id, sphere_code) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [userId, ...assignedSpheres],
      );
    }
    await client.query(
      "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
      [
        user.id,
        "user_spheres_updated",
        JSON.stringify({
          target_user_id: userId,
          target_username: targetUser.rows[0].username,
          assigned_spheres: assignedSpheres,
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
    assigned_spheres: assignedSpheres,
  });
}
