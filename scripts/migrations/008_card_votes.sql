-- ─────────────────────────────────────────────────────────────────────
-- Migration 008: card_votes — голосование экспертов по requirement_cards
-- Date: 2026-05-04
--
-- Зачем отдельная таблица (а не expert_votes):
--   - expert_votes привязана к requirements (старый пилот, FK requirement_id)
--   - requirement_cards — новая модель (после миграции 001), FK card_id
--   - Несовместимые domain entities; не смешивать
--
-- Структура аналогична expert_votes:
--   UNIQUE(card_id, user_id) — один голос от каждого эксперта на карточку
--   vote: confirm | reject | uncertain
--   version + триггер — optimistic locking (как в expert_votes из миграции 007)
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS card_votes (
    id          SERIAL PRIMARY KEY,
    card_id     INT NOT NULL REFERENCES requirement_cards(id) ON DELETE CASCADE,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote        VARCHAR(20) NOT NULL CHECK (vote IN ('confirm', 'reject', 'uncertain')),
    comment     TEXT,
    version     INT DEFAULT 1 NOT NULL,
    voted_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE (card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cv_card_id      ON card_votes (card_id);
CREATE INDEX IF NOT EXISTS idx_cv_user_id      ON card_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_cv_voted_at     ON card_votes (voted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cv_card_vote    ON card_votes (card_id, vote);

-- Триггер: auto-bump version + voted_at на UPDATE
DROP TRIGGER IF EXISTS trg_bump_card_votes_version ON card_votes;
CREATE TRIGGER trg_bump_card_votes_version
    BEFORE UPDATE ON card_votes
    FOR EACH ROW
    EXECUTE FUNCTION fn_bump_version();   -- определена в миграции 007

-- ─── Удобное представление: консенсус по карточке ────────────────────
CREATE OR REPLACE VIEW v_card_consensus AS
SELECT
    rc.id AS card_id,
    rc.card_code,
    rc.sphere_code,
    COUNT(cv.id) AS total_votes,
    COUNT(*) FILTER (WHERE cv.vote = 'confirm') AS confirms,
    COUNT(*) FILTER (WHERE cv.vote = 'reject')  AS rejects,
    COUNT(*) FILTER (WHERE cv.vote = 'uncertain') AS uncertains,
    CASE
        WHEN COUNT(cv.id) >= 3 AND COUNT(*) FILTER (WHERE cv.vote = 'confirm') >= 3
             AND COUNT(*) FILTER (WHERE cv.vote = 'reject') = 0
            THEN 'confirmed'
        WHEN COUNT(cv.id) >= 3 AND COUNT(*) FILTER (WHERE cv.vote = 'reject') >= 3
             AND COUNT(*) FILTER (WHERE cv.vote = 'confirm') = 0
            THEN 'rejected'
        WHEN COUNT(cv.id) >= 3
             AND COUNT(*) FILTER (WHERE cv.vote = 'confirm') > 0
             AND COUNT(*) FILTER (WHERE cv.vote = 'reject')  > 0
            THEN 'disputed'
        ELSE 'pending'
    END AS consensus_status
FROM requirement_cards rc
LEFT JOIN card_votes cv ON cv.card_id = rc.id
GROUP BY rc.id, rc.card_code, rc.sphere_code;

COMMIT;
