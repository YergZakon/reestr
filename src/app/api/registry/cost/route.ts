import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// стоимость считается на лету во вьюхе v_requirement_cost из cost_params + oked_section.wage_month,
// поэтому смена параметров органом пересчитывает все цифры мгновенно (без compute_cost.py).
const ACTIVE = `rr.is_canonical AND NOT COALESCE(rr.excluded, false) AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу') AND rr.time_hours IS NOT NULL`;
const VC = `JOIN v_requirement_cost vc ON vc.id = rr.id`;

/**
 * GET /api/registry/cost — сводка регуляторной нагрузки для госоргана.
 * Метрика — стоимость НА ОДНОГО СУБЪЕКТА (₸/год). Глобальное «×население» НЕ суммируем
 * (двойной счёт по 72k требований). Плюс стоимость проверки: для бизнеса (сопровождение)
 * и для государства (часы × ₸/час проверки — настраивается органом).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const totals = await query(`
    SELECT COUNT(*) AS n,
           ROUND(AVG(vc.cost_per_entity)) AS avg_entity,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vc.cost_per_entity)) AS median_entity,
           COUNT(*) FILTER (WHERE rr.external_cost_kzt > 0) AS with_external,
           COUNT(*) FILTER (WHERE vc.insp_biz > 0) AS with_inspection,
           ROUND(AVG(vc.inspection_cost_biz) FILTER (WHERE vc.insp_biz > 0)) AS avg_insp_biz,
           ROUND(AVG(vc.inspection_cost_gov) FILTER (WHERE vc.insp_biz > 0)) AS avg_insp_gov,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vc.inspection_cost_gov)
                 FILTER (WHERE vc.insp_biz > 0)) AS median_insp_gov
    FROM requirement_registry rr ${VC} WHERE ${ACTIVE}`);

  // средняя стоимость одного требования по органу/сфере (₸/субъект/год) — сравнение «дороговизны» норм
  const byMinistry = await query(`
    SELECT rr.ministry, ROUND(AVG(vc.cost_per_entity))::numeric AS burden, COUNT(*) AS n
    FROM requirement_registry rr ${VC} WHERE ${ACTIVE} AND rr.ministry IS NOT NULL
    GROUP BY rr.ministry ORDER BY burden DESC LIMIT 25`);

  const bySphere = await query(`
    SELECT s.name_ru AS sphere, ROUND(AVG(vc.cost_per_entity))::numeric AS burden, COUNT(*) AS n
    FROM requirement_registry rr ${VC} LEFT JOIN spheres s ON s.code = rr.sphere_code
    WHERE ${ACTIVE} GROUP BY s.name_ru ORDER BY burden DESC LIMIT 25`);

  const top = await query(`
    SELECT rr.id, rr.ngr, rr.npa_title, rr.article, rr.ministry, rr.sphere_code, s.name_ru AS sphere_name,
           COALESCE(NULLIF(rr.title,''), rr.action) AS title, rr.canon_text, rr.legal_text,
           rr.subject, rr.action, rr.object, rr.condition, rr.stages, rr.okeds,
           rr.action_type, rr.time_hours, rr.frequency_per_year, rr.staff_role,
           rr.external_cost_kzt, rr.inspection_hours_biz,
           ROUND(vc.cost_per_entity) AS cost_per_entity_kzt,
           ROUND(vc.inspection_cost_biz) AS inspection_cost_biz,
           ROUND(vc.inspection_cost_gov) AS inspection_cost_gov
    FROM requirement_registry rr ${VC} LEFT JOIN spheres s ON s.code = rr.sphere_code
    WHERE ${ACTIVE} ORDER BY vc.cost_per_entity DESC LIMIT 50`);

  const p = await query(`SELECT hours_per_month, on_costs, overhead, mult_clerical, mult_specialist,
    mult_manager, inspector_rate_kzt, avg_wage_month FROM cost_params WHERE id=1`);

  const t = totals.rows[0];
  return NextResponse.json({
    count: Number(t.n),
    avgPerEntity: Number(t.avg_entity),
    medianPerEntity: Number(t.median_entity),
    withExternal: Number(t.with_external),
    withInspection: Number(t.with_inspection),
    avgInspBiz: Number(t.avg_insp_biz),
    avgInspGov: Number(t.avg_insp_gov),
    medianInspGov: Number(t.median_insp_gov),
    inspectorRate: Number(p.rows[0]?.inspector_rate_kzt ?? 4197),
    params: p.rows[0] || null,
    byMinistry: byMinistry.rows,
    bySphere: bySphere.rows,
    top: top.rows,
  });
}
