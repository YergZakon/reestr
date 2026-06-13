import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FIELDS = `
  rr.id, rr.ngr, rr.npa_title, rr.article, rr.ministry, rr.sphere_code,
  rr.okeds, rr.stages, rr.title, rr.legal_text, rr.canon_text,
  rr.subject, rr.action, rr.object, rr.condition, rr.scope, rr.sections,
  s.name_ru AS sphere_name`;
const ACTIVE = `rr.is_canonical AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`;

/**
 * GET /api/business/requirements
 *   ?oked=4520  | ?section=G                    — профиль вида деятельности:
 *       sectoral (отраслевые по секции) + horizontalGroups (сводка «общих» по сферам)
 *   ?horizontalSphere=tax                       — ленивая подгрузка общих требований сферы
 *
 * Горизонтальных требований ~12k — поэтому они отдаются сводкой по сферам,
 * а сами требования сферы подгружаются по клику.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;

  // ── Ленивая подгрузка общих требований одной сферы ──
  const horizontalSphere = sp.get("horizontalSphere");
  if (horizontalSphere) {
    const r = await query(
      `SELECT ${FIELDS} FROM requirement_registry rr
       LEFT JOIN spheres s ON s.code = rr.sphere_code
       WHERE ${ACTIVE} AND rr.scope = 'horizontal' AND rr.sphere_code = $1
       ORDER BY rr.id LIMIT 800`,
      [horizontalSphere]
    );
    return NextResponse.json({ items: r.rows });
  }

  // ── Профиль вида деятельности ──
  const oked = (sp.get("oked") || "").replace(/\./g, "").trim();
  let section = (sp.get("section") || "").trim().toUpperCase();
  let okedName: string | null = null;

  if (oked && !section) {
    const prefixes = [oked, oked.slice(0, 4), oked.slice(0, 3), oked.slice(0, 2)].filter((p) => p.length >= 2);
    const r = await query(
      `SELECT section, name_ru FROM oked_dict
       WHERE code = ANY($1) AND section IS NOT NULL
       ORDER BY length(code) DESC LIMIT 1`,
      [prefixes]
    );
    if (r.rows[0]) { section = r.rows[0].section; okedName = r.rows[0].name_ru; }
  }
  if (oked && !okedName) {
    const r = await query(`SELECT name_ru FROM oked_dict WHERE code = $1`, [oked]);
    okedName = r.rows[0]?.name_ru ?? null;
  }
  const sectionName = section
    ? (await query(`SELECT name_ru FROM oked_section WHERE section = $1`, [section])).rows[0]?.name_ru ?? null
    : null;

  // Отраслевые — по секции выбранного вида деятельности
  let sectoral: unknown[] = [];
  let sectoralTotal = 0;
  if (section) {
    const cnt = await query(
      `SELECT count(*) AS n FROM requirement_registry rr
       WHERE ${ACTIVE} AND rr.scope = 'sectoral' AND $1 = ANY(rr.sections)`,
      [section]
    );
    sectoralTotal = parseInt(cnt.rows[0].n, 10);
    const r = await query(
      `SELECT ${FIELDS} FROM requirement_registry rr
       LEFT JOIN spheres s ON s.code = rr.sphere_code
       WHERE ${ACTIVE} AND rr.scope = 'sectoral' AND $1 = ANY(rr.sections)
       ORDER BY rr.ministry NULLS LAST, rr.id
       LIMIT 2000`,
      [section]
    );
    sectoral = r.rows;
  }

  // Общие — сводка по сферам (требования подгружаются лениво)
  const hg = await query(
    `SELECT rr.sphere_code, s.name_ru, count(*)::int AS n
     FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
     WHERE ${ACTIVE} AND rr.scope = 'horizontal'
     GROUP BY rr.sphere_code, s.name_ru
     ORDER BY n DESC`
  );

  return NextResponse.json({
    oked: oked || null,
    okedName,
    section: section || null,
    sectionName,
    sectoral,
    sectoralTotal,
    horizontalGroups: hg.rows,
  });
}
