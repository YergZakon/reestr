// Сид самоочищающихся e2e-данных ПРЯМО в БД (DATABASE_URL из .env.local):
//  - пользователь e2e_smoke (admin, случайный пароль → .e2e-state.json, gitignored)
//  - pending-карточка реестра source='e2e_test' с уникальным маркерным титулом
// Удаление — в global-teardown. Если teardown не отработал (упавший прогон),
// повторный setup сначала зачищает остатки по маркерам.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import bcrypt from "bcryptjs";

export const STATE_FILE = join(__dirname, ".e2e-state.json");
const MARKER = "E2E_SMOKE_" + new Date().toISOString().slice(0, 10);

/** Мини-парсер .env.local (пакет dotenv в deps веба отсутствует — Next читает env сам). */
export function loadEnvLocal() {
  const p = join(__dirname, "..", "..", ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export default async function globalSetup() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL не найден (.env.local)");
  const c = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : undefined });
  await c.connect();

  // зачистка возможных остатков прошлых прогонов
  await c.query(`DELETE FROM registry_edits WHERE registry_id IN
                 (SELECT id FROM requirement_registry WHERE source='e2e_test')`);
  await c.query(`DELETE FROM requirement_registry WHERE source='e2e_test'`);
  await c.query(`DELETE FROM user_authorities WHERE user_id IN (SELECT id FROM users WHERE username='e2e_smoke')`);
  await c.query(`DELETE FROM activity_log WHERE user_id IN (SELECT id FROM users WHERE username='e2e_smoke')`);
  await c.query(`DELETE FROM users WHERE username='e2e_smoke'`);

  const password = randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(password, 10);
  const u = await c.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ('e2e_smoke', $1, 'E2E смоук', 'admin', true) RETURNING id`, [hash]);

  const card = await c.query(
    `INSERT INTO requirement_registry
       (source, trust, ngr, npa_title, article, title, legal_text, subject, action,
        sphere_code, ministry, authority_code, review_status, npa_status, is_canonical)
     VALUES ('e2e_test','e2e','E2E0000001', $1, 'ст.1', $1,
             'Тестовая норма для сквозной проверки очереди ревью (создаётся и удаляется автоматически).',
             'Тестовый субъект', 'выполнить сквозную проверку',
             'me', 'E2E-стенд', '_e2e', 'pending', 'действующий', true)
     -- authority_code '_e2e': '_' < 'a' в ASCII → строка гарантированно ПЕРВАЯ в очереди
     -- (ORDER BY authority_code, sphere_code, id), не теряется среди тысяч pending.
     RETURNING id`, [MARKER + " — Об утверждении тестовых правил"]);

  await c.end();
  writeFileSync(STATE_FILE, JSON.stringify({
    username: "e2e_smoke", password, userId: u.rows[0].id, cardId: card.rows[0].id, marker: MARKER,
  }));
  console.log(`[e2e-setup] user e2e_smoke (id=${u.rows[0].id}), card id=${card.rows[0].id}, marker=${MARKER}`);
}
