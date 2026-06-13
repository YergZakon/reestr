-- 016_triggers.sql — теги применимости требований для опросника (модель ABLIS)
-- Применяется скриптом scripts/registry/classify_triggers.py (DDL продублирован там).

ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS triggers TEXT[];   -- условия применимости (пусто = базовое, нужно всем)
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS is_permit BOOLEAN;  -- разрешительное (лицензия/разрешение/уведомление/аккредитация)

CREATE INDEX IF NOT EXISTS rr_triggers ON requirement_registry USING gin (triggers);
CREATE INDEX IF NOT EXISTS rr_permit ON requirement_registry (is_permit);
