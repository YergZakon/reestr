# E2E-смоук (Playwright)

Сквозной сценарий: **login → каталог → очередь ревью → confirm → карточка ушла из pending**.

## Данные
Самоочищающиеся, создаются `global-setup.ts` напрямую в БД и удаляются `global-teardown.ts`:
- пользователь `e2e_smoke` (admin, случайный пароль → `.e2e-state.json`, в git не попадает);
- pending-карточка `source='e2e_test'` с маркерным титулом `E2E_SMOKE_<дата>`.
Мутируется **только** сид-карточка. Остатки прошлых упавших прогонов зачищаются в setup.

## Запуск (локально)
```bash
npm run build          # standalone-сборка (нужен JWT_SECRET в env и для build)
cp -r .next/static .next/standalone/.next/static   # статика для standalone-сервера
DATABASE_URL=... JWT_SECRET=<локальный> PORT=3100 npm run test:e2e
```
- `DATABASE_URL` — БД с данными реестра (standalone-сервер НЕ читает `.env.local`);
  setup/teardown при отсутствии переменной сами читают `.env.local`.
- Сервер поднимает Playwright (`webServer`, порт 3100, reuseExistingServer).

## Известные особенности
- Поиск сид-карточки в очереди — через поле «Поиск по тексту / ngr…» (позиция строки
  в общем списке зависит от коллации Postgres, на неё не полагаемся).
- В CI НЕ включён: нужен staging-БД (см. docs/architecture/09, Ф1). После появления
  staging добавить шаг в .github/workflows/ci.yml с секретами окружения.
