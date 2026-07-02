import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { escapeLike } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET /api/business/okved?q= — поиск вида деятельности (ОКЭД) для автокомплита.
 * Матч по коду (префикс) или названию. Возвращает code, name_ru, section, section_name.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ okveds: [] });

  const params: unknown[] = [];
  let where: string;
  if (/^\d+$/.test(q)) {
    params.push(q + "%");
    where = `d.code LIKE $1`;
  } else {
    params.push(`%${escapeLike(q)}%`);
    where = `d.name_ru ILIKE $1`;
  }

  const res = await query(`
    SELECT d.code, d.name_ru, d.section, os.name_ru AS section_name
    FROM oked_dict d
    LEFT JOIN oked_section os ON os.section = d.section
    WHERE ${where} AND d.section IS NOT NULL
    ORDER BY length(d.code), d.code
    LIMIT 25
  `, params);
  return NextResponse.json({ okveds: res.rows });
}
