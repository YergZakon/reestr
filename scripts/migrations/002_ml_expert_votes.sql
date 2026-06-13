-- ─────────────────────────────────────────────────────────────────────
-- Migration 002: Голоса экспертов 1/4/5/6 на исходных фрагментах
-- Date: 2026-04-29
-- Хранит сырые голоса из vote_matrix_2026-04-27.csv (10 экспертов в исходнике),
-- но мы загружаем только колонки expert_1, expert_4, expert_5, expert_6 —
-- по правилу из стратегии «учитывать только экспертов 1, 4, 5 и 6».
--
-- Существующая таблица expert_votes (на requirements) НЕ изменяется — там
-- голосование через web-UI Next.js. Эта новая таблица — для голосов из CSV.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS ml_expert_votes (
    id            SERIAL PRIMARY KEY,
    fragment_id   INT REFERENCES source_fragments(id) ON DELETE CASCADE,
    expert_number SMALLINT NOT NULL CHECK (expert_number IN (1, 4, 5, 6)),
    vote          VARCHAR(20),                   -- confirm|reject|uncertain
    source_file   VARCHAR(100) DEFAULT 'vote_matrix_2026-04-27.csv',
    created_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE (fragment_id, expert_number)
);

CREATE INDEX IF NOT EXISTS idx_mev_fragment ON ml_expert_votes(fragment_id);
CREATE INDEX IF NOT EXISTS idx_mev_vote     ON ml_expert_votes(vote);

-- Удобное представление: агрегированный результат голосования по 4 экспертам
CREATE OR REPLACE VIEW v_ml_consensus AS
SELECT
    fragment_id,
    COUNT(*)                                                    AS num_voters,
    SUM(CASE WHEN vote = 'confirm'   THEN 1 ELSE 0 END)         AS confirm_count,
    SUM(CASE WHEN vote = 'reject'    THEN 1 ELSE 0 END)         AS reject_count,
    SUM(CASE WHEN vote = 'uncertain' THEN 1 ELSE 0 END)         AS uncertain_count,
    CASE
        WHEN SUM(CASE WHEN vote = 'confirm' THEN 1 ELSE 0 END) >= 3 THEN 'confirmed'
        WHEN SUM(CASE WHEN vote = 'reject'  THEN 1 ELSE 0 END) >= 3 THEN 'rejected'
        ELSE 'disputed'
    END                                                          AS consensus
FROM ml_expert_votes
WHERE vote IS NOT NULL
GROUP BY fragment_id;

COMMIT;
