-- 033: кэш ИИ-заключений публичного бизнес-сервиса (reestr-business).
-- Ключ hash = sha256 нормализованного профиля: oked без точек | section UPPER | triggers
-- отсортированы и склеены через ',' | path (new|expand). title в хэш НЕ входит —
-- на один профиль требований может приходиться разный отображаемый заголовок сценария,
-- LLM-контекст при этом идентичен (осознанный трейдофф).
-- TTL логический: строка свежа, пока created_at > now() - CONCLUSION_CACHE_TTL_DAYS (env
-- сервиса, дефолт 14 дней); протухшая перезаписывается INSERT ... ON CONFLICT DO UPDATE.

CREATE TABLE IF NOT EXISTS business_conclusion_cache (
  hash        text PRIMARY KEY,
  oked        text,
  section     text,
  triggers    text[] NOT NULL DEFAULT '{}',
  path        text,
  title       text,
  conclusion  text NOT NULL,
  model       text NOT NULL DEFAULT 'deepseek-chat',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcc_created_at ON business_conclusion_cache (created_at);
