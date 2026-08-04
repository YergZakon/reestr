-- 035: сшивка ЕРСОП ↔ НПА (решения заказчика 2026-08-04: ЕРСОП-формулировка
-- первична; НПА-двойник при надёжной сшивке excluded с переносом ревью-статуса
-- и правовой ссылки на ЕРСОП-карточку; серую зону подтверждают органы в UI).
--
-- 1) registry_embeddings — эмбеддинги ПРОД-реестра (bge-m3 1024 float32 LE).
--    Прежний мост ersop_match/card_embeddings построен на легаси requirement_cards
--    и к requirement_registry неприменим.
-- 2) ersop_npa_link — первоклассная журнальная сущность сшивки: пара карточек,
--    канал, уверенность, вердикт LLM, статус жизненного цикла, кто решил, откат.
-- 3) Легализация колонок-призраков (создавались инлайн-DDL скриптов):
--    ersop_criteria.inferred_*, requirement_registry.ersop_confirmed.
-- 4) ersop_pk_exempt — виды контроля, выведенные из-под ЕРСОП Предпринимательским
--    кодексом (ст. 137 ПК): там НПА-контур первичен, сшивка не применяется.

CREATE TABLE IF NOT EXISTS registry_embeddings (
    registry_id INT PRIMARY KEY REFERENCES requirement_registry(id) ON DELETE CASCADE,
    model       TEXT NOT NULL,            -- 'BAAI/bge-m3'
    dim         INT  NOT NULL,            -- 1024
    embedding   BYTEA NOT NULL,           -- float32 little-endian, dim*4 байт
    text_hash   TEXT NOT NULL,            -- md5(текста) — инкрементальный пересчёт
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registry_embeddings_model ON registry_embeddings (model);

CREATE TABLE IF NOT EXISTS ersop_npa_link (
    id             BIGSERIAL PRIMARY KEY,
    ersop_card_id  INT NOT NULL REFERENCES requirement_registry(id),
    npa_card_id    INT NOT NULL REFERENCES requirement_registry(id),
    criterion_id   INT,                   -- ersop_criteria.id_ersop
    ngr            TEXT,                  -- правовая ссылка НПА-стороны на момент сшивки
    article        TEXT,
    cosine         REAL,
    channel        TEXT NOT NULL,         -- semantic | theme | manual
    llm_verdict    TEXT,                  -- same | narrower | broader | different
    llm_confidence REAL,
    status         TEXT NOT NULL,         -- auto | proposed | accepted | rejected | reverted
    reason         TEXT,
    decided_by     INT REFERENCES users(id),
    decided_at     TIMESTAMPTZ,
    applied_at     TIMESTAMPTZ,           -- когда изменения внесены в реестр
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ersop_card_id, npa_card_id)
);
-- одна активная пара на НПА-карточку (гасится она только один раз)
CREATE UNIQUE INDEX IF NOT EXISTS ersop_npa_link_active_npa
  ON ersop_npa_link (npa_card_id) WHERE status IN ('auto','proposed','accepted');
CREATE INDEX IF NOT EXISTS ersop_npa_link_ersop ON ersop_npa_link (ersop_card_id);
CREATE INDEX IF NOT EXISTS ersop_npa_link_status ON ersop_npa_link (status);

-- легализация колонок, созданных инлайн-DDL (enrich_ersop_npa.py и экспорт)
ALTER TABLE ersop_criteria ADD COLUMN IF NOT EXISTS inferred_ngr TEXT;
ALTER TABLE ersop_criteria ADD COLUMN IF NOT EXISTS inferred_npa_title TEXT;
ALTER TABLE ersop_criteria ADD COLUMN IF NOT EXISTS inferred_card_id INT;
ALTER TABLE ersop_criteria ADD COLUMN IF NOT EXISTS inferred_cosine REAL;
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS ersop_confirmed BOOLEAN;

-- исключения ст. 137 ПК РК (налоговый, таможенный и др. контроль вне ЕРСОП)
CREATE TABLE IF NOT EXISTS ersop_pk_exempt (
    id         INT PRIMARY KEY,           -- d_type_control.id
    name_ru    TEXT NOT NULL,             -- формулировка исключения
    note       TEXT,                      -- напр. 'п.п. 1 п.3 ст.137 ПК РК'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
