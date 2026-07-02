-- 026: уведомления органам (Д5, заготовка): новые pending-карточки и приближение сроков АРА.
-- Генерацию выполняет конвейер (scripts/registry/generate_notifications.py), чтение — API
-- GET /api/notifications (скоуп по органам пользователя). Additive, безопасно.

CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  authority_code TEXT NOT NULL,             -- кому (орган); пользователи видят по своему скоупу
  type         TEXT NOT NULL,               -- new_pending | ara_soon
  dedup_key    TEXT NOT NULL,               -- защита от повторной генерации (тип+объект+период)
  title        TEXT NOT NULL,               -- человекочитаемый заголовок
  payload      JSONB,                       -- детали: count, ngr, ids, deadline…
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_by      INT[],                       -- id пользователей, отметивших прочитанным
  UNIQUE (dedup_key)
);
CREATE INDEX IF NOT EXISTS notif_authority ON notifications(authority_code, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_type ON notifications(type);
