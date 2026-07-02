// E2E-смоук (login → каталог → ревью). ЛОКАЛЬНЫЙ запуск: npm run test:e2e
// Требует: собранное приложение (npm run build) и переменные окружения сервера
// (DATABASE_URL из .env.local подхватит next start; JWT_SECRET задать при запуске).
// В CI НЕ включён до появления staging-БД (см. docs/architecture/09, Ф1).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // сид-данные общие — последовательно
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    // output:standalone → штатный запуск. Перед первым прогоном после build скопировать статику:
    //   cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
    // Серверу нужны env: DATABASE_URL, JWT_SECRET, PORT=3100 (standalone не читает .env.local).
    command: "node .next/standalone/server.js",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
