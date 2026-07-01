-- 024_npa_submission.sql — самообслуживание: подача НПА модератором → авто-парсинг в карточки.
-- Node-превью пишет preview_json; Python process_submissions.py берёт status='submitted' → парсит.

CREATE TABLE IF NOT EXISTS npa_submission (
    id            SERIAL PRIMARY KEY,
    ngr           TEXT,
    npa_title     TEXT,
    org_id        INT REFERENCES organizations(id),   -- ответственный узел органа
    sphere_code   TEXT,
    ara_deadline  DATE,
    submitted_by  INT REFERENCES users(id),
    status        TEXT NOT NULL DEFAULT 'submitted',   -- submitted|preview|parsing|parsed|in_review|error
    preview_json  JSONB,                               -- черновые карточки из Node-превью
    cards_created INT DEFAULT 0,
    error         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS npa_sub_status ON npa_submission(status);
CREATE INDEX IF NOT EXISTS npa_sub_org    ON npa_submission(org_id);

-- Связь карточки с подачей (source='submission')
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS submission_id INT;
CREATE INDEX IF NOT EXISTS rr_submission ON requirement_registry(submission_id);
