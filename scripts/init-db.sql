-- Инициализация БД для системы экспертной оценки требований НПА
-- Запуск: psql $DATABASE_URL -f init-db.sql

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200),
    role VARCHAR(20) NOT NULL DEFAULT 'expert' CHECK (role IN ('admin', 'expert')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- НПА документы
CREATE TABLE IF NOT EXISTS npa_documents (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category VARCHAR(50),
    sphere VARCHAR(30) DEFAULT 'land',
    adilet_url TEXT,
    filename VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Итерации экспертизы
CREATE TABLE IF NOT EXISTS iterations (
    id SERIAL PRIMARY KEY,
    iteration_number INT NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Требования
CREATE TABLE IF NOT EXISTS requirements (
    id SERIAL PRIMARY KEY,
    iteration_id INT REFERENCES iterations(id),
    npa_document_id INT REFERENCES npa_documents(id),
    external_id VARCHAR(20),
    category VARCHAR(10) NOT NULL,
    text_original TEXT NOT NULL,
    text_summary TEXT,
    article_ref TEXT,
    subject VARCHAR(50),
    expert_category VARCHAR(20),
    confidence VARCHAR(20) DEFAULT 'medium',
    detection_method VARCHAR(30) DEFAULT 'regex',
    admin_status VARCHAR(20) DEFAULT 'active',
    admin_reject_reason TEXT,
    gold_standard_id VARCHAR(20),
    gold_standard_title TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Голоса экспертов
CREATE TABLE IF NOT EXISTS expert_votes (
    id SERIAL PRIMARY KEY,
    requirement_id INT REFERENCES requirements(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id),
    iteration_id INT REFERENCES iterations(id),
    vote VARCHAR(20) NOT NULL CHECK (vote IN ('confirm', 'reject', 'uncertain')),
    comment TEXT,
    voted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(requirement_id, user_id, iteration_id)
);

-- Лог действий
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_requirements_iteration ON requirements(iteration_id);
CREATE INDEX IF NOT EXISTS idx_requirements_category ON requirements(category);
CREATE INDEX IF NOT EXISTS idx_requirements_npa ON requirements(npa_document_id);
CREATE INDEX IF NOT EXISTS idx_requirements_admin_status ON requirements(admin_status);
CREATE INDEX IF NOT EXISTS idx_votes_requirement ON expert_votes(requirement_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON expert_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_iteration ON expert_votes(iteration_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_npa_sphere ON npa_documents(sphere);
