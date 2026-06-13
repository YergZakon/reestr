# Развёртывание на Railway

## Шаг 1: Создать проект на Railway

1. Зайти на https://railway.app и войти/зарегистрироваться
2. Нажать **"New Project"** → **"Deploy from GitHub repo"**
3. Подключить репозиторий с кодом (или используйте "Empty project")

## Шаг 2: Добавить PostgreSQL

1. В проекте нажать **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway создаст базу и переменную `DATABASE_URL` автоматически
3. Скопировать `DATABASE_URL` — она понадобится для seed

## Шаг 3: Переменные окружения

В настройках сервиса (Variables):

```
DATABASE_URL=postgresql://... (автоматически от Railway PostgreSQL)
JWT_SECRET=npa-expert-secret-2026-CHANGE-ME
```

## Шаг 4: Инициализация базы данных

### Вариант A — локально через seed:
```bash
export DATABASE_URL="postgresql://postgres:XXX@HOSTNAME:PORT/railway"
npm run seed
```

### Вариант B — через Railway CLI:
```bash
npm install -g @railway/cli
railway login
railway link
railway run npm run seed
```

### Вариант C — через psql напрямую:
```bash
psql "$DATABASE_URL" < scripts/init-db.sql
# Затем seed:
DATABASE_URL="$DATABASE_URL" npx tsx scripts/seed.ts
```

## Шаг 5: Деплой

Если через GitHub — Railway автоматически задеплоит при push.

Если вручную:
```bash
railway up
```

## Шаг 6: Проверка

1. Открыть URL приложения (Railway выдаст домен вида `xxx.up.railway.app`)
2. Войти: `admin` / `admin_npa2026!`
3. Или как эксперт: `expert_1` / `expert1_npa2026!`

## Учётные записи

| Логин    | Пароль           | Роль    |
|----------|------------------|---------|
| admin    | admin_npa2026!   | Админ   |
| expert_1 | expert1_npa2026! | Эксперт |
| expert_2 | expert2_npa2026! | Эксперт |
| expert_3 | expert3_npa2026! | Эксперт |
| expert_4 | expert4_npa2026! | Эксперт |

## Структура страниц

- `/login` — Вход в систему
- `/dashboard` — Дашборд со статистикой (категории, НПА, прогресс экспертов, консенсус)
- `/review` — Оценка требований (голосование: подтвердить/отклонить/не уверен)
- `/admin` — Управление реестром (массовое отклонение/восстановление, только для админа)
