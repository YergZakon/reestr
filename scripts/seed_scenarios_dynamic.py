"""
seed_scenarios_dynamic.py — динамический наполнитель сценариев.

Для каждого сценария применяет SQL-фильтр (по subsphere / canonical_text /
role_fragment) и привязывает топ-N карточек по confidence.

Заполняет:
 - cargo_carrier: автомобильный перевозчик грузов
 - hazardous_waste: деятельность с опасными отходами
 - emissions_business: предприятие с выбросами в атмосферу
 - land_construction: использование участка под строительство

Запуск:
    DATABASE_URL=... python seed_scenarios_dynamic.py
"""
from __future__ import annotations

import os
import sys

import psycopg2

# Каждый сценарий — список (sql_filter, max_cards, is_required, default_notes).
# Карточки попадают в маршрут только если role_fragment в основных ролях
# (не "действие государственного органа") и requirement_specificity = 'concrete'
# или NULL (для запретов).

SCENARIOS = {
    "cargo_carrier": {
        "title": "Перевозчик грузов",
        "filters": [
            {
                "where": "(subsphere ILIKE '%автомоб%' OR subsphere ILIKE '%автотранс%' OR canonical_text ILIKE '%автотранспортн%') AND sphere_code='transport'",
                "limit": 8,
                "is_required": True,
                "notes": "Применимо к автомобильным перевозкам грузов.",
            },
            {
                "where": "subsphere ILIKE '%метрол%' OR canonical_text ILIKE '%метрологическ%' OR canonical_text ILIKE '%определения массы%'",
                "limit": 3,
                "is_required": True,
                "notes": "Весовое оборудование подлежит метрологическому контролю.",
            },
            {
                "where": "(canonical_text ILIKE '%опасн%груз%' OR canonical_text ILIKE '%опасных_грузов%' OR canonical_text ILIKE '%перевозке опасного%') AND sphere_code='transport'",
                "limit": 4,
                "is_required": False,
                "notes": "Применимо если перевозите опасные грузы (классы 1, 6, 7).",
            },
            {
                "where": "subsphere ILIKE '%страхован%' OR canonical_text ILIKE '%застрахова%'",
                "limit": 3,
                "is_required": False,
                "notes": "Финансовое обеспечение ответственности перевозчика.",
            },
            {
                "where": "subsphere ILIKE '%надзор%' AND sphere_code='transport'",
                "limit": 3,
                "is_required": False,
                "notes": "Применимо при проверках и предписаниях.",
            },
        ],
    },
    "hazardous_waste": {
        "title": "Деятельность с опасными отходами",
        "filters": [
            {
                "where": "(canonical_text ILIKE '%опасн%отход%' OR canonical_text ILIKE '%радиоактивн%') AND sphere_code='ecology'",
                "limit": 8,
                "is_required": True,
                "notes": "Применимо для всех, кто образует, хранит или утилизирует опасные отходы.",
            },
            {
                "where": "subsphere ILIKE '%полигон%' OR subsphere ILIKE '%отход%'",
                "limit": 6,
                "is_required": True,
                "notes": "Эксплуатация полигонов и обращение с отходами.",
            },
            {
                "where": "(canonical_text ILIKE '%биоотход%' OR canonical_text ILIKE '%медицинских отход%') AND sphere_code='ecology'",
                "limit": 3,
                "is_required": False,
                "notes": "Если работаете с медицинскими отходами (клиники, лаборатории).",
            },
            {
                "where": "subsphere ILIKE '%озон%' OR canonical_text ILIKE '%озоноразруш%'",
                "limit": 2,
                "is_required": False,
                "notes": "Применимо при использовании ОРВ (хладагенты, аэрозоли).",
            },
            {
                "where": "(canonical_text ILIKE '%эколог%разреш%' OR canonical_text ILIKE '%экологическое разрешение%') AND sphere_code='ecology'",
                "limit": 2,
                "is_required": True,
                "notes": "Базовое разрешение для деятельности с эмиссиями.",
            },
        ],
    },
    "emissions_business": {
        "title": "Предприятие с выбросами в атмосферу",
        "filters": [
            {
                "where": "(canonical_text ILIKE '%выбрс%' OR canonical_text ILIKE '%эмисс%' OR subsphere ILIKE '%выбрс%' OR subsphere ILIKE '%парников%') AND sphere_code='ecology'",
                "limit": 8,
                "is_required": True,
                "notes": "Базовые требования к предприятиям с выбросами.",
            },
            {
                "where": "(canonical_text ILIKE '%I и II категори%' OR canonical_text ILIKE '%I категори%' OR canonical_text ILIKE '%II категори%') AND sphere_code='ecology'",
                "limit": 3,
                "is_required": False,
                "notes": "Применимо для крупных объектов I/II категории воздействия.",
            },
            {
                "where": "subsphere ILIKE '%квот%' OR canonical_text ILIKE '%квотирован%'",
                "limit": 3,
                "is_required": False,
                "notes": "Если вы субъект квотирования парниковых газов.",
            },
            {
                "where": "subsphere ILIKE '%СЗЗ%' OR canonical_text ILIKE '%санитарно-защитн%' OR canonical_text ILIKE '%санитарно-защитной%'",
                "limit": 3,
                "is_required": True,
                "notes": "Санитарно-защитная зона обязательна для промобъектов с выбросами.",
            },
        ],
    },
    "land_construction": {
        "title": "Использование земельного участка под строительство",
        "filters": [
            {
                "where": "(canonical_text ILIKE '%целевого назначен%' OR canonical_text ILIKE '%целевое назначен%') AND sphere_code='land'",
                "limit": 4,
                "is_required": True,
                "notes": "Целевое назначение участка должно соответствовать строительству.",
            },
            {
                "where": "subsphere ILIKE '%аренд%' OR canonical_text ILIKE '%аренд%земельн%'",
                "limit": 4,
                "is_required": True,
                "notes": "Если получаете участок в аренду — типовые требования.",
            },
            {
                "where": "(subsphere ILIKE '%СЗЗ%' OR canonical_text ILIKE '%санитарно-защитн%') AND sphere_code='land'",
                "limit": 3,
                "is_required": True,
                "notes": "Минимальная санитарно-защитная зона.",
            },
            {
                "where": "(canonical_text ILIKE '%эмиссия%' OR canonical_text ILIKE '%разрешение%')  AND sphere_code='ecology'",
                "limit": 3,
                "is_required": False,
                "notes": "Применимо если строительство связано с эмиссиями.",
            },
            {
                "where": "(canonical_text ILIKE '%водн%' OR canonical_text ILIKE '%сточн%') AND sphere_code='ecology'",
                "limit": 2,
                "is_required": False,
                "notes": "Если объект влияет на водные ресурсы.",
            },
        ],
    },
}


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not set")

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            for code, sc in SCENARIOS.items():
                cur.execute("SELECT id FROM scenarios WHERE code = %s", (code,))
                row = cur.fetchone()
                if not row:
                    print(f"[skip] scenario {code} не найден")
                    continue
                scenario_id = row[0]

                cur.execute("DELETE FROM scenario_cards WHERE scenario_id = %s", (scenario_id,))

                ordering = 10
                seen = set()
                inserted_total = 0
                for f in sc["filters"]:
                    # Эскейпим % для psycopg2 (одинарный % трактуется как плейсхолдер)
                    where_clause = f['where'].replace('%', '%%')
                    sql = f"""
                        SELECT id, card_code, short_title
                          FROM requirement_cards
                         WHERE ({where_clause})
                           AND role_fragment IN
                               ('обязанность бизнеса','запрет','условие допуска',
                                'документ для заявления','доказательство исполнения',
                                'процедурная обязанность бизнеса')
                           AND (requirement_specificity = 'concrete' OR requirement_specificity IS NULL)
                         ORDER BY model_confidence DESC NULLS LAST, id
                         LIMIT %s
                    """
                    cur.execute(sql, (f["limit"] * 2,))
                    rows = cur.fetchall()
                    taken = 0
                    for cid, ccode, title in rows:
                        if cid in seen:
                            continue
                        seen.add(cid)
                        cur.execute(
                            """
                            INSERT INTO scenario_cards (scenario_id, card_id, is_required, ordering, notes)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (scenario_id, card_id) DO NOTHING
                            """,
                            (scenario_id, cid, f["is_required"], ordering, f["notes"]),
                        )
                        ordering += 10
                        taken += 1
                        inserted_total += 1
                        if taken >= f["limit"]:
                            break

                cur.execute("UPDATE scenarios SET is_published = TRUE WHERE id = %s", (scenario_id,))
                print(f"  ✓ {code:<25} вставлено {inserted_total} карточек")

            conn.commit()


if __name__ == "__main__":
    main()
