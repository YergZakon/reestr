"""
apply_migrations.py — применяет init-db.sql и все миграции из scripts/migrations/
к PostgreSQL по DATABASE_URL. Использует psycopg2, чтобы не требовать установки psql.

Порядок:
  1. init-db.sql (если -i/--init)
  2. scripts/migrations/*.sql в алфавитном порядке (всегда, идемпотентно — IF NOT EXISTS)

Использование:
  DATABASE_URL=postgresql://...?sslmode=require python apply_migrations.py
  DATABASE_URL=...                              python apply_migrations.py --init
  DATABASE_URL=...                              python apply_migrations.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg2


SCRIPT_DIR = Path(__file__).resolve().parent
INIT_SQL = SCRIPT_DIR / "init-db.sql"
MIGRATIONS_DIR = SCRIPT_DIR / "migrations"


def collect_files(include_init: bool) -> list[Path]:
    files = []
    if include_init and INIT_SQL.exists():
        files.append(INIT_SQL)
    if MIGRATIONS_DIR.exists():
        files.extend(sorted(MIGRATIONS_DIR.glob("*.sql")))
    return files


def apply_sql(conn, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def main() -> None:
    p = argparse.ArgumentParser(description="Apply SQL migrations via psycopg2.")
    p.add_argument("-i", "--init", action="store_true",
                   help="Применить init-db.sql перед миграциями.")
    p.add_argument("--dry-run", action="store_true",
                   help="Только показать список файлов, не запускать.")
    args = p.parse_args()

    files = collect_files(args.init)
    if not files:
        sys.exit("Не найдено ни одного SQL-файла.")

    print("Будут применены файлы:")
    for f in files:
        print(f"  • {f.relative_to(SCRIPT_DIR.parent)}")

    if args.dry_run:
        print("\n[dry-run] Соединение не открываем.")
        return

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL не задан.")

    print(f"\nПодключение: {db_url[:40]}...")
    with psycopg2.connect(db_url) as conn:
        for f in files:
            print(f"  → applying {f.name}...", end=" ", flush=True)
            try:
                apply_sql(conn, f)
                print("OK")
            except Exception as e:
                conn.rollback()
                print(f"FAIL\n      {e}")
                sys.exit(1)

    print("\nВсе миграции применены ✓")


if __name__ == "__main__":
    main()
