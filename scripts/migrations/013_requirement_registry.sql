-- 013_requirement_registry.sql
-- Единый сводный реестр требований к бизнесу (все источники: НПА + ЕРСОП [+ лицензии].
-- Отдельная таблица — не трогает requirement_cards (экспертный контур живёт отдельно).

CREATE TABLE IF NOT EXISTS requirement_registry (
    id              BIGSERIAL PRIMARY KEY,
    source          TEXT NOT NULL,              -- 'npa' | 'ersop' | 'license'
    source_ref_id   INT,                        -- card_id (для npa) или id_ersop (для ersop)
    trust           TEXT NOT NULL,              -- ersop_auto / ds_confirm / ersop_extracted / npa_only_weak / ...

    -- привязка к НПА
    ngr             TEXT,                       -- госрегномер (adilet doc-код)
    npa_title       TEXT,
    article         TEXT,
    npa_status      TEXT,                       -- 'действующий' | 'утратил силу' | NULL
    replacement_ngr TEXT,                       -- если НПА утратил силу — преемник

    -- орган
    ministry        TEXT,
    ministry_abbr   TEXT,

    -- сфера / ОКЭД
    sphere_code     TEXT,                       -- наш sphere_code (12 сфер)
    ersop_area      TEXT,                       -- надёжная сфера ЕРСОП (наш реестр / lists)
    okeds           TEXT[],                     -- коды ОКЭД
    spheres_via_oked TEXT[],                    -- вероятные сферы через ОКЭД (размытые)

    -- содержание требования
    title           TEXT,
    legal_text      TEXT,
    canon_text      TEXT,
    subject         TEXT,
    action          TEXT,
    object          TEXT,
    condition       TEXT,
    evidence        TEXT,
    stages          TEXT[],                     -- стадии жизненного цикла бизнеса

    -- ЕРСОП-подтверждение
    ersop_id        INT,
    ersop_code      TEXT,
    ersop_cosine    REAL,

    -- дедуп
    dup_group_id    BIGINT,
    is_canonical    BOOLEAN NOT NULL DEFAULT true,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rr_sphere   ON requirement_registry (sphere_code);
CREATE INDEX IF NOT EXISTS rr_ministry ON requirement_registry (ministry);
CREATE INDEX IF NOT EXISTS rr_ngr      ON requirement_registry (ngr);
CREATE INDEX IF NOT EXISTS rr_trust    ON requirement_registry (trust);
CREATE INDEX IF NOT EXISTS rr_status   ON requirement_registry (npa_status);
CREATE INDEX IF NOT EXISTS rr_source   ON requirement_registry (source);
CREATE INDEX IF NOT EXISTS rr_dup      ON requirement_registry (dup_group_id) WHERE dup_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rr_okeds    ON requirement_registry USING GIN (okeds);
CREATE INDEX IF NOT EXISTS rr_stages   ON requirement_registry USING GIN (stages);

COMMENT ON TABLE requirement_registry IS 'Сводный реестр требований к бизнесу: НПА(Haiku)+ЕРСОП(DeepSeek), с привязкой орган/НПА/ОКЭД/сфера/стадия.';
