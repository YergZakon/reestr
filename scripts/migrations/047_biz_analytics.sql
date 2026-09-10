-- 047: счётчик посещаемости бизнес-навигатора (business.rot.kz).
-- До этого статистики не было: HTTP-логи Railway живут 7 дней и не различают людей.
--
-- Приватность: персональные данные не хранятся. IP не сохраняется — вместо него
-- visitor_key = HMAC(ip + user-agent + ДАТА): в пределах суток отличает посетителей
-- друг от друга, но связать визиты одного человека между днями невозможно
-- (соль меняется датой). Cookie не используются: session_id живёт в sessionStorage
-- вкладки. Referrer сохраняется только доменом, user-agent — только типом устройства.
CREATE TABLE IF NOT EXISTS biz_event (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
    day         DATE        NOT NULL DEFAULT current_date,
    event       TEXT        NOT NULL CHECK (event IN (
                  'visit',          -- открыт сайт
                  'activity_pick',  -- выбран вид деятельности (сценарий/ОКЭД/отрасль)
                  'bin_lookup',     -- поиск по БИН/ИИН
                  'survey_view',    -- открыт уточняющий опросник
                  'report_view',    -- получен перечень требований
                  'conclusion',     -- запрошено ИИ-заключение
                  'pdf')),          -- скачан PDF
    session_id  TEXT NOT NULL,      -- случайный id вкладки (sessionStorage), не cookie
    visitor_key TEXT NOT NULL,      -- HMAC(ip|ua|день), необратим, живёт одни сутки
    lang        TEXT,
    device      TEXT,               -- mobile | tablet | desktop
    ref_host    TEXT,               -- только домен источника перехода
    oked        TEXT,
    section     TEXT,
    title       TEXT,
    path        TEXT,               -- new | expand
    meta        JSONB
);
CREATE INDEX IF NOT EXISTS biz_event_day_idx     ON biz_event (day);
CREATE INDEX IF NOT EXISTS biz_event_ev_day_idx  ON biz_event (event, day);
CREATE INDEX IF NOT EXISTS biz_event_session_idx ON biz_event (session_id);

INSERT INTO schema_migrations (version, filename, checksum, note)
VALUES (47, '047_biz_analytics.sql', md5('047_biz_analytics_v1'),
        'счётчик посещаемости бизнес-навигатора: biz_event (без персданных)')
ON CONFLICT (version) DO NOTHING;
