-- 034: админ-управление НПА — статейная гранулярность назначений + исключение из UI.
--
-- 1) npa_assignment.articles: NULL = назначение НПА целиком (прежняя семантика);
--    массив меток article = статейное назначение (часть НПА другому органу).
--    Уникальность «одно активное на ngr» сохраняется ТОЛЬКО для полных назначений —
--    активных статейных на один ngr может быть несколько (разные статьи разным
--    органам); непересечение статей контролирует API (/api/npa-admin).
-- 2) requirement_registry: excluded_at/excluded_by — след исключения из UI
--    (excluded/excluded_reason существуют с миграции 017, но писались только скриптами).

ALTER TABLE npa_assignment ADD COLUMN IF NOT EXISTS articles TEXT[];

DROP INDEX IF EXISTS npa_assignment_active;
CREATE UNIQUE INDEX IF NOT EXISTS npa_assignment_active
  ON npa_assignment (ngr) WHERE status = 'назначено' AND articles IS NULL;

ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ;
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS excluded_by INT;
