-- ─────────────────────────────────────────────────────────────────────
-- Migration 004: Поле requirement_specificity
-- Date: 2026-04-30
--
-- Зачем: отделить КОНКРЕТНЫЕ операционные требования от РАМОЧНЫХ /
-- ОТСЫЛОЧНЫХ / ПРИНЦИПНЫХ. Все они формально остаются "обязанностью бизнеса"
-- по role_fragment, но на портале предпринимателя нужно показывать только
-- concrete — иначе маршрут заполняется бесполезным "обеспечить координацию",
-- "соблюдать требования к Х", "предотвращать ущерб".
--
-- Значения:
--   concrete    — конкретное действие с измеримым исполнением
--                 ("получить разрешение", "при t°>25 в холодильник", "≥500 мм")
--   framework   — рамочная обязанность, реализуемая через отдельные документы
--                 ("обеспечить координацию экипажа в аварии" → через План АГ)
--   referential — отсылочная норма ("соблюдать требования к Х", где Х — отдельная карточка)
--   principle   — декларация / принцип ("предотвращать ущерб окружающей среде")
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE requirement_cards
    ADD COLUMN IF NOT EXISTS requirement_specificity VARCHAR(20)
        CHECK (requirement_specificity IN ('concrete','framework','referential','principle')
               OR requirement_specificity IS NULL);

CREATE INDEX IF NOT EXISTS idx_card_specificity ON requirement_cards(requirement_specificity);

-- Помечаем 3 уже выявленные карточки
UPDATE requirement_cards SET requirement_specificity = 'framework'
 WHERE card_code = 'TREB-MVP-000012';   -- координация экипажа в аварии — реализуется через План АГ
UPDATE requirement_cards SET requirement_specificity = 'principle'
 WHERE card_code = 'TREB-MVP-000013';   -- спасатель и ущерб среде — декларация
UPDATE requirement_cards SET requirement_specificity = 'referential'
 WHERE card_code = 'TREB-MVP-000014';   -- "соблюдать требования к комплектованию" — отсылка

-- Все остальные пилотные carto помечаем concrete (по умолчанию для уже сгенерированных)
UPDATE requirement_cards
   SET requirement_specificity = 'concrete'
 WHERE requirement_specificity IS NULL
   AND role_fragment IN ('обязанность бизнеса','запрет','условие допуска',
                          'процедурная обязанность бизнеса',
                          'документ для заявления','доказательство исполнения');

-- Описательные нормы — оставляем NULL (для них специфика не применима)

-- Удобное представление: «настоящие» карточки для маршрута бизнеса
CREATE OR REPLACE VIEW v_business_route_cards AS
SELECT *
  FROM requirement_cards
 WHERE role_fragment IN ('обязанность бизнеса','запрет','условие допуска',
                          'документ для заявления','доказательство исполнения')
   AND requirement_specificity = 'concrete'
   AND is_canonical = TRUE;

COMMIT;
