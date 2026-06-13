-- 014_registry_review.sql
-- Поля ревью для requirement_registry + аудит-лог правок.

ALTER TABLE requirement_registry
    ADD COLUMN IF NOT EXISTS review_status  TEXT NOT NULL DEFAULT 'pending',  -- pending/confirmed/rejected/edited
    ADD COLUMN IF NOT EXISTS reviewed_by    INT,
    ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_comment TEXT;

CREATE INDEX IF NOT EXISTS rr_review_status ON requirement_registry (review_status);

CREATE TABLE IF NOT EXISTS registry_edits (
    id           BIGSERIAL PRIMARY KEY,
    registry_id  BIGINT NOT NULL REFERENCES requirement_registry(id) ON DELETE CASCADE,
    user_id      INT,
    action       TEXT NOT NULL,          -- confirm / reject / edit
    field        TEXT,                   -- какое поле правили (для edit)
    old_value    TEXT,
    new_value    TEXT,
    comment      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registry_edits_reg ON registry_edits (registry_id, created_at DESC);

COMMENT ON TABLE registry_edits IS 'История правок requirement_registry (подтверждение/отклонение/редактирование).';
