-- 031: слой 3 адаптивного опросника — вопросы из условий карточек.
-- cond_tags: нормализованные условия-теги карточки (кластеры поля condition).
-- Семантика в выдачах бизнеса — AND: карточка с непустыми cond_tags видна,
-- только если хотя бы один её cond-тег подтверждён ответом «Да» (в отличие от
-- triggers, где пусто=базовое и любой общий тег открывает карточку).
-- condition_questions: справочник автогенерированных вопросов (DeepSeek
-- именует крупные кластеры; процедурные условия «при подаче заявления» не
-- становятся вопросами и cond_tags не получают).

ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS cond_tags TEXT[];
CREATE INDEX IF NOT EXISTS rr_cond_tags ON requirement_registry USING gin (cond_tags);

CREATE TABLE IF NOT EXISTS condition_questions (
  tag TEXT PRIMARY KEY,
  label TEXT NOT NULL,          -- формулировка вопроса Да/Нет
  hint TEXT,
  cards INT NOT NULL DEFAULT 0, -- карточек в кластере на момент генерации
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
