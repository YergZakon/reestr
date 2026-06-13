-- ─────────────────────────────────────────────────────────────────────
-- Migration 009: user_spheres — bridge-таблица «эксперт ↔ сферы»
-- Date: 2026-05-08
--
-- Зачем:
--   Эксперты должны видеть и голосовать только по назначенным им сферам.
--   В users у нас бинарная роль (admin | expert) и нет привязки к сферам.
--
-- Решение — отдельная таблица многие-ко-многим (а не TEXT[] в users):
--   - REFERENCES spheres(code) даёт целостность
--   - удобные запросы «все эксперты сферы X» через индекс
--   - admin не пишется в эту таблицу — у него нет ограничений
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS user_spheres (
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sphere_code VARCHAR(20) NOT NULL REFERENCES spheres(code),
    assigned_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, sphere_code)
);

CREATE INDEX IF NOT EXISTS idx_user_spheres_sphere ON user_spheres (sphere_code);
CREATE INDEX IF NOT EXISTS idx_user_spheres_user   ON user_spheres (user_id);

COMMIT;
