# Этап 1 — расширение БД и загрузка сырых данных по 3 сферам

Это первый этап MVP портала требований по сферам «земля», «транспорт», «экология».
План целиком: `C:\Users\yergali\.claude\plans\tingly-crafting-hartmanis.md`.

## Что должно получиться

После выполнения всех шагов в PostgreSQL появятся:
- расширенная схема (15 таблиц + 3 представления);
- ~11 000 source_fragments по 3 сферам (4 слоя источников);
- 304 услуги в `service_to_sphere_map` (≈70-80 из них — наши 3 сферы);
- голоса экспертов 1/4/5/6 в `ml_expert_votes`;
- 1301 ОКЭД в справочнике + seed кросс-сферных дублей.

## Предусловия

1. **PostgreSQL ≥ 14**, доступная по `DATABASE_URL` (Railway или локально).
2. **Python ≥ 3.10** с пакетами:
   ```bash
   pip install psycopg2-binary
   ```
3. Существующая схема `init-db.sql` уже применена (либо запустите её первой):
   ```bash
   psql "$DATABASE_URL" -f scripts/init-db.sql
   ```
4. (Опционально) Запущен seed для пользователей и базовых таблиц:
   ```bash
   npm run seed
   ```

## Установка переменной окружения

Windows PowerShell:
```powershell
$env:DATABASE_URL = "postgresql://postgres:PASSWORD@HOST:PORT/railway"
```

bash / WSL:
```bash
export DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway"
```

## Шаги Этапа 1

Все команды запускаются из `ochistka_trebov-main/`.

### 1. Применить миграции (Этап 1.1)

```bash
psql "$DATABASE_URL" -f scripts/migrations/001_canonical_cards.sql
psql "$DATABASE_URL" -f scripts/migrations/002_ml_expert_votes.sql
```

Создаст таблицы:
- `spheres`, `okved`, `condition_dict`, `service_to_sphere_map`,
- `requirement_cards`, `source_fragments`, `field_metadata`,
- `npa_links`, `okved_links`, `applicability_rules`, `duplicate_groups`, `burden_metrics`,
- `scenarios`, `scenario_cards`, `batch_log`,
- `ml_expert_votes`,
- представления `v_fragments_by_sphere_layer`, `v_cards_by_sphere_role`, `v_duplicates_summary`, `v_ml_consensus`.

### 2. Загрузить 4 слоя сырья (Этап 1.2)

```bash
python scripts/load_3spheres.py --truncate
```

Источники и ожидаемые объёмы:
| Слой | Источник | Строк по 3 сферам |
|---|---|---:|
| `rot_checklist` | `regulatory-dashboard/data/raw/data_requirements.csv.gz` | ~5 200 |
| `services` | `Новая папка 3/требования_service_name.csv` | 2 287 (sphere=NULL до шага 3) |
| `ml_dataset` | `ml_dataset_2026-04-27.csv` | ~1 840 |
| `npa_extracted` | `NPA/output/requirements_ecology.json`, `requirements_transport.json`, `requirements_reanalyzed.json` | ~3 220 |
| **Итого** | | **~12 500** |

Опции:
- `--layer rot|services|ml|npa|all` — загружать только один слой.
- `--truncate` — очистить `source_fragments` перед загрузкой.

Проверка после загрузки:
```sql
SELECT * FROM v_fragments_by_sphere_layer;
```

### 3. Привязать услуги к 3 сферам (Этап 1.3)

```bash
python scripts/map_services_to_spheres.py
```

Применяет ручную классификацию 304 услуг на:
- ~8 земельных,
- ~45 транспортных,
- ~25 экологических,
- ~225 «прочих» (sphere='other', в MVP-витрину не попадут).

После этого у фрагментов слоя `services` будет проставлен `sphere_code`.

### 4. Импортировать голоса экспертов 1/4/5/6 (Этап 1.4)

```bash
python scripts/import_ml_votes.py
```

Парсит `vote_matrix_2026-04-27.csv`, отбрасывает повреждённые строки после
~1845, берёт только колонки `expert_1, expert_4, expert_5, expert_6` и пишет
в `ml_expert_votes`.

Проверка:
```sql
SELECT * FROM v_ml_consensus LIMIT 10;
SELECT consensus, COUNT(*) FROM v_ml_consensus GROUP BY consensus;
```

Ожидаемое распределение consensus:
- `confirmed` (≥3 голосов confirm): ~1 100
- `rejected`  (≥3 голосов reject):   ~50
- `disputed`:                        ~700

### 5. Импортировать ОКЭД и seed дубликатов (Этап 1.5)

```bash
python scripts/import_dashboard_metrics.py
```

Загружает:
- 1 301 ОКЭД из `regulatory-dashboard/data/generated/oked_summary.json` в таблицу `okved`;
- топ-100 кросс-сферных пар дубликатов как seed для будущей дедупликации (Этап 3).

## Проверочные запросы после завершения Этапа 1

```sql
-- Срез по сфере и слою (главная сводка)
SELECT * FROM v_fragments_by_sphere_layer;

-- Сколько услуг привязано к каждой сфере
SELECT sphere_code, COUNT(*)
  FROM service_to_sphere_map
 GROUP BY sphere_code
 ORDER BY 2 DESC;

-- Распределение фрагментов слоя services по 3 сферам (без 'other')
SELECT sphere_code, COUNT(*)
  FROM source_fragments
 WHERE source_layer = 'services' AND sphere_code IN ('land','transport','ecology')
 GROUP BY sphere_code;

-- Экспертный консенсус
SELECT consensus, COUNT(*) FROM v_ml_consensus GROUP BY consensus;

-- Сколько ОКЭД в справочнике
SELECT section, COUNT(*) FROM okved GROUP BY section ORDER BY 1;
```

## Что дальше

После успешного Этапа 1 переходим к Этапу 2 — **генерация канонических карточек
батчами в чате**. Я (Claude в чате) буду вытягивать `source_fragments` сферой за
сферой и возвращать заполненные `requirement_cards` со всеми 28+ полями
(включая критичную «роль фрагмента»).

Начинаем со сферы **экология** (~4 200 фрагментов, наибольшая выборка gold).
Затем **транспорт** (~1 400). Затем **земля** (~900).

После генерации карточек:
- Этап 3: дедупликация в 3 уровня (~12 500 → ~6 500 канонических).
- Этап 4: применимость (machine-rules) и сценарии.
- Этап 5: расширение `regulatory-dashboard`.
- Этап 6: демо для руководства.
