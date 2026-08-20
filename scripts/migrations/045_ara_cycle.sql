-- 045: планомерный цикл АРА (2026-08-20, план staged-kindling-kurzweil).
-- Единица цикла — акт в скоупе органа (ngr × authority_code). Источник сроков —
-- npa_ara (портальный импорт «не за чистую монету» + ручные правки + авто-срок
-- после утверждённого пересмотра). Цикл: ara_review (open → assigned → in_progress
-- → concluded → approved | cancelled), поручения аналитикам — ara_assignment.
-- Правило сроков: законы/кодексы +3 года, подзаконка +2 (п. 2 Правил ведения Реестра).

CREATE TABLE IF NOT EXISTS npa_ara (
    id             BIGSERIAL PRIMARY KEY,
    ngr            TEXT,                 -- NULL, если из портальной ссылки ngr не извлечён
    ext_ref        TEXT,                 -- исходная ссылка портала (для строк без ngr)
    authority_code TEXT,                 -- NULL = орган не сматчен (виден только МНЭ)
    npa_title      TEXT,
    npa_kind       TEXT NOT NULL CHECK (npa_kind IN ('code','law','bylaw')),
    deadlines      DATE[],               -- все сроки портала (по частям акта)
    deadline       DATE,                 -- рабочий срок: ближайший будущий, иначе последний прошедший
    deadline_src   TEXT NOT NULL DEFAULT 'portal_import'
                   CHECK (deadline_src IN ('portal_import','manual','recalc','cycle')),
    deadline_calc  DATE,                 -- расчётная подсказка: посл. редакция + 3/2 года
    portal_status  TEXT,                 -- статус на портале (Өзекті / Өткізу мерзімі аяқталды / …)
    portal_row     JSONB,                -- сырая строка Приложения 3
    imported_at    TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by     INT REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS npa_ara_uq     ON npa_ara (ngr, authority_code) WHERE ngr IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS npa_ara_uq_ext ON npa_ara (ext_ref, authority_code) WHERE ngr IS NULL;
CREATE INDEX IF NOT EXISTS npa_ara_auth_idx ON npa_ara (authority_code);
CREATE INDEX IF NOT EXISTS npa_ara_dl_idx   ON npa_ara (deadline);

-- Цикл пересмотра акта: один живой цикл на акт
CREATE TABLE IF NOT EXISTS ara_review (
    id                BIGSERIAL PRIMARY KEY,
    ara_id            BIGINT NOT NULL REFERENCES npa_ara(id),
    deadline_snapshot DATE,              -- срок, под который открыт цикл
    status            TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','assigned','in_progress','concluded','approved','cancelled')),
    opened_by    INT REFERENCES users(id),
    opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    conclusion   TEXT CHECK (conclusion IN ('revise','keep')),   -- пересмотреть | оставить
    rationale    TEXT,                   -- обоснование аналитика
    proposals    TEXT,                   -- предложения (что менять / почему оставить)
    concluded_by INT REFERENCES users(id),
    concluded_at TIMESTAMPTZ,
    approved_by  INT REFERENCES users(id),
    approved_at  TIMESTAMPTZ,
    approve_note TEXT,
    CONSTRAINT ara_review_concluded_needs_conclusion
      CHECK (status NOT IN ('concluded','approved') OR conclusion IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ara_review_active
  ON ara_review (ara_id) WHERE status NOT IN ('approved','cancelled');
CREATE INDEX IF NOT EXISTS ara_review_status_idx ON ara_review (status);

-- Поручение модератора аналитику
CREATE TABLE IF NOT EXISTS ara_assignment (
    id           BIGSERIAL PRIMARY KEY,
    review_id    BIGINT NOT NULL REFERENCES ara_review(id),
    assignee_id  INT NOT NULL REFERENCES users(id),
    assigned_by  INT NOT NULL REFERENCES users(id),
    note         TEXT,
    due_date     DATE,
    status       TEXT NOT NULL DEFAULT 'assigned'
        CHECK (status IN ('assigned','accepted','done','cancelled')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_at    TIMESTAMPTZ,
    cancelled_by INT REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ara_assignment_active
  ON ara_assignment (review_id, assignee_id) WHERE status IN ('assigned','accepted');
CREATE INDEX IF NOT EXISTS ara_assignment_assignee_idx ON ara_assignment (assignee_id, status);

-- Адресные уведомления: NULL = всему органу (прежняя семантика сохраняется)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INT;

-- Эффективная группа срока по каждому действующему акту.
-- «подлежит» = сумма четырёх групп (инвариант, проверяется тестом).
CREATE OR REPLACE VIEW v_npa_ara_status AS
SELECT a.*,
  CASE
    WHEN a.deadline IS NULL THEN 'no_deadline'
    WHEN EXISTS (SELECT 1 FROM ara_review r WHERE r.ara_id = a.id AND r.status = 'approved'
                 AND r.deadline_snapshot IS NOT DISTINCT FROM a.deadline) THEN 'on_time'
    WHEN a.deadline < current_date THEN 'overdue'
    ELSE 'not_due'
  END AS ara_group
FROM npa_ara a
WHERE COALESCE(a.portal_status, '') NOT ILIKE '%утратив%'
  AND COALESCE(a.portal_status, '') NOT ILIKE '%күшін жой%';

INSERT INTO schema_migrations (version, filename, checksum, note)
VALUES (45, '045_ara_cycle.sql', md5('045_ara_cycle_v1'),
        'цикл АРА: npa_ara + ara_review + ara_assignment + v_npa_ara_status + notifications.user_id')
ON CONFLICT (version) DO NOTHING;
