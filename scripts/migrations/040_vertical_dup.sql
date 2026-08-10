-- 040: вертикальное дублирование — связи «подзаконная норма дублирует норму
-- вышестоящего акта» (план 2026-08-09; продукт этапа — отчёт, UI отложен).
-- Зона выверена: гейты P1-P3 + LLM-классификация + адверсариальный скептик +
-- слепая разметка границы заказчиком (3 раунда) + частотный гейт.

CREATE TABLE IF NOT EXISTS vertical_dup_link (
  id          BIGSERIAL PRIMARY KEY,
  lower_id    INT NOT NULL REFERENCES requirement_registry(id) ON DELETE CASCADE,
  upper_id    INT NOT NULL REFERENCES requirement_registry(id) ON DELETE CASCADE,
  cosine      REAL,
  confidence  REAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lower_id, upper_id)
);
CREATE INDEX IF NOT EXISTS vdl_lower ON vertical_dup_link(lower_id);
CREATE INDEX IF NOT EXISTS vdl_upper ON vertical_dup_link(upper_id);
