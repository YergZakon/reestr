-- 023_org_hierarchy.sql — иерархический справочник госорганов + орг-скоуп ролей.
-- Применяется через scripts/registry/seed_organizations.py (DDL продублирован там).

-- Единая самоссылочная иерархия органов (заменяет плоский authorities как источник истины).
CREATE TABLE IF NOT EXISTS organizations (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(40) UNIQUE NOT NULL,       -- для министерств = authorities.code (совпадает с requirement_registry.authority_code)
    parent_id     INT REFERENCES organizations(id) ON DELETE SET NULL,
    type          VARCHAR(20) NOT NULL,              -- ministry|committee|department|agency|akimat|akimat_dept
    name_ru       TEXT NOT NULL,
    name_kz       TEXT,
    short_name    VARCHAR(60),
    sphere_codes  TEXT[],                            -- какие сферы курирует (маршрутизация)
    is_regulator  BOOLEAN DEFAULT true,              -- может быть регулирующим органом
    region_code   VARCHAR(20),                       -- для акиматов
    active        BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_parent ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS org_type   ON organizations(type);

-- Членство пользователя в узле органа (+ роль в узле). Доступ = узел + потомки ∩ user_spheres.
CREATE TABLE IF NOT EXISTS user_orgs (
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id      INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    org_role    VARCHAR(20) NOT NULL DEFAULT 'member',  -- member (рецензент) | moderator (глава органа)
    assigned_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, org_id)
);
CREATE INDEX IF NOT EXISTS user_orgs_user ON user_orgs(user_id);
CREATE INDEX IF NOT EXISTS user_orgs_org  ON user_orgs(org_id);

-- Роль moderator (глава органа): admin (МНЭ super) | moderator | expert (рецензент).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check CHECK (role IN ('admin', 'moderator', 'expert'));
