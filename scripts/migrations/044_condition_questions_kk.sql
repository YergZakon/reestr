-- 044: казахские тексты вопросов опросника бизнес-гида (2026-08-19).
-- Заполняются DeepSeek-переводом с фолбэком на русский в API.
ALTER TABLE condition_questions ADD COLUMN IF NOT EXISTS label_kk TEXT;
ALTER TABLE condition_questions ADD COLUMN IF NOT EXISTS hint_kk TEXT;

INSERT INTO schema_migrations (version, filename, checksum, note)
VALUES (44, '044_condition_questions_kk.sql', md5('044_condition_questions_kk_v1'),
        'kk-колонки вопросов опросника')
ON CONFLICT (version) DO NOTHING;
