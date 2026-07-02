-- 029: назначение ответственного комитета за НПА (связка «комитет → НПА» как
-- первоклассная сущность; authority_code на требованиях становится ПРОИЗВОДНЫМ —
-- каскадно обновляется при назначении/отмене). Журнальная модель: строка = событие;
-- активное назначение НПА не более одного (частичный уникальный индекс).

CREATE TABLE IF NOT EXISTS npa_assignment (
  id           BIGSERIAL PRIMARY KEY,
  ngr          TEXT NOT NULL,
  org_id       INT  NOT NULL REFERENCES organizations(id),
  assigned_by  INT  REFERENCES users(id),
  reason       TEXT,                                   -- основание назначения (из формы)
  status       TEXT NOT NULL DEFAULT 'назначено',      -- назначено | отменено
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by INT REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS npa_assignment_active ON npa_assignment (ngr) WHERE status = 'назначено';
CREATE INDEX IF NOT EXISTS npa_assignment_ngr ON npa_assignment (ngr);
CREATE INDEX IF NOT EXISTS npa_assignment_org ON npa_assignment (org_id);
