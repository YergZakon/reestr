-- 039: казахский язык (этап II, план одобрен 2026-08-09).
-- Тексты карточек — в отдельной i18n-таблице (langcode 'kk' по ISO 639-1;
-- суффикс _kz в requirement_registry не используем — коллизия грепов с _kzt=тенге).

CREATE TABLE IF NOT EXISTS requirement_i18n (
  registry_id INT NOT NULL REFERENCES requirement_registry(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL DEFAULT 'kk' CHECK (lang IN ('kk')),
  title       TEXT,
  legal_text  TEXT,
  canon_text  TEXT,
  subject     TEXT,
  condition   TEXT,
  method      TEXT NOT NULL,  -- ersop_source | zan_align | llm | manual
  quality     REAL,           -- уверенность выравнивания (аудит)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (registry_id, lang)
);

ALTER TABLE spheres ADD COLUMN IF NOT EXISTS name_kk TEXT;
-- казахское название акта (doc_meta lg='kaz'.zg) — для шапок карточек и экспорта
ALTER TABLE npa_zan_status ADD COLUMN IF NOT EXISTS zan_title_kk TEXT;
