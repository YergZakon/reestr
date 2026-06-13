-- 012_card_embeddings.sql
-- Кэш эмбеддингов для requirement_cards.legal_text.
-- Отдельная таблица, чтобы не раздувать requirement_cards и можно было пересчитать
-- при смене модели/версии без миграции основной схемы.

CREATE TABLE IF NOT EXISTS card_embeddings (
    card_id     INT PRIMARY KEY REFERENCES requirement_cards(id) ON DELETE CASCADE,
    model       TEXT NOT NULL,         -- например 'BAAI/bge-m3'
    dim         INT  NOT NULL,         -- 1024 для bge-m3
    embedding   BYTEA NOT NULL,        -- float32 little-endian, dim*4 байт
    text_hash   TEXT NOT NULL,         -- md5(legal_text) — переcчёт если текст изменился
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_embeddings_model ON card_embeddings (model);

COMMENT ON TABLE card_embeddings IS 'Кэш эмбеддингов legal_text. Пересчёт при смене модели или text_hash.';
