-- 038: правовой мониторинг по ЗАН (решения заказчика 2026-08-08:
-- сигнал+кнопка у модератора, суточный тик воркера, только статусы НПА реестра)

-- Снапшот состояния каждого ngr реестра в базе ЗАН (обновляет zan-тик воркера)
CREATE TABLE IF NOT EXISTS npa_zan_status (
  ngr           TEXT PRIMARY KEY,
  zan_st        TEXT,                            -- doc_meta.st: new|upd|yts|stp|err
  zan_actual    BOOLEAN,
  zan_dl        DATE,                            -- дата последней редакции в zan
  text_hash     TEXT,                            -- md5 нормализованного rus-текста
  lost_marker   BOOLEAN NOT NULL DEFAULT false,  -- сноска «утратил силу» в шапке
  zan_title     TEXT,
  missing       BOOLEAN NOT NULL DEFAULT false,  -- нет rus-документа в zan
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_at    TIMESTAMPTZ
);

-- Журнал событий мониторинга: по паре (ngr, орган-владелец карточек)
CREATE TABLE IF NOT EXISTS npa_zan_event (
  id             BIGSERIAL PRIMARY KEY,
  ngr            TEXT NOT NULL,
  authority_code TEXT NOT NULL,
  event_type     TEXT NOT NULL CHECK (event_type IN ('repealed','amended')),
  dedup_key      TEXT NOT NULL UNIQUE,           -- repealed:{auth}:{ngr} | amended:{auth}:{ngr}:{ymd}
  npa_title      TEXT,
  req_count      INT,                            -- живых карточек органа на момент детекта
  details        JSONB,                          -- {old_dl,new_dl,old_st,new_st,signal}
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','acked','processed')),
  status_by      INT,
  status_at      TIMESTAMPTZ,
  status_note    TEXT
);
CREATE INDEX IF NOT EXISTS zan_event_auth ON npa_zan_event(authority_code, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS zan_event_ngr ON npa_zan_event(ngr);
