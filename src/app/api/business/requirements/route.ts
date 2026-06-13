import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FIELDS = `
  rr.id, rr.ngr, rr.npa_title, rr.article, rr.ministry, rr.sphere_code,
  rr.okeds, rr.stages, rr.title, rr.legal_text, rr.canon_text,
  rr.subject, rr.action, rr.object, rr.condition, rr.scope, rr.sections,
  rr.triggers, rr.is_permit, s.name_ru AS sphere_name`;
const ACTIVE = `rr.is_canonical AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`;

/**
 * GET /api/business/requirements
 *   ?oked=4520 | ?section=G  [&triggers=food,employees,cash]   — персонализированный отчёт:
 *       permits (что оформить) + sectoral (отраслевые по стадиям) + horizontalGroups (общие)
 *       Всё отфильтровано опросником: базовые (пустые triggers) всегда + активированные.
 *   ?horizontalSphere=tax [&triggers=…]  — ленивая подгрузка общих требований сферы
 *
 * Применимость требования: triggers пусто/NULL (базовое) ИЛИ пересекает активные теги T.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const T = (sp.get("triggers") || "").split(",").map((s) => s.trim()).filter(Boolean);

  // SQL-фрагмент применимости: базовое (пусто) всегда; условное — если пересекает T.
  // Возвращает условие и пушит параметр T (если есть) в params.
  const applic = (params: unknown[]) => {
    if (T.length) {
      params.push(T);
      return `(rr.triggers IS NULL OR cardinality(rr.triggers) = 0 OR rr.triggers && $${params.length}::text[])`;
    }
    return `(rr.triggers IS NULL OR cardinality(rr.triggers) = 0)`;
  };

  // path=expand (расширение действующего бизнеса) — исключаем уже пройденную базовую регистрацию
  const path = sp.get("path");
  const expandCut = path === "expand" ? " AND NOT ('registration' = ANY(rr.stages) AND rr.scope = 'horizontal')" : "";

  // ── Ленивая подгрузка общих требований одной сферы ──
  const horizontalSphere = sp.get("horizontalSphere");
  if (horizontalSphere) {
    const params: unknown[] = [horizontalSphere];
    const ap = applic(params);
    const r = await query(
      `SELECT ${FIELDS} FROM requirement_registry rr
       LEFT JOIN spheres s ON s.code = rr.sphere_code
       WHERE ${ACTIVE} AND rr.scope = 'horizontal' AND COALESCE(rr.is_permit,false) = false
         AND rr.sphere_code = $1 AND ${ap}${expandCut}
       ORDER BY rr.id LIMIT 800`,
      params
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
      `SELECT section, name_ru FROM oked_dict WHERE code = ANY($1) AND section IS NOT NULL
       ORDER BY length(code) DESC LIMIT 1`, [prefixes]);
    if (r.rows[0]) { section = r.rows[0].section; okedName = r.rows[0].name_ru; }
  }
  if (oked && !okedName) {
    const r = await query(`SELECT name_ru FROM oked_dict WHERE code = $1`, [oked]);
    okedName = r.rows[0]?.name_ru ?? null;
  }
  const sectionName = section
    ? (await query(`SELECT name_ru FROM oked_section WHERE section = $1`, [section])).rows[0]?.name_ru ?? null
    : null;

  // Релевантные ОТРАСЛЕВЫЕ сферы для выбранного ОКЭД (карта сфера→ОКЭД-охват в spheres).
  // Точнее буквы-секции: детсад 8510→education_general, ВУЗ 8542→mnvo.
  let relSpheres: string[] = [];
  if (oked) {
    const r = await query(
      `SELECT code FROM spheres WHERE NOT COALESCE(is_horizontal,false) AND oked_prefixes IS NOT NULL
         AND EXISTS (SELECT 1 FROM unnest(oked_prefixes) p WHERE $1 LIKE p || '%')`, [oked]);
    relSpheres = r.rows.map((x: { code: string }) => x.code);
  }
  const useSpheres = !!oked && relSpheres.length > 0;

  // условие «относится к выбранному виду деятельности» (для отраслевых):
  // по карте сфер (если выбран ОКЭД) либо по букве-секции (если выбрана секция-плитка).
  const sectoralRel = (params: unknown[]) => {
    if (useSpheres) { params.push(relSpheres); return `rr.sphere_code = ANY($${params.length}::text[])`; }
    if (section) { params.push(section); return `$${params.length} = ANY(rr.sections)`; }
    return "false";
  };

  // ── Что оформить (permits): разрешительные, релевантные, применимые ──
  let permits: unknown[] = [];
  {
    const params: unknown[] = [];
    const sr = sectoralRel(params);
    const ap = applic(params);
    const r = await query(
      `SELECT ${FIELDS} FROM requirement_registry rr
       LEFT JOIN spheres s ON s.code = rr.sphere_code
       WHERE ${ACTIVE} AND COALESCE(rr.is_permit,false) = true AND (rr.scope = 'horizontal' OR ${sr}) AND ${ap}${expandCut}
       ORDER BY rr.ministry NULLS LAST, rr.id LIMIT 400`,
      params
    );
    permits = r.rows;
  }

  // ── Отраслевой чек-лист (non-permit sectoral) ──
  let sectoral: unknown[] = [];
  let sectoralTotal = 0;
  if (useSpheres || section) {
    const cParams: unknown[] = [];
    const cSr = sectoralRel(cParams);
    const cAp = applic(cParams);
    const cnt = await query(
      `SELECT count(*) AS n FROM requirement_registry rr
       WHERE ${ACTIVE} AND rr.scope = 'sectoral' AND COALESCE(rr.is_permit,false) = false
         AND ${cSr} AND ${cAp}${expandCut}`, cParams);
    sectoralTotal = parseInt(cnt.rows[0].n, 10);

    const params: unknown[] = [];
    const sr = sectoralRel(params);
    const ap = applic(params);
    const r = await query(
      `SELECT ${FIELDS} FROM requirement_registry rr
       LEFT JOIN spheres s ON s.code = rr.sphere_code
       WHERE ${ACTIVE} AND rr.scope = 'sectoral' AND COALESCE(rr.is_permit,false) = false
         AND ${sr} AND ${ap}${expandCut}
       ORDER BY rr.ministry NULLS LAST, rr.id LIMIT 2000`, params);
    sectoral = r.rows;
  }

  // ── Общие (non-permit horizontal) — сводка по сферам ──
  const hgParams: unknown[] = [];
  const hgAp = applic(hgParams);
  const hg = await query(
    `SELECT rr.sphere_code, s.name_ru, count(*)::int AS n
     FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
     WHERE ${ACTIVE} AND rr.scope = 'horizontal' AND COALESCE(rr.is_permit,false) = false AND ${hgAp}${expandCut}
     GROUP BY rr.sphere_code, s.name_ru ORDER BY n DESC`,
    hgParams
  );

  return NextResponse.json({
    oked: oked || null, okedName, section: section || null, sectionName,
    permits, sectoral, sectoralTotal, horizontalGroups: hg.rows,
  });
}
