import { Pool } from "pg";

// Pool sizing tuned для Railway Pro Postgres + 100 одновременных экспертов.
// max=50 даёт запас при пиковом голосовании; idleTimeout быстро возвращает в pool.
// statement_timeout страхует от долгих запросов (например /admin/stats).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : undefined,
  max: parseInt(process.env.DB_POOL_MAX || "50", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
});

// Логируем критичные события pool (помогает в отладке Railway-инцидентов)
pool.on("error", (err) => {
  console.error("[pg-pool] unexpected error on idle client:", err);
});
pool.on("connect", () => {
  if ((pool as unknown as { totalCount: number }).totalCount % 10 === 0) {
    const p = pool as unknown as { totalCount: number; idleCount: number; waitingCount: number };
    console.log(`[pg-pool] total=${p.totalCount} idle=${p.idleCount} waiting=${p.waitingCount}`);
  }
});

export default pool;

export async function query(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

let initialized = false;

export async function initDB() {
  if (initialized) return;
  initialized = true;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(200),
        role VARCHAR(20) NOT NULL DEFAULT 'expert' CHECK (role IN ('admin', 'expert')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

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

      CREATE TABLE IF NOT EXISTS iterations (
        id SERIAL PRIMARY KEY,
        iteration_number INT NOT NULL DEFAULT 1,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );

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
        sphere VARCHAR(30) DEFAULT 'land',
        created_at TIMESTAMP DEFAULT NOW()
      );

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

      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_requirements_iteration ON requirements(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_requirements_category ON requirements(category);
      CREATE INDEX IF NOT EXISTS idx_requirements_npa ON requirements(npa_document_id);
      CREATE INDEX IF NOT EXISTS idx_requirements_admin_status ON requirements(admin_status);
      CREATE INDEX IF NOT EXISTS idx_votes_requirement ON expert_votes(requirement_id);
      CREATE INDEX IF NOT EXISTS idx_votes_user ON expert_votes(user_id);
      CREATE INDEX IF NOT EXISTS idx_votes_iteration ON expert_votes(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_npa_sphere ON npa_documents(sphere);

      -- Add sphere column to existing databases
      ALTER TABLE npa_documents ADD COLUMN IF NOT EXISTS sphere VARCHAR(30) DEFAULT 'land';
      ALTER TABLE requirements ADD COLUMN IF NOT EXISTS sphere VARCHAR(30) DEFAULT 'land';
      CREATE INDEX IF NOT EXISTS idx_requirements_sphere ON requirements(sphere);
      CREATE INDEX IF NOT EXISTS idx_votes_req_iter_vote ON expert_votes(requirement_id, iteration_id, vote);
    `);
    // Seed default admin user if no users exist
    const userCount = await client.query("SELECT COUNT(*) FROM users");
    if (parseInt(userCount.rows[0].count) === 0) {
      const bcrypt = await import("bcryptjs");
      // Начальный admin создаётся ТОЛЬКО из переменной окружения (без паролей в коде).
      // Модераторов заводит admin (/admin/moderators), аналитиков — модераторы (/moderator/analysts).
      const adminPassword = process.env.SEED_ADMIN_PASSWORD;
      if (!adminPassword) {
        console.warn(
          "SEED_ADMIN_PASSWORD не задан — начальный admin НЕ создан. " +
          "Задайте переменную окружения и перезапустите для первичного сидирования."
        );
      } else {
        const hash = await bcrypt.hash(adminPassword, 10);
        await client.query(
          "INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
          ["admin", hash, "Администратор", "admin"]
        );
        console.log("Начальный admin создан из SEED_ADMIN_PASSWORD");
      }
      // Create initial iteration
      await client.query(
        "INSERT INTO iterations (iteration_number, status, description) VALUES (1, 'active', 'Первичная экспертиза') ON CONFLICT DO NOTHING"
      );
      console.log("Default users and iteration seeded");
    }
    console.log("Database tables initialized");
  } catch (err) {
    console.error("DB init error:", err);
  } finally {
    client.release();
  }
}
