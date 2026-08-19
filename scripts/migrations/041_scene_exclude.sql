-- 041: кураторские исключения выдачи бизнес-гида по демо-сценариям
-- (LLM-аудит релевантности + ручные правки; публичный сервис читает фильтром)
CREATE TABLE IF NOT EXISTS business_scene_exclude (
  scene       TEXT NOT NULL,           -- id сценария гида (cafe, shop, ...)
  registry_id INT  NOT NULL REFERENCES requirement_registry(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scene, registry_id)
);
