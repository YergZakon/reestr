-- ─────────────────────────────────────────────────────────────────────
-- Migration 005: 9 новых сфер для Haiku-импорта + npa_zan_haiku layer
-- Date: 2026-05-04
--
-- Добавляет sphere_codes для министерств РК (МЗ, МИИР, МНВО, МСХ, МТЗСН,
-- МТИ, МЦРИАП, МЧС, МЭ) сверх MVP (land/transport/ecology/other).
-- Расширяет source_layer CHECK для нового слоя 'npa_zan_haiku'.
--
-- Запуск:
--   psql $DATABASE_URL -f scripts/migrations/005_extend_spheres_haiku.sql
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── Новые сферы (9 министерств × сфера регулирования) ───────────────
INSERT INTO spheres (code, name_ru, is_mvp) VALUES
    ('mz_zdrav',          'МЗ — здравоохранение',              FALSE),
    ('mz_obshchepit',     'МЗ — общественное питание',         FALSE),
    ('miir_obrabotka',    'МИИР — обрабатывающая промышленность', FALSE),
    ('miir_transport',    'МИИР — транспорт',                  FALSE),
    ('mnvo',              'МНВО — наука и высшее образование', FALSE),
    ('msx',               'МСХ — сельское хозяйство',          FALSE),
    ('mtzsn_trud_otn',    'МТЗСН — трудовые отношения',        FALSE),
    ('mtzsn_trudoustr',   'МТЗСН — трудоустройство',           FALSE),
    ('mti_torgovlya',     'МТИ — внутренняя торговля',         FALSE),
    ('mtsriap',           'МЦРИАП — связь и информатизация',   FALSE),
    ('mchs',              'МЧС — гражданская защита',          FALSE),
    ('me_neft_uran',      'МЭ — нефть и уран',                 FALSE)
ON CONFLICT (code) DO NOTHING;

-- ─── Расширение source_layer для нового слоя 'npa_zan_haiku' ─────────
-- Сначала находим имя CHECK constraint (может отличаться)
DO $$
DECLARE
    c_name TEXT;
BEGIN
    SELECT conname INTO c_name
    FROM pg_constraint
    WHERE conrelid = 'source_fragments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%source_layer%';
    IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE source_fragments DROP CONSTRAINT %I', c_name);
    END IF;
END $$;

ALTER TABLE source_fragments
    ADD CONSTRAINT source_fragments_source_layer_check
    CHECK (source_layer IN (
        'rot_checklist',
        'services',
        'ml_dataset',
        'npa_extracted',
        'npa_zan_haiku'   -- новый слой: карточки извлечённые из MongoDB Zan через Claude Haiku 4.5
    ));

-- ─── Удобное представление: количество карточек по сферам ────────────
CREATE OR REPLACE VIEW v_cards_count_by_sphere AS
SELECT
    s.code AS sphere_code,
    s.name_ru AS sphere_name,
    s.is_mvp,
    COUNT(rc.id) AS cards_count,
    COUNT(rc.id) FILTER (WHERE rc.expert_status = 'approved') AS approved,
    COUNT(rc.id) FILTER (WHERE rc.expert_status = 'rejected') AS rejected,
    COUNT(rc.id) FILTER (WHERE rc.expert_status = 'unchecked') AS unchecked
FROM spheres s
LEFT JOIN requirement_cards rc ON rc.sphere_code = s.code
GROUP BY s.code, s.name_ru, s.is_mvp
ORDER BY cards_count DESC;

COMMIT;

-- Проверка: SELECT * FROM v_cards_count_by_sphere;
