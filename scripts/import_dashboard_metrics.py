"""
import_dashboard_metrics.py — импорт справочника ОКЭД и предрасчитанных метрик
из проекта regulatory-dashboard в нашу PostgreSQL.

Источники (из data/generated/):
    oked_summary.json       → таблица okved (1301 ОКЭД с привязкой к секциям A-T)
    sections_summary.json   → справочная информация по 18 секциям
    duplicates.json         → топ кросс-сферных пар → duplicate_groups (до Этапа 3)

Цель: чтобы сразу после Этапа 1 в БД был справочник ОКЭД для будущей привязки
карточек, плюс уже найденные кросс-сферные дубликаты как seed для Этапа 3.

Запуск:
    DATABASE_URL=postgresql://... python import_dashboard_metrics.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values, Json


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # …/Новая папка 3
# Кросс-платформенный путь. Переопределяется через env var DASHBOARD_DIR.
_DASHBOARD_DIR = Path(os.environ.get(
    "DASHBOARD_DIR",
    str(PROJECT_ROOT / "regulatory-dashboard"),
))
DASHBOARD_GENERATED = _DASHBOARD_DIR / "data" / "generated"

PATHS = {
    "oked":     DASHBOARD_GENERATED / "oked_summary.json",
    "sections": DASHBOARD_GENERATED / "sections_summary.json",
    "dups":     DASHBOARD_GENERATED / "duplicates.json",
}

SECTION_NAMES = {
    "A": "Сельское, лесное и рыбное хозяйство",
    "B": "Горнодобывающая промышленность и разработка карьеров",
    "C": "Обрабатывающая промышленность",
    "D": "Электроэнергия, газ, пар",
    "E": "Водоснабжение, водоотведение, отходы",
    "F": "Строительство",
    "G": "Оптовая и розничная торговля",
    "H": "Транспорт и складирование",
    "I": "Услуги по проживанию и питанию",
    "J": "Информация и связь",
    "K": "Финансовая и страховая деятельность",
    "L": "Операции с недвижимым имуществом",
    "M": "Профессиональная, научная и техническая деятельность",
    "N": "Деятельность в области административного и вспомогательного обслуживания",
    "O": "Государственное управление и оборона",
    "P": "Образование",
    "Q": "Здравоохранение и социальные услуги",
    "R": "Искусство, развлечения и отдых",
    "S": "Прочие виды услуг",
    "T": "Деятельность домашних хозяйств",
}


def import_okved(cur):
    if not PATHS["oked"].exists():
        print(f"[okved] SKIP: файл не найден ({PATHS['oked']})")
        return 0

    print(f"[okved] Чтение {PATHS['oked'].name}...")
    data = json.loads(PATHS["oked"].read_text(encoding="utf-8"))
    rows = []
    for item in data:
        section = item.get("section")
        rows.append((
            str(item.get("id", "")),
            item.get("name", ""),
            section,
            SECTION_NAMES.get(section, ""),
            "regulatory-dashboard",
        ))

    execute_values(
        cur,
        """
        INSERT INTO okved (id, name_ru, section, section_name_ru, imported_from)
        VALUES %s
        ON CONFLICT (id) DO UPDATE
            SET name_ru         = EXCLUDED.name_ru,
                section         = EXCLUDED.section,
                section_name_ru = EXCLUDED.section_name_ru
        """,
        rows,
        page_size=500,
    )
    print(f"[okved] Загружено: {len(rows)}")
    return len(rows)


def import_duplicate_seed(cur):
    """
    Импорт топ-кросс-сферных пар как стартовых групп дубликатов.
    Карточек ещё нет (Этап 2), поэтому main_card_id = NULL.
    Важно: это лишь seed для Этапа 3 — финальная дедупликация будет
    делаться после генерации канонических карточек.
    """
    if not PATHS["dups"].exists():
        print(f"[dups] SKIP: файл не найден ({PATHS['dups']})")
        return 0

    print(f"[dups] Чтение {PATHS['dups'].name}...")
    data = json.loads(PATHS["dups"].read_text(encoding="utf-8"))

    rows = []
    for item in data.get("crossPairs", [])[:100]:  # топ-100 пар
        sphere1 = item.get("sphere1", "").strip()
        sphere2 = item.get("sphere2", "").strip()
        count = int(item.get("count", 0))
        avg_sim = float(item.get("avgSim", 0))
        max_sim = float(item.get("maxSim", 0))

        rows.append((
            f"DUP-CROSS-{abs(hash(sphere1 + sphere2)) % 10**8:08d}",
            "cross_sphere",
            avg_sim,
            "imported",
            None,  # main_card_id выставится после Этапа 2
        ))

    execute_values(
        cur,
        """
        INSERT INTO duplicate_groups (group_code, duplicate_type, avg_similarity, detected_method, main_card_id)
        VALUES %s
        ON CONFLICT (group_code) DO NOTHING
        """,
        rows,
        page_size=500,
    )
    print(f"[dups] Загружено seed-групп: {len(rows)}")
    return len(rows)


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not set.")

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            okved_count = import_okved(cur)
            dups_count = import_duplicate_seed(cur)
            conn.commit()

            print()
            print("=" * 60)
            print("ИТОГИ ИМПОРТА ИЗ regulatory-dashboard")
            print("=" * 60)
            print(f"  okved (справочник):     {okved_count}")
            print(f"  duplicate_groups (seed): {dups_count}")

            # Срез ОКЭД по секциям
            cur.execute("""
                SELECT section, COUNT(*) AS cnt
                  FROM okved
                 GROUP BY section
                 ORDER BY section
            """)
            print()
            print("ОКЭД по секциям экономики:")
            for section, cnt in cur.fetchall():
                label = SECTION_NAMES.get(section, "(нет секции)")
                print(f"  {section or '-':<3} {cnt:>5}  {label[:60]}")


if __name__ == "__main__":
    main()
