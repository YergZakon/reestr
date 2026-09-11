-- 048: порядок выполнения требований (2026-09-11).
-- Отчёт группировал требования по стадиям жизненного цикла — «крупными мазками».
-- Но внутри стадии часть требований физически нельзя выполнить, пока не получен
-- документ из другого требования (лицензию не получить без права на помещение,
-- сбор не внести без решения о выдаче). Здесь — что требование ПРОИЗВОДИТ
-- (документ) и что должно быть готово ДО него (закрытый список предпосылок).
CREATE TABLE IF NOT EXISTS req_order (
    card_id    BIGINT PRIMARY KEY REFERENCES requirement_registry(id),
    produces   TEXT,        -- документ на выходе (лицензия, заключение…), NULL если требование ничего не выдаёт
    prereq     TEXT[] NOT NULL DEFAULT '{}',  -- коды предпосылок из справочника ниже
    kind       TEXT CHECK (kind IN ('permit','action','ongoing')),
    model      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS req_order_kind_idx ON req_order (kind);
CREATE INDEX IF NOT EXISTS req_order_prereq_idx ON req_order USING GIN (prereq);

-- Справочник предпосылок: закрытый список — иначе формулировки расходятся
-- и порядок не выстроить (проверено на пилоте).
CREATE TABLE IF NOT EXISTS order_prereq_dict (
    code TEXT PRIMARY KEY,
    name_ru TEXT NOT NULL,
    name_kk TEXT,
    sort INT NOT NULL DEFAULT 0
);
INSERT INTO order_prereq_dict (code, name_ru, name_kk, sort) VALUES
  ('reg_business',  'регистрация бизнеса (ЮЛ или ИП)',        'бизнесті тіркеу (ЗТ немесе ЖК)',            1),
  ('tax_reg',       'налоговый учёт, касса',                   'салық есебі, касса',                        2),
  ('premises',      'право на помещение или участок',          'үй-жайға немесе жер учаскесіне құқық',      3),
  ('project_doc',   'проектная документация',                  'жобалық құжаттама',                         4),
  ('equipment',     'оборудование, приборы, транспорт',        'жабдық, аспаптар, көлік',                   5),
  ('staff',         'персонал, обучение или аттестация',       'персонал, оқыту немесе аттестаттау',        6),
  ('measurement',   'замеры, испытания, экспертиза',           'өлшеулер, сынақтар, сараптама',             7),
  ('prior_permit',  'ранее полученное разрешение или лицензия','бұрын алынған рұқсат немесе лицензия',      8),
  ('registry_entry','включение в государственный реестр',      'мемлекеттік тізілімге енгізу',              9)
ON CONFLICT (code) DO UPDATE SET name_ru = EXCLUDED.name_ru, name_kk = EXCLUDED.name_kk, sort = EXCLUDED.sort;

INSERT INTO schema_migrations (version, filename, checksum, note)
VALUES (48, '048_req_order.sql', md5('048_req_order_v1'),
        'порядок выполнения: req_order (produces/prereq/kind) + справочник предпосылок')
ON CONFLICT (version) DO NOTHING;
