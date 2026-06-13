-- 015_business.sql — данные бизнес-части реестра
-- Справочники ОКЭД/секций + классификация scope требований.
-- Применяется скриптом scripts/registry/build_business_dicts.py (DDL продублирован там).

-- ─── Справочник ОКЭД (для поиска/автокомплита) ───────────────────────
CREATE TABLE IF NOT EXISTS oked_dict (
    code        TEXT PRIMARY KEY,          -- 5-знач код NACE без точек (или короче — раздел/группа)
    name_ru     TEXT NOT NULL,
    section     CHAR(1),                   -- секция A..S (по диапазонам oked_id + NACE-fallback)
    par_code    TEXT,                      -- родительский код (иерархия)
    oked_id     INT                        -- внутренний id ЕРСОП d_oked (для отладки соответствия)
);
CREATE INDEX IF NOT EXISTS oked_dict_section ON oked_dict (section);
CREATE INDEX IF NOT EXISTS oked_dict_name ON oked_dict USING gin (to_tsvector('russian', name_ru));

-- ─── Справочник секций-отраслей (18: A..S без госсектора O/T) ─────────
CREATE TABLE IF NOT EXISTS oked_section (
    section          CHAR(1) PRIMARY KEY,
    name_ru          TEXT NOT NULL,         -- короткое имя для UI
    biz_total        INT,                   -- число субъектов бизнеса в секции
    biz_small        INT,
    biz_medium       INT,
    biz_individual   INT,
    biz_farming      INT,
    workers_thousands NUMERIC(8,1)          -- занятых, тыс. чел.
);

-- ─── Курируемая привязка отраслевая сфера → ОКЭД (из docx Минэка) ─────
CREATE TABLE IF NOT EXISTS sphere_oked (
    id          SERIAL PRIMARY KEY,
    sphere_docx TEXT NOT NULL,             -- Транспорт / Торговля / Здравоохранение / ...
    section     CHAR(1),
    oked_code   TEXT NOT NULL,             -- префикс ОКЭД (2-5 знаков)
    oked_name_ru TEXT
);
CREATE INDEX IF NOT EXISTS sphere_oked_code ON sphere_oked (oked_code);
CREATE INDEX IF NOT EXISTS sphere_oked_sphere ON sphere_oked (sphere_docx);

-- ─── Классификация требований: горизонтальное / отраслевое ───────────
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS scope TEXT;          -- 'horizontal' | 'sectoral'
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS sections TEXT[];     -- релевантные секции A..S (для sectoral)
CREATE INDEX IF NOT EXISTS rr_scope ON requirement_registry (scope);
CREATE INDEX IF NOT EXISTS rr_sections ON requirement_registry USING gin (sections);
