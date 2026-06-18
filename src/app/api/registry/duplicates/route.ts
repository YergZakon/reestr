import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Дубли. Группа УТОЧНЕНА до (dup_group_id, sphere_code): семантический кластер по тексту
// разводится по секторам, поэтому процедурно похожие действия из разных сфер
// (напр. «подать заявление» на разные лицензии в разных отраслях) больше не считаются дублем —
// дубль = одно и то же обязательство в одном секторе, в т.ч. от разных органов (цель гильотины).
const BASE = `rr.dup_group_id IS NOT NULL AND NOT COALESCE(rr.excluded,false)
  AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`;

/**
 * GET /api/registry/duplicates?cross=1            — уточнённые группы (cross=1 → только кросс-орган)
 * GET /api/registry/duplicates?group=<dupid|sphere> — требования конкретной уточнённой группы
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const group = sp.get("group");

  if (group) {
    const [dupid, ...rest] = group.split("|");
    const sphere = rest.join("|");
    const r = await query(`
      SELECT rr.id, rr.ngr, rr.npa_title, rr.article, rr.ministry, rr.sphere_code,
             s.name_ru AS sphere_name, rr.is_canonical, rr.review_status,
             COALESCE(NULLIF(rr.title,''), rr.action) AS title, rr.canon_text, rr.legal_text,
             rr.subject, rr.object, ROUND(vc.cost_per_entity) AS cost_per_entity_kzt
      FROM requirement_registry rr
      LEFT JOIN spheres s ON s.code = rr.sphere_code
      LEFT JOIN v_requirement_cost vc ON vc.id = rr.id
      WHERE rr.dup_group_id = $1 AND COALESCE(rr.sphere_code,'') = $2 AND NOT COALESCE(rr.excluded,false)
      ORDER BY rr.is_canonical DESC, vc.cost_per_entity DESC NULLS LAST`, [dupid, sphere]);
    return NextResponse.json({ items: r.rows });
  }

  const cross = sp.get("cross") === "1";
  const having = cross ? "HAVING COUNT(*) > 1 AND COUNT(DISTINCT rr.ministry) > 1" : "HAVING COUNT(*) > 1";
  const r = await query(`
    SELECT rr.dup_group_id || '|' || COALESCE(rr.sphere_code,'') AS gid,
           MAX(rr.sphere_code) AS sphere_code, MAX(s.name_ru) AS sphere_name,
           COUNT(*) AS size, COUNT(DISTINCT rr.ministry) AS organs,
           ARRAY_AGG(DISTINCT rr.ministry) FILTER (WHERE rr.ministry IS NOT NULL) AS ministries,
           MAX(CASE WHEN rr.is_canonical THEN COALESCE(NULLIF(rr.title,''), rr.action) END) AS canon_title,
           COALESCE(SUM(CASE WHEN NOT rr.is_canonical THEN ROUND(vc.cost_per_entity) ELSE 0 END),0)::numeric AS potential_saving
    FROM requirement_registry rr
    LEFT JOIN spheres s ON s.code = rr.sphere_code
    LEFT JOIN v_requirement_cost vc ON vc.id = rr.id
    WHERE ${BASE}
    GROUP BY rr.dup_group_id, rr.sphere_code
    ${having}
    ORDER BY ${cross ? "organs DESC, size DESC" : "size DESC"}
    LIMIT 200`);

  // статистика по уточнённым группам + сколько кросс-секторных склеек разведено
  const stats = await query(`
    WITH refined AS (
      SELECT rr.dup_group_id, rr.sphere_code, COUNT(*) c, COUNT(DISTINCT rr.ministry) o
      FROM requirement_registry rr WHERE ${BASE}
      GROUP BY rr.dup_group_id, rr.sphere_code HAVING COUNT(*) > 1
    ),
    raw_cross AS (
      SELECT rr.dup_group_id
      FROM requirement_registry rr WHERE ${BASE}
      GROUP BY rr.dup_group_id HAVING COUNT(*) > 1 AND COUNT(DISTINCT rr.ministry) > 1
    )
    SELECT COALESCE(SUM(c - 1), 0) AS dup_count, COUNT(*) AS groups,
           COUNT(*) FILTER (WHERE o > 1) AS cross_groups,
           (SELECT COUNT(*) FROM raw_cross) AS raw_cross_groups
    FROM refined`);

  const st = stats.rows[0];
  return NextResponse.json({
    groups: r.rows,
    totalDuplicates: Number(st.dup_count),
    totalGroups: Number(st.groups),
    crossGroups: Number(st.cross_groups),
    rawCrossGroups: Number(st.raw_cross_groups),
  });
}
