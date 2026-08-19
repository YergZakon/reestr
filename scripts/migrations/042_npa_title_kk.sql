-- 042: казахские названия НПА (волна 2 двуязычия, 2026-08-19).
-- Источник — заголовки kaz-редакций базы ЗАН (doc_meta.zg, lg='kaz');
-- заполняется скриптом требования/scripts/registry/fill_npa_title_kk.py.
-- Публичный и закрытый интерфейсы при lang=kz JOIN'ят таблицу с фолбэком на русское название.

CREATE TABLE IF NOT EXISTS npa_title_kk (
    ngr        TEXT PRIMARY KEY,
    title_kk   TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version, filename, checksum, note)
VALUES (42, '042_npa_title_kk.sql', md5('042_npa_title_kk_v1'),
        'казахские названия НПА из ЗАН (kaz-редакции)')
ON CONFLICT (version) DO NOTHING;
