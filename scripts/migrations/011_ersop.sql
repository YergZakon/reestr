-- 011_ersop.sql
-- ЕРСОП — субъективные критерии проверок (gold standard для валидации реестра).
-- Источник: postgres@192.168.92.10 / ersop.d_subjective_criteria
-- Дамп: outputs/ersop/d_subjective_criteria.csv (72 438 строк, 19 835 активных)

CREATE TABLE IF NOT EXISTS ersop_criteria (
    id_ersop            INT PRIMARY KEY,                  -- d_subjective_criteria.id
    code                TEXT NOT NULL,                    -- 13-char код типа 2018002300029
    name_ru             TEXT NOT NULL,                    -- собственно текст критерия
    name_kz             TEXT,
    area_activity_id    INT  NOT NULL,                    -- сфера ЕРСОП (119 активных)
    area_name_ru        TEXT NOT NULL,                    -- денорм для удобства
    our_sphere          TEXT,                             -- ручной мэппинг → наш sphere_code; NULL = не определено
    status              SMALLINT NOT NULL,                -- 1=активный, 2=устаревший
    power_offence_id    SMALLINT,                         -- 1/2/3 степень нарушения
    org_type_id         INT,
    in_real_check       BOOLEAN NOT NULL DEFAULT false,   -- хоть раз применялся в chk_list_criteria
    in_template         BOOLEAN NOT NULL DEFAULT false,   -- включён в f_criteria_check_list
    embedding           BYTEA,                            -- bge-m3 1024-dim float32, заполняется лениво
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ersop_criteria_area_status
    ON ersop_criteria (area_activity_id, status);
CREATE INDEX IF NOT EXISTS ersop_criteria_our_sphere
    ON ersop_criteria (our_sphere)
    WHERE our_sphere IS NOT NULL;

-- Матчинг ЕРСОП ↔ наши карточки требований
CREATE TABLE IF NOT EXISTS ersop_match (
    id           BIGSERIAL PRIMARY KEY,
    ersop_id     INT  NOT NULL REFERENCES ersop_criteria(id_ersop) ON DELETE CASCADE,
    card_id      INT  NOT NULL REFERENCES requirement_cards(id)    ON DELETE CASCADE,
    cosine       REAL NOT NULL,
    rank         SMALLINT NOT NULL,                       -- 1..K
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ersop_id, card_id)
);
CREATE INDEX IF NOT EXISTS ersop_match_ersop ON ersop_match (ersop_id, rank);
CREATE INDEX IF NOT EXISTS ersop_match_card  ON ersop_match (card_id, cosine DESC);

COMMENT ON TABLE ersop_criteria IS 'ЕРСОП d_subjective_criteria, выгружено 2026-06-07 из postgres@192.168.92.10';
COMMENT ON TABLE ersop_match    IS 'cosine-матч ЕРСОП-критериев с requirement_cards (bge-m3 эмбеддинги)';
