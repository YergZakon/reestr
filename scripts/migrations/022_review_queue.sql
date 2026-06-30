-- 022_review_queue.sql — очередь апрува извлечённых требований госорганами + АРА-цикл.
-- Применяется через scripts/registry/apply_migration_022.py (DDL продублирован там).
-- Часть полей (authority_code) ставит scripts/registry/normalize_authority.py.

-- Код органа для фильтрации очереди по аккаунту (ministry → authority code), см. normalize_authority.py
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS authority_code TEXT;
-- Регуляторный цикл АРА (Правила ведения реестра, п.6–13)
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS ara_deadline DATE;        -- срок проведения АРА (п.6)
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS ara_status TEXT;          -- 'на_согласовании' | 'в реестре' | 'исключён'
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS included_at TIMESTAMPTZ;  -- момент включения в реестр (после согласования МНЭ)
-- Глубокая ссылка на конкретную норму (статья/пункт), см. resolve_norm_anchors.py
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS norm_url TEXT;

CREATE INDEX IF NOT EXISTS rr_authority_code ON requirement_registry (authority_code);
CREATE INDEX IF NOT EXISTS rr_review_queue ON requirement_registry (authority_code, review_status);
