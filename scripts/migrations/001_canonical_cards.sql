-- ─────────────────────────────────────────────────────────────────────
-- Migration 001: Canonical requirement cards (MVP по 3 сферам)
-- Date: 2026-04-29
-- Adds the schema needed for the 3-sphere MVP (земля, транспорт, экология):
--   - sphere, okved, condition_dict — справочники
--   - source_fragments — все исходные строки (4 слоя источников)
--   - service_to_sphere_map — маппинг услуг к 3 сферам
--   - requirement_cards — канонические карточки
--   - field_metadata — метаданные каждого поля
--   - npa_links, okved_links — привязки
--   - applicability_rules — машинно-исполняемые правила применимости
--   - duplicate_groups — группы дублей (3 уровня)
--   - burden_metrics — расчёт нагрузки
--   - scenarios, scenario_cards — готовые сценарии для портала предпринимателя
--   - batch_log — прогресс генерации карточек батчами в чате
--
-- Запуск:
--   psql $DATABASE_URL -f scripts/migrations/001_canonical_cards.sql
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Справочник сфер (3 для MVP, можно расширять) ─────────────────
CREATE TABLE IF NOT EXISTS spheres (
    code         VARCHAR(20) PRIMARY KEY,
    name_ru      TEXT NOT NULL,
    parent_code  VARCHAR(20) REFERENCES spheres(code),
    is_mvp       BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT NOW()
);

INSERT INTO spheres (code, name_ru, is_mvp) VALUES
    ('land',      'Земля и землепользование',         TRUE),
    ('transport', 'Транспорт',                          TRUE),
    ('ecology',   'Экология и природопользование',     TRUE),
    ('other',     'Прочие сферы',                       FALSE)
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Справочник ОКЭД (импортируется из regulatory-dashboard) ───────
CREATE TABLE IF NOT EXISTS okved (
    id              VARCHAR(10) PRIMARY KEY,
    name_ru         TEXT NOT NULL,
    section         CHAR(1),                         -- A..T (18 секций)
    section_name_ru TEXT,
    imported_from   VARCHAR(50) DEFAULT 'regulatory-dashboard',
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okved_section ON okved(section);

-- ─── 3. Справочник условий применимости (15 осей) ────────────────────
CREATE TABLE IF NOT EXISTS condition_dict (
    id          SERIAL PRIMARY KEY,
    axis        VARCHAR(50) NOT NULL,
    value       VARCHAR(100) NOT NULL,
    description TEXT,
    UNIQUE (axis, value)
);

INSERT INTO condition_dict (axis, value, description) VALUES
    ('subject_type',         'individual_entrepreneur',  'Индивидуальный предприниматель (ИП)'),
    ('subject_type',         'legal_entity_llp',         'ТОО / ООО'),
    ('subject_type',         'legal_entity_jsc',         'АО'),
    ('subject_type',         'farmer',                   'Крестьянское/фермерское хозяйство'),
    ('region',               'almaty',                   'г. Алматы'),
    ('region',               'astana',                   'г. Астана'),
    ('region',               'shymkent',                 'г. Шымкент'),
    ('region',               'oblast',                   'Любая область'),
    ('has_premises',         'yes',                      'Есть помещение/объект'),
    ('has_premises',         'no',                       'Нет помещения'),
    ('has_workers',          'yes',                      'Есть наёмные работники'),
    ('has_workers',          'no',                       'Нет наёмных работников'),
    ('hazardous_substances', 'yes',                      'Оборот опасных веществ'),
    ('hazardous_substances', 'no',                       'Без опасных веществ'),
    ('waste_handling',       'hazardous',                'Опасные отходы'),
    ('waste_handling',       'non_hazardous',            'Неопасные отходы'),
    ('waste_handling',       'none',                     'Без обращения с отходами'),
    ('emissions',            'yes',                      'Выбросы в атмосферу'),
    ('emissions',            'no',                       'Без выбросов'),
    ('transport_type',       'cargo',                    'Грузовой транспорт'),
    ('transport_type',       'passenger',                'Пассажирский транспорт'),
    ('transport_type',       'none',                     'Без транспорта'),
    ('import_export',        'import',                   'Импорт'),
    ('import_export',        'export',                   'Экспорт'),
    ('import_export',        'transit',                  'Транзит'),
    ('import_export',        'no',                       'Только внутренний рынок'),
    ('product_type',         'food',                     'Пищевая продукция'),
    ('product_type',         'industrial',               'Промышленная продукция'),
    ('product_type',         'service',                  'Услуги'),
    ('scale',                'micro',                    'Микро (до 15 чел.)'),
    ('scale',                'small',                    'Малый (до 100 чел.)'),
    ('scale',                'medium',                   'Средний (до 250 чел.)'),
    ('scale',                'large',                    'Крупный (250+ чел.)'),
    ('equipment',            'yes',                      'Есть оборудование'),
    ('equipment',            'no',                       'Без оборудования'),
    ('government_contract',  'yes',                      'Госконтракт/госзакупки'),
    ('government_contract',  'no',                       'Без госконтрактов'),
    ('license_required',     'yes',                      'Требуется лицензия'),
    ('license_required',     'no',                       'Лицензия не нужна'),
    ('land_use_type',        'agricultural',             'Земли с/х назначения'),
    ('land_use_type',        'settlement',               'Земли населённых пунктов'),
    ('land_use_type',        'industrial',               'Земли промышленности'),
    ('land_use_type',        'protected',                'Земли особо охраняемых территорий'),
    ('life_cycle_stage',     'planning',                 'Планирование/идея'),
    ('life_cycle_stage',     'registration',             'Регистрация бизнеса'),
    ('life_cycle_stage',     'pre_launch',               'До начала деятельности'),
    ('life_cycle_stage',     'launch',                   'Запуск'),
    ('life_cycle_stage',     'operation',                'Текущая деятельность'),
    ('life_cycle_stage',     'reporting',                'Периодическая отчётность'),
    ('life_cycle_stage',     'inspection',               'Проверка'),
    ('life_cycle_stage',     'expansion',                'Расширение/изменение'),
    ('life_cycle_stage',     'suspension',               'Приостановление'),
    ('life_cycle_stage',     'closure',                  'Закрытие')
ON CONFLICT (axis, value) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_condition_axis ON condition_dict(axis);

-- ─── 4. Маппинг услуг к сферам (304 услуги → 3 сферы + other) ────────
CREATE TABLE IF NOT EXISTS service_to_sphere_map (
    id           SERIAL PRIMARY KEY,
    service_name TEXT UNIQUE NOT NULL,
    sphere_code  VARCHAR(20) REFERENCES spheres(code),
    subcategory  VARCHAR(100),
    mapped_by    VARCHAR(20) DEFAULT 'pending',  -- pending|manual|llm|auto
    mapped_at    TIMESTAMP DEFAULT NOW(),
    notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_svc_sphere ON service_to_sphere_map(sphere_code);

-- ─── 5. Группы дублей ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS duplicate_groups (
    id              SERIAL PRIMARY KEY,
    group_code      VARCHAR(50) UNIQUE,
    duplicate_type  VARCHAR(20),  -- text|semantic|legal|cross_sphere|cross_authority
    avg_similarity  NUMERIC(4,3),
    detected_method VARCHAR(50),  -- text_hash|embedding|legal_match|imported
    main_card_id    INT,           -- FK выставится после requirement_cards
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dup_type ON duplicate_groups(duplicate_type);

-- ─── 6. Канонические карточки ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requirement_cards (
    id                  SERIAL PRIMARY KEY,
    card_code           VARCHAR(30) UNIQUE NOT NULL,  -- TREB-MVP-000001
    version             INT DEFAULT 1,
    status              VARCHAR(20) DEFAULT 'draft' CHECK (status IN
                            ('draft','in_review','approved','disputed','archived')),

    -- Содержание
    sphere_code         VARCHAR(20) REFERENCES spheres(code),
    subsphere           VARCHAR(200),
    short_title         TEXT,
    canonical_text      TEXT NOT NULL,
    legal_text          TEXT,
    business_text       TEXT,                          -- упрощённый для предпринимателя

    -- Структура (субъект-действие-объект-условие)
    subject             VARCHAR(200),
    action              VARCHAR(500),
    object              VARCHAR(500),
    condition_text      TEXT,
    exception_text      TEXT,

    -- Классификация
    requirement_type    VARCHAR(50),       -- лицензия|разрешение|документ|персонал|...
    requirement_subtype VARCHAR(100),
    role_fragment       VARCHAR(50),       -- 11 значений (см. ниже)
    regulatory_regime   VARCHAR(50),
    life_cycle_stage    VARCHAR(50),       -- может быть массивом значений через ';'
    mandatory_level     VARCHAR(20),       -- mandatory|conditional|recommended

    -- Исполнение
    timing              VARCHAR(200),       -- "до начала деятельности" / "ежегодно до 1 марта"
    frequency           VARCHAR(50),        -- one_time|periodic_year|periodic_month|on_event
    evidence_required   TEXT,
    evidence_form       VARCHAR(100),       -- договор|акт|журнал|сертификат|...
    consequences        TEXT,
    can_be_online       BOOLEAN,
    related_service_url TEXT,

    -- Дубликаты
    is_canonical        BOOLEAN DEFAULT TRUE,
    duplicate_group_id  INT REFERENCES duplicate_groups(id),
    canonical_card_id   INT REFERENCES requirement_cards(id),  -- для не-главных карточек группы

    -- Происхождение и качество
    generated_by        VARCHAR(50),         -- claude-opus-4-7|qwen-35b-q4|expert|rule
    prompt_version      VARCHAR(20),
    model_confidence    NUMERIC(4,3),
    expert_status       VARCHAR(20) DEFAULT 'unchecked' CHECK (expert_status IN
                            ('unchecked','in_review','approved','rejected','disputed')),

    owner_user_id       INT REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),

    CHECK (role_fragment IN (
        'обязанность бизнеса',
        'запрет',
        'условие допуска',
        'доказательство исполнения',
        'документ для заявления',
        'процедурная обязанность бизнеса',
        'действие государственного органа',
        'полномочие государственного органа',
        'описательная норма',
        'определение/термин',
        'спорная роль'
    ) OR role_fragment IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_card_sphere      ON requirement_cards(sphere_code);
CREATE INDEX IF NOT EXISTS idx_card_status      ON requirement_cards(status);
CREATE INDEX IF NOT EXISTS idx_card_role        ON requirement_cards(role_fragment);
CREATE INDEX IF NOT EXISTS idx_card_canonical   ON requirement_cards(is_canonical);
CREATE INDEX IF NOT EXISTS idx_card_dup_group   ON requirement_cards(duplicate_group_id);

-- Замыкаем FK на main_card_id в duplicate_groups
ALTER TABLE duplicate_groups
    DROP CONSTRAINT IF EXISTS fk_dup_main_card;
ALTER TABLE duplicate_groups
    ADD CONSTRAINT fk_dup_main_card FOREIGN KEY (main_card_id)
        REFERENCES requirement_cards(id) ON DELETE SET NULL;

-- ─── 7. Исходные фрагменты (4 слоя источников) ───────────────────────
CREATE TABLE IF NOT EXISTS source_fragments (
    id                   SERIAL PRIMARY KEY,
    source_layer         VARCHAR(20) NOT NULL CHECK (source_layer IN
                             ('rot_checklist','services','ml_dataset','npa_extracted')),
    external_id          VARCHAR(100),         -- ID в исходном источнике
    source_file          VARCHAR(200),         -- имя CSV/JSON файла

    -- Общие поля
    sphere_code          VARCHAR(20) REFERENCES spheres(code),
    subsphere_text       TEXT,
    authority            TEXT,
    text_original        TEXT NOT NULL,
    text_normalized      TEXT,                  -- из normalized_requirement (для слоя services)
    requirement_category VARCHAR(50),           -- из CSV (CONTRACT_INSURANCE и т.д.)

    -- Услуги/разрешения (слой 2)
    service_name         TEXT,
    recipient_type       VARCHAR(100),

    -- НПА (слои 3, 4)
    npa_title            TEXT,
    article_ref          TEXT,
    npa_url              TEXT,

    -- Экспертная разметка (слой 3)
    ml_category          VARCHAR(20),           -- OBL|ZAP|USL|SRK|DOC|FIN|OTV|PRO|STD
    ml_subject           VARCHAR(50),
    ml_summary           TEXT,
    ml_gold_label        VARCHAR(20),           -- confirm|disputed|unclear
    ml_gold_confidence   VARCHAR(20),           -- gold|silver|disputed
    ml_agreement_ratio   NUMERIC(4,3),
    ml_total_votes       INT,
    ml_split             VARCHAR(10),

    -- Связь с канонической карточкой (заполняется на Этапе 2)
    canonical_card_id    INT REFERENCES requirement_cards(id) ON DELETE SET NULL,

    -- Произвольные метаданные
    raw_meta             JSONB,
    created_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sf_layer        ON source_fragments(source_layer);
CREATE INDEX IF NOT EXISTS idx_sf_sphere       ON source_fragments(sphere_code);
CREATE INDEX IF NOT EXISTS idx_sf_canonical    ON source_fragments(canonical_card_id);
CREATE INDEX IF NOT EXISTS idx_sf_npa_title    ON source_fragments(npa_title);
CREATE INDEX IF NOT EXISTS idx_sf_service_name ON source_fragments(service_name);
CREATE INDEX IF NOT EXISTS idx_sf_external_id  ON source_fragments(external_id);

-- ─── 8. Метаданные каждого поля карточки ─────────────────────────────
CREATE TABLE IF NOT EXISTS field_metadata (
    id           SERIAL PRIMARY KEY,
    card_id      INT REFERENCES requirement_cards(id) ON DELETE CASCADE,
    field_name   VARCHAR(50) NOT NULL,
    value_text   TEXT,
    source       VARCHAR(20),       -- rule|llm|expert|import|inferred
    method       VARCHAR(50),       -- regex_dict|claude_opus|expert_vote|csv_field|...
    confidence   NUMERIC(4,3),
    explanation  TEXT,
    check_status VARCHAR(20) DEFAULT 'unchecked',  -- unchecked|checked|disputed|approved
    expert_user_id INT REFERENCES users(id),
    updated_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE (card_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_fm_card ON field_metadata(card_id);

-- ─── 9. Привязки к НПА ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS npa_links (
    id              SERIAL PRIMARY KEY,
    card_id         INT REFERENCES requirement_cards(id) ON DELETE CASCADE,
    npa_title       TEXT NOT NULL,
    article_ref     TEXT,
    npa_url         TEXT,
    fragment_text   TEXT,
    relation_status VARCHAR(50) NOT NULL CHECK (relation_status IN (
        'прямая_связь',
        'косвенная_связь',
        'через_подзаконный_акт',
        'есть_в_проверочном_листе_норма_не_найдена',
        'есть_в_услуге_норма_не_найдена',
        'основание_спорное',
        'основание_утратило_силу',
        'требование_шире_нормы',
        'требование_уже_нормы'
    )),
    found_method    VARCHAR(20) DEFAULT 'auto',     -- auto|expert|imported
    confidence      NUMERIC(4,3),
    expert_user_id  INT REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npa_card   ON npa_links(card_id);
CREATE INDEX IF NOT EXISTS idx_npa_status ON npa_links(relation_status);

-- ─── 10. Привязки к ОКЭД ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS okved_links (
    id           SERIAL PRIMARY KEY,
    card_id      INT REFERENCES requirement_cards(id) ON DELETE CASCADE,
    okved_id     VARCHAR(10) REFERENCES okved(id),
    link_type    VARCHAR(30) CHECK (link_type IN (
        'прямая',
        'через_услугу',
        'через_сферу_контроля',
        'через_сценарий',
        'предположительная'
    )),
    confidence   NUMERIC(4,3),
    source_note  TEXT,
    created_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE (card_id, okved_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_okv_card  ON okved_links(card_id);
CREATE INDEX IF NOT EXISTS idx_okv_okved ON okved_links(okved_id);

-- ─── 11. Машинно-исполняемые правила применимости ────────────────────
CREATE TABLE IF NOT EXISTS applicability_rules (
    id          SERIAL PRIMARY KEY,
    card_id     INT REFERENCES requirement_cards(id) ON DELETE CASCADE,
    rule_yaml   TEXT,             -- человекочитаемая форма
    rule_json   JSONB NOT NULL,   -- быстрая фильтрация по профилю
    -- Структура rule_json:
    -- { "all_of": [{"axis":"region","op":"eq","value":"almaty"}, ...],
    --   "any_of": [...],
    --   "exceptions": [...] }
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_card ON applicability_rules(card_id);
CREATE INDEX IF NOT EXISTS idx_ar_json ON applicability_rules USING GIN (rule_json);

-- ─── 12. Расчёт нагрузки на бизнес ───────────────────────────────────
CREATE TABLE IF NOT EXISTS burden_metrics (
    card_id              INT PRIMARY KEY REFERENCES requirement_cards(id) ON DELETE CASCADE,
    is_periodic          BOOLEAN,
    frequency_per_year   NUMERIC(8,2),
    num_documents        INT DEFAULT 0,
    num_authorities      INT DEFAULT 0,
    num_actions          INT DEFAULT 0,
    estimated_cost_kzt   NUMERIC(12,2),
    waiting_days         INT,
    validity_days        INT,
    fine_risk            VARCHAR(20),     -- none|low|medium|high
    suspension_risk      VARCHAR(20),     -- none|low|medium|high
    refusal_risk         VARCHAR(20),     -- none|low|medium|high
    needs_external_spec  BOOLEAN,
    needs_equipment      BOOLEAN,
    needs_premises       BOOLEAN,
    burden_index         NUMERIC(8,2),
    formula_version      VARCHAR(20) DEFAULT 'v1',
    updated_at           TIMESTAMP DEFAULT NOW()
);

-- Простая формула v1 (из ТЗ карточки):
-- burden_index = 1*num_actions + 2*num_documents + 3*num_authorities
--              + 3*frequency_per_year + 4*estimated_cost_kzt/1000
--              + 5*(suspension_risk in ('high','medium')) + 5*(needs_premises OR needs_equipment)

-- ─── 13. Сценарии для портала предпринимателя ────────────────────────
CREATE TABLE IF NOT EXISTS scenarios (
    id                SERIAL PRIMARY KEY,
    code              VARCHAR(50) UNIQUE NOT NULL,
    title             VARCHAR(200) NOT NULL,
    description       TEXT,
    spheres           VARCHAR(20)[] NOT NULL,    -- {ecology}, {transport}, {ecology,transport}
    subcategory       VARCHAR(100),
    profile_template  JSONB,                      -- предзаполненные условия из condition_dict
    is_published      BOOLEAN DEFAULT FALSE,
    display_order     INT DEFAULT 100,
    created_at        TIMESTAMP DEFAULT NOW()
);

INSERT INTO scenarios (code, title, description, spheres, subcategory, display_order) VALUES
    ('open_sto',           'Открыть станцию техобслуживания (СТО)',
        'Маршрут запуска СТО в Казахстане: лицензии, помещение, персонал, экологические требования.',
        ARRAY['transport','ecology'], 'transport_service',  10),
    ('cargo_carrier',      'Перевозчик грузов (внутренние перевозки)',
        'Лицензии и разрешения для грузоперевозок по РК.',
        ARRAY['transport'],            'cargo',              20),
    ('hazardous_waste',    'Деятельность с опасными отходами',
        'Сбор, хранение, транспортировка, утилизация опасных отходов.',
        ARRAY['ecology'],              'waste',              30),
    ('land_construction',  'Использование земельного участка под строительство',
        'Изменение целевого назначения, ПЗЗ, ИРД, экологические согласования.',
        ARRAY['land','ecology'],       'construction',       40),
    ('agro_land_use',      'Сельхозпроизводитель с обработкой земли',
        'Аренда с/х земли, рациональное использование, пастбища, охрана земель.',
        ARRAY['land'],                 'agriculture',        50),
    ('emissions_business', 'Предприятие с выбросами в атмосферу',
        'Экологическое разрешение, инвентаризация, мониторинг выбросов.',
        ARRAY['ecology'],              'emissions',          60),
    ('cross_border_cargo', 'Транспортировка грузов через границу',
        'Международные перевозки + экологические требования к транспорту.',
        ARRAY['transport','ecology'],  'international',      70)
ON CONFLICT (code) DO NOTHING;

-- ─── 14. Связь сценария с карточками (M:N) ───────────────────────────
CREATE TABLE IF NOT EXISTS scenario_cards (
    scenario_id INT REFERENCES scenarios(id) ON DELETE CASCADE,
    card_id     INT REFERENCES requirement_cards(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT TRUE,
    ordering    INT DEFAULT 100,
    notes       TEXT,
    PRIMARY KEY (scenario_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_sc_scenario ON scenario_cards(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sc_card     ON scenario_cards(card_id);

-- ─── 15. Лог батчей генерации карточек ───────────────────────────────
CREATE TABLE IF NOT EXISTS batch_log (
    id                     SERIAL PRIMARY KEY,
    sphere_code            VARCHAR(20) REFERENCES spheres(code),
    batch_number           INT,
    fragment_id_from       INT,
    fragment_id_to         INT,
    num_processed          INT DEFAULT 0,
    num_canonical_created  INT DEFAULT 0,
    num_duplicates_marked  INT DEFAULT 0,
    generated_by           VARCHAR(50),         -- claude-opus-4-7
    prompt_version         VARCHAR(20),
    status                 VARCHAR(20) DEFAULT 'pending',  -- pending|in_progress|completed|error
    started_at             TIMESTAMP,
    completed_at           TIMESTAMP,
    notes                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_bl_sphere ON batch_log(sphere_code);
CREATE INDEX IF NOT EXISTS idx_bl_status ON batch_log(status);

-- ─── 16. Удобные представления для дашборда ──────────────────────────

-- Срез: количество фрагментов по сфере и слою источника
CREATE OR REPLACE VIEW v_fragments_by_sphere_layer AS
SELECT
    s.code             AS sphere_code,
    s.name_ru          AS sphere_name,
    sf.source_layer,
    COUNT(*)           AS fragments_count
FROM source_fragments sf
JOIN spheres s ON sf.sphere_code = s.code
GROUP BY s.code, s.name_ru, sf.source_layer
ORDER BY s.code, sf.source_layer;

-- Срез: количество карточек по сфере и роли фрагмента (КЛЮЧЕВОЙ для госпортала)
CREATE OR REPLACE VIEW v_cards_by_sphere_role AS
SELECT
    s.code               AS sphere_code,
    s.name_ru            AS sphere_name,
    rc.role_fragment,
    COUNT(*)             AS cards_count,
    SUM(CASE WHEN rc.is_canonical THEN 1 ELSE 0 END) AS canonical_count
FROM requirement_cards rc
JOIN spheres s ON rc.sphere_code = s.code
GROUP BY s.code, s.name_ru, rc.role_fragment
ORDER BY s.code, rc.role_fragment;

-- Срез: дубли по типу
CREATE OR REPLACE VIEW v_duplicates_summary AS
SELECT
    duplicate_type,
    COUNT(*) AS groups_count,
    AVG(avg_similarity) AS avg_similarity
FROM duplicate_groups
GROUP BY duplicate_type;

COMMIT;

-- ─── Проверочные запросы (запускать после миграции и загрузки): ──────
--
-- SELECT * FROM v_fragments_by_sphere_layer;
-- SELECT * FROM v_cards_by_sphere_role;
-- SELECT * FROM v_duplicates_summary;
-- SELECT count(*) FROM source_fragments;     -- ожидаемо ~11 000
-- SELECT count(*) FROM requirement_cards;    -- после Этапа 2 ~6 500
