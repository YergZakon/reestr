/**
 * GET /api/spheres
 *
 * Список всех сфер (для дропдаунов и UI). Доступен любому залогиненному.
 *
 * Response: [{ code, name, is_mvp, card_count }]
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const result = await query(`
    SELECT s.code,
           s.name_ru AS name,
           s.is_mvp,
           COUNT(rc.id) FILTER (WHERE rc.is_canonical = true) AS card_count
    FROM spheres s
    LEFT JOIN requirement_cards rc ON rc.sphere_code = s.code
    GROUP BY s.code, s.name_ru, s.is_mvp
    ORDER BY card_count DESC, s.code
  `);

  return NextResponse.json({
    spheres: result.rows.map((r) => ({
      code: r.code,
      name: r.name,
      is_mvp: r.is_mvp,
      card_count: parseInt(r.card_count, 10),
    })),
  });
}
