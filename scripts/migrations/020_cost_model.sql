-- 020_cost_model.sql — cost-management по Standard Cost Model (SCM)
-- Применяется: scripts/registry/classify_burden.py (оценка) + compute_cost.py (расчёт).
-- DDL продублирован в скриптах.

-- Поля нагрузки (часть оценивает DeepSeek по тексту, часть — расчёт/орган)
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS action_type TEXT;          -- report|record|permit|equipment|training|payment|process|other
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS time_hours NUMERIC;         -- время на 1 исполнение, ч
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS frequency_per_year NUMERIC; -- раз/год (разово ≈ 0.2)
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS staff_role TEXT;            -- clerical|specialist|manager
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS external_cost_kzt NUMERIC;  -- пошлины + услуги третьих лиц, ₸
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS inspection_hours_biz NUMERIC; -- часы сопровождения проверки бизнесом
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS compliance_rate NUMERIC DEFAULT 1; -- доля соблюдающих
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS cost_estimate_source TEXT;  -- 'llm' | 'manual'
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS cost_overridden BOOLEAN DEFAULT false; -- орган правил вручную
-- расчётные (compute_cost.py)
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS cost_per_entity_kzt NUMERIC; -- ₸/год на одного субъекта
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS total_burden_kzt NUMERIC;    -- ₸/год суммарно по субъектам

CREATE INDEX IF NOT EXISTS rr_total_burden ON requirement_registry (total_burden_kzt DESC NULLS LAST);

-- Настраиваемые параметры расчёта (одна строка id=1)
CREATE TABLE IF NOT EXISTS cost_params (
    id              INT PRIMARY KEY DEFAULT 1,
    hours_per_month NUMERIC NOT NULL DEFAULT 160,
    on_costs        NUMERIC NOT NULL DEFAULT 0.175,   -- соц.отчисления работодателя
    overhead        NUMERIC NOT NULL DEFAULT 0.30,    -- накладные
    mult_clerical   NUMERIC NOT NULL DEFAULT 0.8,
    mult_specialist NUMERIC NOT NULL DEFAULT 1.0,
    mult_manager    NUMERIC NOT NULL DEFAULT 1.4,
    inspector_rate_kzt NUMERIC NOT NULL DEFAULT 4197, -- ₸/час проверки (государство), орган правит
    avg_wage_month  NUMERIC NOT NULL DEFAULT 461486,  -- fallback средняя зарплата РК
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO cost_params (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Зарплата по секциям ОКЭД (БНС) — добавляется в oked_section
ALTER TABLE oked_section ADD COLUMN IF NOT EXISTS wage_month NUMERIC;
