-- 030: ministry = детерминированная производная от authority_code.
-- Проблема: текстовое поле requirement_registry.ministry копилось из разных
-- источников («…РК» / без, старые названия МИИР, чужие министерства) —
-- фасет «Орган» показывал дубли (два «Минобороны») и враньё.
-- Решение: единственный источник истины — organizations; ministry всегда
-- name_ru КОРНЕВОГО органа (комитет → его министерство; акимат/агентство — сам).
-- Триггер держит поле в синхроне при любых INSERT/UPDATE authority_code
-- (воркер, каскад назначений «комитет↔НПА», скрипты конвейера).

CREATE OR REPLACE FUNCTION rr_sync_ministry() RETURNS trigger AS $$
BEGIN
  IF NEW.authority_code IS NOT NULL THEN
    SELECT o.name_ru INTO NEW.ministry
    FROM (
      WITH RECURSIVE up AS (
        SELECT id, parent_id, name_ru FROM organizations WHERE code = NEW.authority_code
        UNION ALL
        SELECT p.id, p.parent_id, p.name_ru FROM organizations p JOIN up ON p.id = up.parent_id
      )
      SELECT name_ru FROM up WHERE parent_id IS NULL LIMIT 1
    ) o;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rr_sync_ministry ON requirement_registry;
CREATE TRIGGER trg_rr_sync_ministry
  BEFORE INSERT OR UPDATE OF authority_code ON requirement_registry
  FOR EACH ROW EXECUTE FUNCTION rr_sync_ministry();
