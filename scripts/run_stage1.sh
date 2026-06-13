#!/usr/bin/env bash
# run_stage1.sh — оркестратор Этапа 1 MVP портала требований РК.
#
# Что делает (последовательно, останавливается на первой ошибке):
#   1. Применяет init-db.sql (если БД пустая)
#   2. Применяет миграции из scripts/migrations/*.sql
#   3. Загружает 4 слоя source_fragments (~11 000 строк)
#   4. Импортирует справочник ОКЭД (1301) и кросс-сферные дубли (топ-100)
#   5. Маппит 304 услуги к сферам (вручную составленный словарь)
#   6. Импортирует голоса экспертов 1/4/5/6
#   7. Печатает финальную сводку
#
# Запуск:
#   export DATABASE_URL="postgresql://...?sslmode=require"
#   bash scripts/run_stage1.sh
#
# При первом запуске на чистой Railway-БД использовать с --init:
#   bash scripts/run_stage1.sh --init

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL не задан."
    echo "Пример: export DATABASE_URL=\"postgresql://postgres:PASS@host.railway.app:PORT/railway?sslmode=require\""
    exit 1
fi

INIT_FLAG=""
if [[ "${1:-}" == "--init" ]]; then
    INIT_FLAG="--init"
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  ЭТАП 1: РАЗВЁРТЫВАНИЕ БАЗЫ И ЗАГРУЗКА СЫРЬЯ ПО 3 СФЕРАМ"
echo "═══════════════════════════════════════════════════════════════"
echo "  DATABASE_URL: ${DATABASE_URL:0:40}..."
echo

echo "─── Шаг 1/6: миграции ────────────────────────────────────────"
python3 scripts/apply_migrations.py $INIT_FLAG
echo

echo "─── Шаг 2/6: загрузка 4 слоёв source_fragments ───────────────"
python3 scripts/load_3spheres.py --truncate
echo

echo "─── Шаг 3/6: импорт ОКЭД и кросс-сферных дублей ──────────────"
python3 scripts/import_dashboard_metrics.py
echo

echo "─── Шаг 4/6: маппинг услуг → сферы ───────────────────────────"
python3 scripts/map_services_to_spheres.py
echo

echo "─── Шаг 5/6: импорт голосов экспертов 1/4/5/6 ────────────────"
python3 scripts/import_ml_votes.py
echo

echo "─── Шаг 6/6: финальная сводка ────────────────────────────────"
python3 - << 'EOF'
import os, psycopg2
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

print("\n▶ source_fragments по сфере и слою:")
cur.execute("""
    SELECT sphere_code, source_layer, COUNT(*)
      FROM source_fragments
     GROUP BY sphere_code, source_layer
     ORDER BY sphere_code, source_layer
""")
for sc, sl, cnt in cur.fetchall():
    print(f"  {sc or '(NULL)':<10}  {sl:<15}  {cnt:>6}")

print("\n▶ Услуги по сферам (после маппинга):")
cur.execute("""
    SELECT sphere_code, COUNT(*)
      FROM service_to_sphere_map
     GROUP BY sphere_code
     ORDER BY 1
""")
for sc, cnt in cur.fetchall():
    print(f"  {sc or '(не назначено)':<15}  {cnt:>4}")

print("\n▶ Консенсус голосов (v_ml_consensus):")
cur.execute("SELECT consensus, COUNT(*) FROM v_ml_consensus GROUP BY consensus ORDER BY 1")
for cons, cnt in cur.fetchall():
    print(f"  {cons:<12}  {cnt:>5}")

print("\n▶ ОКЭД по секциям A-T:")
cur.execute("SELECT section, COUNT(*) FROM okved GROUP BY section ORDER BY section")
for s, c in cur.fetchall():
    print(f"  {s or '-':<3}  {c:>5}")

print("\n▶ Группы дубликатов (seed):")
cur.execute("SELECT duplicate_type, COUNT(*) FROM duplicate_groups GROUP BY duplicate_type")
for t, c in cur.fetchall():
    print(f"  {t:<15}  {c:>5}")

cur.close()
conn.close()
EOF

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ ЭТАП 1 ЗАВЕРШЁН"
echo "  Дальше: Этап 2 — генерация канонических карточек батчами."
echo "═══════════════════════════════════════════════════════════════"
