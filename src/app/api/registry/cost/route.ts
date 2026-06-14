import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ACTIVE = `rr.is_canonical AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу') AND rr.cost_per_entity_kzt IS NOT NULL`;

/**
 * GET /api/registry/cost — сводка регуляторной нагрузки для госоргана.
 * Метрика — стоимость НА ОДНОГО СУБЪЕКТА (₸/год): сумма cost_per_entity по требованиям.
 * Глобальное «×население» НЕ суммируем (двойной счёт по 72k требований).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const totals = await query(`
    SELECT COUNT(*) AS n,
           ROUND(AVG(rr.cost_per_entity_kzt)) AS avg_entity,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rr.cost_per_entity_kzt)) AS median_entity,
           COUNT(*) FILTER (WHERE rr.external_cost_kzt > 0) AS with_external
    FROM requirement_registry rr WHERE ${ACTIVE}`);

  // средняя стоимость одного требования по органу/сфере (₸/субъект/год) — сравнение «дороговизны» норм
  const byMinistry = await query(`
    SELECT rr.ministry, ROUND(AVG(rr.cost_per_entity_kzt))::numeric AS burden, COUNT(*) AS n
    FROM requirement_registry rr WHERE ${ACTIVE} AND rr.ministry IS NOT NULL
    GROUP BY rr.ministry ORDER BY burden DESC LIMIT 25`);

  const bySphere = await query(`
    SELECT s.name_ru AS sphere, ROUND(AVG(rr.cost_per_entity_kzt))::numeric AS burden, COUNT(*) AS n
    FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
    WHERE ${ACTIVE} GROUP BY s.name_ru ORDER BY burden DESC LIMIT 25`);

  const top = await query(`
    SELECT rr.id, rr.ngr, rr.npa_title, rr.article, rr.ministry, rr.sphere_code, s.name_ru AS sphere_name,
           COALESCE(NULLIF(rr.title,''), rr.action) AS title, rr.canon_text, rr.legal_text,
           rr.subject, rr.action, rr.object, rr.condition, rr.stages, rr.okeds,
           rr.action_type, rr.time_hours, rr.frequency_per_year, rr.staff_role,
           rr.external_cost_kzt, rr.cost_per_entity_kzt
    FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
    WHERE ${ACTIVE} ORDER BY rr.cost_per_entity_kzt DESC LIMIT 50`);

  const p = await query(`SELECT inspector_rate_kzt FROM cost_params WHERE id=1`);

  return NextResponse.json({
    count: Number(totals.rows[0].n),
    avgPerEntity: Number(totals.rows[0].avg_entity),
    medianPerEntity: Number(totals.rows[0].median_entity),
    withExternal: Number(totals.rows[0].with_external),
    inspectorRate: Number(p.rows[0]?.inspector_rate_kzt ?? 4197),
    byMinistry: byMinistry.rows,
    bySphere: bySphere.rows,
    top: top.rows,
  });
}
