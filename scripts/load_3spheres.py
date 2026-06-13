"""
load_3spheres.py — загрузка 4 слоёв исходных требований по 3 сферам MVP
(земля, транспорт, экология) в PostgreSQL.

Слой 1 (rot_checklist):  ЕРСОП по 3 сферам из data_requirements.csv.gz (regulatory-dashboard)
Слой 2 (services):       все 2287 строк из требования_service_name.csv (без фильтра по сфере)
Слой 3 (ml_dataset):     экспертно-разметчённые требования из ml_dataset_2026-04-27.csv
Слой 4 (npa_extracted):  3 JSON-файла:
    - requirements_ecology.json    → sphere=ecology   (2779 строк)
    - requirements_transport.json  → sphere=transport (276 строк)
    - requirements_reanalyzed.json → sphere=land      (168 строк)

Использование:
    DATABASE_URL=postgresql://user:pass@host:port/db python load_3spheres.py
    DATABASE_URL=...                                  python load_3spheres.py --layer services
    DATABASE_URL=...                                  python load_3spheres.py --truncate

Зависимости: psycopg2-binary
    pip install psycopg2-binary
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable

import psycopg2
from psycopg2.extras import Json, execute_values

# ─── Пути к источникам ───────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # …/Новая папка 3
# Кросс-платформенный путь к regulatory-dashboard.
# Можно переопределить через env var DASHBOARD_DIR (полный путь до regulatory-dashboard).
# По умолчанию — рядом с PROJECT_ROOT (Mac) или старый Windows-путь (если регдашборд лежит отдельно).
_DASHBOARD_DIR = Path(os.environ.get(
    "DASHBOARD_DIR",
    str(PROJECT_ROOT / "regulatory-dashboard"),
))
DASHBOARD_RAW = _DASHBOARD_DIR / "data" / "raw"

PATHS = {
    "rot_gz":          DASHBOARD_RAW / "data_requirements.csv.gz",
    "services":        PROJECT_ROOT / "требования_service_name.csv",
    "ml_dataset":      PROJECT_ROOT / "ml_dataset_2026-04-27.csv",
    "npa_ecology":     PROJECT_ROOT / "NPA" / "output" / "requirements_ecology.json",
    "npa_transport":   PROJECT_ROOT / "NPA" / "output" / "requirements_transport.json",
    "npa_land":        PROJECT_ROOT / "requirements_reanalyzed.json",
}

# ─── Маппинг текстовых названий сфер ЕРСОП на коды MVP ───────────────
# Подобрано анализом 115 уникальных названий в data_requirements.csv.gz.
# Если нужно добавить ещё — просто дописать в этот словарь.
ROT_SPHERE_MAP = {
    # ─── Земля и землепользование ─────
    "за использованием и охраной земель":                                       "land",
    "за геодезической и картографической деятельностью":                        "land",

    # ─── Транспорт ─────
    "в сфере транспорта":                                                       "transport",
    "в области железнодорожного транспорта":                                    "transport",
    "в области автомобильного транспорта":                                      "transport",
    "в области внутреннего водного транспорта":                                 "transport",
    "в области внутреннего водного транспорта;":                                "transport",
    "в области торгового мореплавания":                                         "transport",
    "в области использования воздушного пространства Республики Казахстан и "
    "деятельности гражданской и экспериментальной авиации":                    "transport",

    # ─── Экология (широкая трактовка: природопользование) ─────
    "в области охраны окружающей среды, воспроизводства и использования природных ресурсов": "ecology",
    "в области использования и охраны водного фонда Республики Казахстан, безопасности плотин": "ecology",
    "в области охраны, воспроизводства и использования животного мира":         "ecology",
    "в области лесного хозяйства":                                              "ecology",
    "в области особо охраняемых природных территорий":                          "ecology",
    "в сфере обращения с твердыми бытовыми отходами":                           "ecology",
    "в сфере обращения с отходами производства и потребления":                  "ecology",
    "в области охраны атмосферного воздуха":                                    "ecology",
    "в области ветеринарии":                                                    "ecology",  # граничный, но включаем
}


# ─── Помощники ───────────────────────────────────────────────────────
def get_db_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: DATABASE_URL env var not set.")
    return url


def strip_bom(s: str) -> str:
    return s.lstrip("﻿")


def truncate_tables(cur):
    print("[truncate] Очистка source_fragments и связанных таблиц...")
    cur.execute("""
        TRUNCATE TABLE source_fragments      RESTART IDENTITY CASCADE;
        TRUNCATE TABLE service_to_sphere_map RESTART IDENTITY CASCADE;
    """)


# ─── Слой 1: ROT (data_requirements.csv.gz) ──────────────────────────
def load_rot_checklist(cur) -> int:
    path = PATHS["rot_gz"]
    if not path.exists():
        print(f"[rot] SKIP — файл не найден: {path}")
        return 0

    print(f"[rot] Чтение {path.name}...")
    rows = []
    skipped = 0

    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sphere_text = (row.get("sphere_ru") or "").strip().strip('"').strip(";").strip()
            sphere_code = ROT_SPHERE_MAP.get(sphere_text)
            if not sphere_code:
                skipped += 1
                continue

            rows.append((
                "rot_checklist",
                strip_bom(row.get("code") or "").strip(),
                "data_requirements.csv.gz",
                sphere_code,
                sphere_text,
                (row.get("authority_ru") or "").strip(),
                (row.get("requirement_ru") or "").strip(),
                None,                             # text_normalized
                (row.get("load_type_primary_ru") or "").strip(),  # как requirement_category
                None, None, None, None, None,    # service / npa / ml_*
                None, None, None, None, None, None, None,
                Json({"load_type_primary_ru": (row.get("load_type_primary_ru") or "").strip()}),
            ))

    print(f"[rot] Совпало по 3 сферам: {len(rows)} (отброшено: {skipped})")
    insert_fragments(cur, rows)
    return len(rows)


# ─── Слой 2: услуги/разрешения/лицензии ──────────────────────────────
def load_services(cur) -> int:
    path = PATHS["services"]
    if not path.exists():
        print(f"[services] SKIP — файл не найден: {path}")
        return 0

    print(f"[services] Чтение {path.name}...")
    rows = []
    services_set = set()

    # utf-8-sig обязательно: первая колонка service_name содержит BOM иначе.
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for i, row in enumerate(reader):
            service_name = (row.get("service_name") or "").strip()
            services_set.add(service_name)

            rows.append((
                "services",
                f"SVC-{i+1:05d}",
                "требования_service_name.csv",
                None,                            # sphere_code — назначим на Этапе 1.3
                None,                            # subsphere
                None,                            # authority
                (row.get("raw_item_text") or "").strip(),
                (row.get("normalized_requirement") or "").strip(),
                (row.get("requirement_category") or "").strip(),
                service_name,
                (row.get("recipient_type") or "").strip(),
                None, None, None,                # npa fields
                None, None, None, None, None, None, None,  # ml_*
                None,
            ))

    print(f"[services] Загружено: {len(rows)} (уникальных услуг: {len(services_set)})")
    insert_fragments(cur, rows)

    # Заполняем service_to_sphere_map пустыми записями (sphere_code = NULL → 'pending')
    print(f"[services] Создание service_to_sphere_map с {len(services_set)} услугами...")
    cur.execute("DELETE FROM service_to_sphere_map")
    execute_values(
        cur,
        "INSERT INTO service_to_sphere_map (service_name, sphere_code, mapped_by) VALUES %s",
        [(name, None, "pending") for name in sorted(services_set)],
    )

    return len(rows)


# ─── Слой 3: экспертная разметка ml_dataset ──────────────────────────
def load_ml_dataset(cur) -> int:
    path = PATHS["ml_dataset"]
    if not path.exists():
        print(f"[ml_dataset] SKIP — файл не найден: {path}")
        return 0

    print(f"[ml_dataset] Чтение {path.name}...")
    valid_categories = {"OBL", "ZAP", "USL", "SRK", "DOC", "FIN", "OTV", "PRO", "STD", "LIC", "REP"}
    valid_spheres = {"land", "transport", "ecology"}
    rows = []
    junk_lines = 0

    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            sphere = (row.get("sphere") or "").strip()
            category = (row.get("category") or "").strip()

            # Отбрасываем мусор от парсинга многострочных полей (после строки ~1845)
            if sphere not in valid_spheres or category not in valid_categories:
                junk_lines += 1
                continue

            try:
                agreement = float((row.get("agreement_ratio") or "0").replace(",", "."))
                votes = int(row.get("total_votes") or "0")
            except ValueError:
                junk_lines += 1
                continue

            rows.append((
                "ml_dataset",
                strip_bom(row.get("external_id") or row.get("requirement_id") or "").strip(),
                "ml_dataset_2026-04-27.csv",
                sphere,
                None,
                None,
                (row.get("text") or "").strip(),
                (row.get("summary") or "").strip(),
                None,                            # requirement_category (сюда категория не идёт — она ml_category)
                None, None,                      # service
                (row.get("npa_title") or "").strip(),
                (row.get("article_ref") or "").strip(),
                None,                            # npa_url
                category,                        # ml_category
                (row.get("subject") or "").strip(),
                (row.get("summary") or "").strip(),  # ml_summary
                (row.get("gold_label") or "").strip(),
                (row.get("gold_confidence") or "").strip(),
                agreement,
                votes,
                None,
            ))

    print(f"[ml_dataset] Загружено валидных: {len(rows)} (отброшено мусора: {junk_lines})")
    insert_fragments(cur, rows)
    return len(rows)


# ─── Слой 4: НПА-extracted JSON-файлы ────────────────────────────────
def load_npa_extracted_file(cur, json_path: Path, sphere_code: str, source_label: str) -> int:
    if not json_path.exists():
        print(f"[npa:{sphere_code}] SKIP — файл не найден: {json_path}")
        return 0

    print(f"[npa:{sphere_code}] Чтение {json_path.name}...")

    text = json_path.read_text(encoding="utf-8")
    # requirements_ecology.json и transport.json — стандартный JSON с metadata + requirements[]
    # requirements_reanalyzed.json — стандартный JSON с requirements[]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        # Возможен кейс с дублирующимися ключами для других файлов
        print(f"[npa:{sphere_code}] Стандартный парсинг не удался ({e}), пробуем custom...")
        # Регексп-fallback: вытаскиваем все объекты внутри requirements: [ ... ]
        return _load_npa_via_regex(cur, text, sphere_code, source_label, json_path.name)

    requirements = data.get("requirements", []) if isinstance(data, dict) else []
    if not requirements and isinstance(data, list):
        requirements = data

    rows = []
    for req in requirements:
        rows.append((
            "npa_extracted",
            (req.get("id") or "").strip(),
            json_path.name,
            sphere_code,
            None,
            None,
            (req.get("text") or "").strip(),
            (req.get("summary") or "").strip(),
            None,
            None, None,
            (req.get("npa_title") or "").strip(),
            (req.get("article_ref") or "").strip(),
            None,
            (req.get("category") or "").strip(),
            (req.get("subject") or "").strip(),
            (req.get("summary") or "").strip(),
            None, None, None, None,
            Json({"source_file": req.get("source_file", "")}),
        ))

    print(f"[npa:{sphere_code}] Загружено: {len(rows)}")
    insert_fragments(cur, rows)
    return len(rows)


def _load_npa_via_regex(cur, text: str, sphere_code: str, source_label: str, filename: str) -> int:
    pattern = re.compile(
        r'\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"'
        r'\s*,\s*"category"\s*:\s*"([^"]*)"'
        r'.*?'
        r'"npa_title"\s*:\s*"([^"]*)"'
        r'.*?\}',
        re.DOTALL,
    )
    rows = []
    for m in pattern.finditer(text):
        rows.append((
            "npa_extracted",
            "",
            filename,
            sphere_code,
            None, None,
            m.group(1).encode().decode("unicode_escape", errors="ignore"),
            None, None, None, None,
            m.group(3),
            None, None,
            m.group(2),
            None, None, None, None, None, None,
            None,
        ))
    print(f"[npa:{sphere_code}] (regex fallback) Загружено: {len(rows)}")
    insert_fragments(cur, rows)
    return len(rows)


def load_npa_extracted(cur) -> int:
    total = 0
    total += load_npa_extracted_file(cur, PATHS["npa_ecology"],   "ecology",   "ecology JSON")
    total += load_npa_extracted_file(cur, PATHS["npa_transport"], "transport", "transport JSON")
    total += load_npa_extracted_file(cur, PATHS["npa_land"],      "land",      "land JSON")
    return total


# ─── Универсальный INSERT ────────────────────────────────────────────
COLUMNS = [
    "source_layer",
    "external_id",
    "source_file",
    "sphere_code",
    "subsphere_text",
    "authority",
    "text_original",
    "text_normalized",
    "requirement_category",
    "service_name",
    "recipient_type",
    "npa_title",
    "article_ref",
    "npa_url",
    "ml_category",
    "ml_subject",
    "ml_summary",
    "ml_gold_label",
    "ml_gold_confidence",
    "ml_agreement_ratio",
    "ml_total_votes",
    "raw_meta",
]


def insert_fragments(cur, rows: list[tuple]):
    if not rows:
        return
    sql = f"INSERT INTO source_fragments ({', '.join(COLUMNS)}) VALUES %s"
    execute_values(cur, sql, rows, page_size=500)


# ─── Главный поток ───────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="Load 3-sphere source fragments into PostgreSQL")
    p.add_argument("--layer", choices=["rot", "services", "ml", "npa", "all"], default="all")
    p.add_argument("--truncate", action="store_true", help="Очистить source_fragments перед загрузкой")
    args = p.parse_args()

    db_url = get_db_url()
    print(f"[db] Подключение к {db_url[:30]}...")

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            if args.truncate:
                truncate_tables(cur)
                conn.commit()

            counts = {}
            if args.layer in ("rot", "all"):
                counts["rot_checklist"] = load_rot_checklist(cur)
            if args.layer in ("services", "all"):
                counts["services"] = load_services(cur)
            if args.layer in ("ml", "all"):
                counts["ml_dataset"] = load_ml_dataset(cur)
            if args.layer in ("npa", "all"):
                counts["npa_extracted"] = load_npa_extracted(cur)

            conn.commit()

            print()
            print("=" * 60)
            print("ИТОГИ ЗАГРУЗКИ")
            print("=" * 60)
            total = 0
            for layer, count in counts.items():
                print(f"  {layer:.<30} {count:>6}")
                total += count
            print(f"  {'ИТОГО':.<30} {total:>6}")

            cur.execute("SELECT * FROM v_fragments_by_sphere_layer")
            print()
            print("Срез по сфере и слою:")
            for sphere_code, sphere_name, source_layer, fragments_count in cur.fetchall():
                print(f"  {sphere_code:<10} {source_layer:<15} {fragments_count:>5}  ({sphere_name})")


if __name__ == "__main__":
    main()
