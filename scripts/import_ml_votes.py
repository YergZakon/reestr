"""
import_ml_votes.py — импорт голосов экспертов 1, 4, 5, 6 из vote_matrix_2026-04-27.csv
в таблицу ml_expert_votes.

Файл vote_matrix содержит 10 колонок expert_1..expert_10, но согласно стратегии
учитываем только экспертов 1, 4, 5 и 6.

После строки ~1845 в CSV есть повреждённые данные (последствия парсинга
многострочных полей). Скрипт фильтрует их по валидной сфере и категории.

Связка с source_fragments — по external_id (REQ-XXXXX) или комбинации
(npa_title + article_ref + text). Для слоя ml_dataset external_id уникален.

Запуск:
    DATABASE_URL=postgresql://... python import_ml_votes.py
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
VOTE_MATRIX_PATH = PROJECT_ROOT / "vote_matrix_2026-04-27.csv"

EXPERT_COLUMNS = ["expert_1", "expert_4", "expert_5", "expert_6"]   # из 10 колонок берём только эти
VALID_VOTES = {"confirm", "reject", "uncertain"}
VALID_SPHERES = {"land", "transport", "ecology"}
VALID_CATEGORIES = {"OBL", "ZAP", "USL", "SRK", "DOC", "FIN", "OTV", "PRO", "STD", "LIC", "REP"}


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not set.")

    if not VOTE_MATRIX_PATH.exists():
        sys.exit(f"ERROR: vote_matrix not found at {VOTE_MATRIX_PATH}")

    print(f"[votes] Чтение {VOTE_MATRIX_PATH.name}...")

    rows_to_insert = []
    junk_rows = 0
    valid_rows = 0
    no_match_count = 0

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:

            # Сначала собираем все external_id из source_fragments слоя ml_dataset
            cur.execute("""
                SELECT external_id, id
                  FROM source_fragments
                 WHERE source_layer = 'ml_dataset' AND external_id IS NOT NULL
            """)
            ext_to_fragment = {row[0]: row[1] for row in cur.fetchall()}
            print(f"[votes] В БД найдено {len(ext_to_fragment)} ml_dataset-фрагментов")

            with open(VOTE_MATRIX_PATH, "r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f, delimiter=";")
                for row in reader:
                    sphere = (row.get("sphere") or "").strip()
                    category = (row.get("category") or "").strip()
                    external_id = (row.get("external_id") or "").strip()

                    # Отбрасываем мусор (повреждённые строки после ~1845)
                    if sphere not in VALID_SPHERES or category not in VALID_CATEGORIES:
                        junk_rows += 1
                        continue
                    if not external_id.startswith("REQ-"):
                        junk_rows += 1
                        continue

                    fragment_id = ext_to_fragment.get(external_id)
                    if fragment_id is None:
                        no_match_count += 1
                        continue

                    valid_rows += 1
                    for col in EXPERT_COLUMNS:
                        vote = (row.get(col) or "").strip().lower()
                        if vote in VALID_VOTES:
                            expert_num = int(col.split("_")[1])
                            rows_to_insert.append((fragment_id, expert_num, vote))

            print(f"[votes] Валидных строк vote_matrix:    {valid_rows}")
            print(f"[votes] Отброшено мусора:              {junk_rows}")
            print(f"[votes] Не нашли соответствия в БД:    {no_match_count}")
            print(f"[votes] Голосов к загрузке:            {len(rows_to_insert)}")

            if rows_to_insert:
                # Очистка перед загрузкой (на случай повторного запуска)
                cur.execute("DELETE FROM ml_expert_votes")
                execute_values(
                    cur,
                    """
                    INSERT INTO ml_expert_votes (fragment_id, expert_number, vote)
                    VALUES %s
                    ON CONFLICT (fragment_id, expert_number) DO UPDATE
                        SET vote = EXCLUDED.vote
                    """,
                    rows_to_insert,
                    page_size=500,
                )
                conn.commit()
                print(f"[votes] Загружено в ml_expert_votes: {len(rows_to_insert)}")

            # Срез по консенсусу
            cur.execute("""
                SELECT consensus, COUNT(*)
                  FROM v_ml_consensus
                 GROUP BY consensus
                 ORDER BY consensus
            """)
            print()
            print("Консенсус (v_ml_consensus):")
            for consensus, cnt in cur.fetchall():
                print(f"  {consensus:<12} {cnt:>5}")


if __name__ == "__main__":
    main()
