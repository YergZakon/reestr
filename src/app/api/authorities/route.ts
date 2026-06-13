/**
 * GET /api/authorities
 *
 * Список ведомств с card_count для дропдаунов и UI. Доступен любому залогиненному.
 *
 * Response: { authorities: [{ code, name_ru, short_name, card_count }] }
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const result = await query(`
    SELECT a.code,
           a.name_ru AS name,
           a.short_name,
           COUNT(rc.id) FILTER (WHERE rc.is_canonical = true) AS card_count
    FROM authorities a
    LEFT JOIN requirement_cards rc ON rc.controller_authority = a.code
    GROUP BY a.code, a.name_ru, a.short_name
    ORDER BY card_count DESC, a.code
  `);

  return NextResponse.json({
    authorities: result.rows.map((r) => ({
      code: r.code,
      name: r.name,
      short_name: r.short_name,
      card_count: parseInt(r.card_count, 10),
    })),
  });
}
