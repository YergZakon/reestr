// Полная зачистка e2e-данных (карточка, журналы, пользователь, state-файл).
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadEnvLocal } from "./global-setup";

const STATE_FILE = join(__dirname, ".e2e-state.json");

export default async function globalTeardown() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) return;
  const c = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  await c.query(`DELETE FROM registry_edits WHERE registry_id IN
                 (SELECT id FROM requirement_registry WHERE source='e2e_test')`);
  const del = await c.query(`DELETE FROM requirement_registry WHERE source='e2e_test'`);
  await c.query(`DELETE FROM user_authorities WHERE user_id IN (SELECT id FROM users WHERE username='e2e_smoke')`);
  await c.query(`DELETE FROM activity_log WHERE user_id IN (SELECT id FROM users WHERE username='e2e_smoke')`);
  await c.query(`DELETE FROM users WHERE username='e2e_smoke'`);
  await c.end();
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  console.log(`[e2e-teardown] удалено карточек e2e_test: ${del.rowCount}; пользователь e2e_smoke снят`);
}
