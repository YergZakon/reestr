-- ─────────────────────────────────────────────────────────────────────
-- Migration 006: индексы для масштабирования до 100 экспертов
-- Date: 2026-05-04
--
-- По результатам аудита (см. PROJECT_MEMORY.md → "100 expert load audit"):
--   1. Пропущены индексы на created_at/updated_at в requirement_cards
--      → медленная сортировка/фильтрация по времени в /admin/dashboard
--   2. Нет composite indexes на (requirement_id, iteration_id, vote)
--      → подзапрос-агрегация в /api/requirements выполняется без индекса
--   3. Нет индекса на expert_votes(voted_at) → медленная аналитика
--   4. Нет composite (requirement_id, user_id) → fallback к scan
--
-- CREATE INDEX CONCURRENTLY использован чтобы не блокировать таблицы
-- при создании (важно когда экспортные могут читать параллельно).
-- ─────────────────────────────────────────────────────────────────────

-- ─── requirement_cards ───────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_card_created_at
    ON requirement_cards (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_card_updated_at
    ON requirement_cards (updated_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_card_expert_status
    ON requirement_cards (expert_status);
-- Composite: фильтр в /review (sphere_code + expert_status)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_card_sphere_status
    ON requirement_cards (sphere_code, expert_status);

-- ─── expert_votes ────────────────────────────────────────────────────
-- (requirement_id, user_id) — для проверки голоса конкретного эксперта
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ev_req_user
    ON expert_votes (requirement_id, user_id);
-- voted_at — аналитика "сколько голосов за час"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ev_voted_at
    ON expert_votes (voted_at DESC);
-- (requirement_id, iteration_id, vote) — основной агрегатный индекс
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ev_req_iter_vote
    ON expert_votes (requirement_id, iteration_id, vote);

-- ─── source_fragments ────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sf_created_at
    ON source_fragments (created_at DESC);

-- ─── ml_expert_votes (если будем агрегировать) ───────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mev_vote
    ON ml_expert_votes (vote);

-- ─── activity_log (растёт быстро при 100 пользователях) ─────────────
-- Проверим, существует ли columns ('action_type'/'created_at')
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='activity_log' AND column_name='created_at'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_created_at ON activity_log (created_at DESC)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='activity_log' AND column_name='user_id'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_user ON activity_log (user_id, created_at DESC)';
    END IF;
END $$;

-- Проверка эффекта:
--   EXPLAIN ANALYZE SELECT * FROM requirement_cards
--   WHERE sphere_code='mz_zdrav' AND expert_status='unchecked'
--   ORDER BY created_at DESC LIMIT 15;
