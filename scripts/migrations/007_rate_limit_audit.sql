-- ─────────────────────────────────────────────────────────────────────
-- Migration 007: rate-limit таблица + версионирование expert_votes
-- Date: 2026-05-04
--
-- Защита от:
--   1. Спам-голосования одного эксперта (> 60 votes/min)
--   2. Race condition при одновременном UPDATE одного vote
--      (см. PROJECT_MEMORY.md → "100 expert load audit")
--
-- Запуск:
--   psql $DATABASE_URL -f scripts/migrations/007_rate_limit_audit.sql
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── Rate-limit log (sliding window per user/endpoint) ──────────────
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id              SERIAL PRIMARY KEY,
    user_id         INT REFERENCES users(id) ON DELETE CASCADE,
    endpoint        VARCHAR(100) NOT NULL,
    request_count   INT DEFAULT 1,
    window_start    TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_window
    ON rate_limit_log (user_id, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_endpoint
    ON rate_limit_log (endpoint, window_start DESC);

-- Auto-cleanup: дропать строки старше 24 часов (через cron-job или manually)
COMMENT ON TABLE rate_limit_log IS
    'Sliding window rate-limit. Cleanup: DELETE FROM rate_limit_log WHERE window_start < NOW() - INTERVAL ''24 hours''';

-- ─── Versioning для expert_votes (optimistic locking) ───────────────
-- Если две одновременные UPDATE на один vote — вторая увидит version mismatch
ALTER TABLE expert_votes
    ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 NOT NULL;

-- Триггер для авто-инкремента version при UPDATE
CREATE OR REPLACE FUNCTION fn_bump_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.voted_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_expert_votes_version ON expert_votes;
CREATE TRIGGER trg_bump_expert_votes_version
    BEFORE UPDATE ON expert_votes
    FOR EACH ROW
    EXECUTE FUNCTION fn_bump_version();

-- Использование в коде:
--   UPDATE expert_votes
--   SET vote=$1, comment=$2
--   WHERE id=$3 AND version=$4
--   RETURNING version;
--   -- если 0 строк → 409 Conflict, перечитать и повторить

-- ─── Sessions cache (для уменьшения JWT verify overhead) ────────────
-- Опционально — пока используется JWT, без таблицы. Если перейдём на DB-cache
-- сессий — раскомментировать:
--
-- CREATE TABLE IF NOT EXISTS user_sessions (
--     token_hash      VARCHAR(64) PRIMARY KEY,  -- sha256(JWT)
--     user_id         INT REFERENCES users(id) ON DELETE CASCADE,
--     ip              INET,
--     user_agent      TEXT,
--     created_at      TIMESTAMP DEFAULT NOW(),
--     last_seen_at    TIMESTAMP DEFAULT NOW(),
--     expires_at      TIMESTAMP NOT NULL
-- );
-- CREATE INDEX idx_sessions_user ON user_sessions (user_id);
-- CREATE INDEX idx_sessions_expires ON user_sessions (expires_at);

COMMIT;
