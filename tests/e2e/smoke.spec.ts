// Сквозной смоук: login → каталог → очередь ревью → confirm → карточка ушла из pending.
// Данные самоочищающиеся (global-setup/teardown). Мутируется ТОЛЬКО сид-карточка source='e2e_test'.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

const state = () => JSON.parse(readFileSync(join(__dirname, ".e2e-state.json"), "utf-8"));

test("login → каталог → ревью (сквозной смоук)", async ({ page }) => {
  const { username, password, cardId, marker } = state();

  // 1. Логин через UI (admin → редирект на /cards/admin)
  await page.goto("/login");
  await page.locator('input[type="text"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/cards\/admin/, { timeout: 20_000 });

  // 2. Каталог рендерит карточки реестра
  await page.goto("/registry");
  await expect(page.locator(".reg-card").first()).toBeVisible({ timeout: 20_000 });

  // 3. Режим «Ревью»: сид-карточка находится ПОИСКОМ очереди (сортировка text
  //    зависит от коллации БД — позиция в общем списке не гарантирована)
  await page.getByRole("button", { name: /Ревью/ }).first().click();
  await page.getByPlaceholder("Поиск по тексту / ngr…").fill(marker);
  await expect(page.locator(".reg-rev-row", { hasText: marker }).first())
    .toBeVisible({ timeout: 20_000 });

  // 4. Confirm сид-карточки (API с cookie сессии страницы) — та же ручка, что зовёт UI
  const res = await page.request.post("/api/registry/review", {
    data: { id: cardId, action: "confirm", ara_deadline: "2027-12-31" },
  });
  expect(res.ok(), `review confirm: ${res.status()}`).toBeTruthy();

  // 5. После обновления: в pending по маркеру — пусто (карточка ушла в confirmed)
  await page.reload();
  await page.getByRole("button", { name: /Ревью/ }).first().click();
  await page.getByPlaceholder("Поиск по тексту / ngr…").fill(marker);
  await expect(page.locator(".reg-rev-row", { hasText: marker })).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".reg-rev-row").first().or(page.locator(".reg-empty")))
    .toBeVisible({ timeout: 20_000 }); // очередь как таковая отрисована
});
