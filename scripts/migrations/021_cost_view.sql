-- 021_cost_view.sql — расчёт стоимости требования НА ЛЕТУ.
-- Заменяет хранимые cost_per_entity_kzt/total_burden_kzt: смена любого параметра в
-- cost_params (час проверки, накладные, соц.отчисления, множители, зарплаты по секциям
-- в oked_section.wage_month) сразу отражается в выдаче без пересчёта скриптом.
-- Применяется: scripts/registry/create_cost_view.py. Используется: api/registry/cost.
--
-- tariff(роль,секция) = (зарплата_секции / часы_в_мес) × (1+соцотч) × (1+накладные) × множитель_роли
-- cost_per_entity ₸/год = (tariff × время_ч + внешние_расходы) × частота × доля_соблюдающих
-- inspection_cost_biz   = часы_сопровождения × tariff           (нагрузка проверки на бизнес)
-- inspection_cost_gov   = часы_сопровождения × ₸/час_проверки   (стоимость проверки государству)

CREATE OR REPLACE VIEW v_requirement_cost AS
SELECT
  t.id,
  t.wage,
  t.tariff,
  ((t.tariff * t.time_h + t.ext) * t.freq * t.comp) AS cost_per_entity,
  (t.insp_biz * t.tariff)                            AS inspection_cost_biz,
  (t.insp_biz * t.inspector_rate)                    AS inspection_cost_gov,
  t.time_h, t.freq, t.insp_biz
FROM (
  SELECT
    rr.id,
    COALESCE(os.wage_month, p.avg_wage_month) AS wage,
    (COALESCE(os.wage_month, p.avg_wage_month) / NULLIF(p.hours_per_month, 0))
      * (1 + p.on_costs) * (1 + p.overhead)
      * CASE rr.staff_role
          WHEN 'clerical' THEN p.mult_clerical
          WHEN 'manager'  THEN p.mult_manager
          ELSE p.mult_specialist
        END AS tariff,
    COALESCE(rr.time_hours, 0)           AS time_h,
    COALESCE(rr.external_cost_kzt, 0)    AS ext,
    COALESCE(rr.frequency_per_year, 1)   AS freq,
    COALESCE(rr.compliance_rate, 1)      AS comp,
    COALESCE(rr.inspection_hours_biz, 0) AS insp_biz,
    p.inspector_rate_kzt                 AS inspector_rate
  FROM requirement_registry rr
  CROSS JOIN cost_params p
  LEFT JOIN oked_section os ON os.section = rr.sections[1]
) t;
