-- 027: облачный воркер подач (извлечение/валидация/классификация DeepSeek на Railway).
-- npa_submission становится полноценной очередью; requirement_registry получает флаг
-- «возможный дубль» (быстрый pg_trgm-фильтр в потоке; полный семантический дедуп —
-- регламентный bge-m3). Additive, безопасно.

-- Очередь: аренда задачи воркером + счётчик попыток + стадия конвейера
ALTER TABLE npa_submission ADD COLUMN IF NOT EXISTS lease_until  TIMESTAMPTZ;
ALTER TABLE npa_submission ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;
ALTER TABLE npa_submission ADD COLUMN IF NOT EXISTS stage        TEXT;  -- fetch|extract|validate|classify|dedup
CREATE INDEX IF NOT EXISTS npa_sub_queue ON npa_submission(status, lease_until);

-- Реестр: пометка потенциального дубля из онлайн-фильтра (+ссылка на кандидата)
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS dup_suspect     BOOLEAN;
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS dup_suspect_of  BIGINT;

-- Быстрый текстовый дедуп-фильтр
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS rr_trgm_text
  ON requirement_registry USING gin ((COALESCE(canon_text, legal_text, '')) gin_trgm_ops);
