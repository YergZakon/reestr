-- 028: email-канал уведомлений (Д5, продолжение).
-- users.email — адрес для писем модератору/эксперту (nullable: у техаккаунтов может не быть).
-- notifications.email_sent_at — отметка рассылки (NULL = ещё не отправлялось).

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq ON users (lower(email)) WHERE email IS NOT NULL;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notif_unsent ON notifications (email_sent_at) WHERE email_sent_at IS NULL;
