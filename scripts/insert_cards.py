"""
insert_cards.py — приёмник батчей канонических карточек требований для Этапа 2.

Формат входа: JSON-файл (или stdin) с массивом карточек. Одна карточка
описывается нашим контрактом (см. CARD_SCHEMA ниже). Скрипт:
  1) валидирует структуру каждой карточки;
  2) вставляет в requirement_cards и связанные таблицы (npa_links, okved_links,
     applicability_rules, burden_metrics, field_metadata);
  3) связывает source_fragments[].id из 'sources' с canonical_card_id;
  4) обновляет batch_log (этап 2 — прогресс по сферам);
  5) выдаёт сводку (вставлено / пропущено / ошибки).

Использование:
    DATABASE_URL=postgresql://... python insert_cards.py --batch <path.json>
    DATABASE_URL=postgresql://... python insert_cards.py --batch -            # stdin
    DATABASE_URL=postgresql://... python insert_cards.py --batch <path.json> --dry-run

Контракт одной карточки (минимально достаточный набор полей; все они
вставляются в requirement_cards + поля выше уровня карточки идут в дочерние
таблицы):

{
  "card_code": "TREB-MVP-000001",        # уникальный код, ставит генератор
  "sphere_code": "ecology",               # land|transport|ecology
  "subsphere": "обращение с отходами",
  "short_title": "Получить экологическое разрешение",
  "canonical_text": "Субъект, эксплуатирующий объект I категории, обязан получить...",
  "legal_text": "...",                    # как в норме (опционально)
  "business_text": "...",                 # упрощение для предпринимателя
  "subject": "Эксплуатант объекта I категории",
  "action": "получить",
  "object": "комплексное экологическое разрешение",
  "condition_text": "до начала эксплуатации",
  "exception_text": null,
  "requirement_type": "разрешение",       # лицензия|разрешение|документ|...
  "requirement_subtype": null,
  "role_fragment": "обязанность бизнеса", # 11 значений из CHECK
  "regulatory_regime": "разрешение_2_категории",
  "life_cycle_stage": "pre_launch",
  "mandatory_level": "mandatory",
  "timing": "до начала эксплуатации",
  "frequency": "one_time",
  "evidence_required": "копия экологического разрешения",
  "evidence_form": "разрешение",
  "consequences": "штраф ст.328 КоАП, приостановление деятельности",
  "can_be_online": true,
  "related_service_url": null,
  "is_canonical": true,
  "duplicate_group_code": null,           # если в группе дублей — её код (не id!)
  "canonical_card_code": null,            # для не-главной карточки группы
  "generated_by": "claude-opus-4-7",
  "prompt_version": "v1",
  "model_confidence": 0.92,

  "sources": [                            # привязка к source_fragments
    {"fragment_id": 1234, "weight": 1.0},
    {"fragment_id": 5678, "weight": 0.7}
  ],

  "npa_links": [                          # 1..N связей с НПА
    {
      "npa_title": "Экологический кодекс РК",
      "article_ref": "ст. 65 п.1",
      "npa_url": "https://adilet.zan.kz/...",
      "fragment_text": "оригинальная цитата нормы",
      "relation_status": "прямая_связь",  # 9 значений из CHECK
      "confidence": 0.95
    }
  ],

  "okved_links": [
    {"okved_id": "38.11", "link_type": "через_сферу_контроля", "confidence": 0.8}
  ],

  "applicability_rule": {                 # машинно-исполняемое правило
    "rule_yaml": "...",                   # человекочитаемая форма
    "rule_json": {                         # быстрая фильтрация
      "all_of": [
        {"axis": "waste_handling", "op": "eq", "value": "hazardous"}
      ],
      "any_of": [],
      "exceptions": []
    },
    "notes": "..."
  },

  "burden": {                              # расчёт нагрузки
    "is_periodic": false,
    "frequency_per_year": 0,
    "num_documents": 8,
    "num_authorities": 1,
    "num_actions": 3,
    "estimated_cost_kzt": 0,
    "waiting_days": 30,
    "validity_days": null,
    "fine_risk": "high",
    "suspension_risk": "high",
    "refusal_risk": "medium",
    "needs_external_spec": true,
    "needs_equipment": false,
    "needs_premises": true
  },

  "field_metadata": [                      # источник/метод/уверенность по полям
    {"field_name": "role_fragment", "source": "llm",
     "method": "claude_opus_4.7", "confidence": 0.92,
     "explanation": "по маркеру 'обязан получить'"}
  ]
}
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2.extras import Json, execute_values


# ─── Контракт карточки (минимальная валидация) ───────────────────────
REQUIRED_FIELDS = {"card_code", "sphere_code", "canonical_text", "role_fragment"}

# VALID_SPHERES загружается динамически из БД (function load_valid_spheres).
# Fallback на MVP-набор если БД недоступна.
VALID_SPHERES = {"land", "transport", "ecology", "other"}


def load_valid_spheres(db_url: str | None = None) -> set[str]:
    """Загружает sphere codes из БД. Используйте перед валидацией."""
    global VALID_SPHERES
    db_url = db_url or os.environ.get("DATABASE_URL")
    if not db_url:
        return VALID_SPHERES
    try:
        with psycopg2.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT code FROM spheres")
                VALID_SPHERES = {r[0] for r in cur.fetchall()}
        return VALID_SPHERES
    except Exception:
        return VALID_SPHERES
VALID_ROLES = {
    "обязанность бизнеса", "запрет", "условие допуска",
    "доказательство исполнения", "документ для заявления",
    "процедурная обязанность бизнеса", "действие государственного органа",
    "полномочие государственного органа", "описательная норма",
    "определение/термин", "спорная роль",
}
VALID_NPA_STATUS = {
    "прямая_связь", "косвенная_связь", "через_подзаконный_акт",
    "есть_в_проверочном_листе_норма_не_найдена",
    "есть_в_услуге_норма_не_найдена",
    "основание_спорное", "основание_утратило_силу",
    "требование_шире_нормы", "требование_уже_нормы",
}
VALID_OKVED_LINK_TYPE = {
    "прямая", "через_услугу", "через_сферу_контроля",
    "через_сценарий", "предположительная",
}
VALID_SPECIFICITY = {"concrete", "framework", "referential", "principle"}
CARD_COLUMNS = [
    "card_code", "sphere_code", "subsphere",
    "short_title", "canonical_text", "legal_text", "business_text",
    "subject", "action", "object", "condition_text", "exception_text",
    "requirement_type", "requirement_subtype", "role_fragment",
    "regulatory_regime", "life_cycle_stage", "mandatory_level",
    "requirement_specificity",
    "timing", "frequency", "evidence_required", "evidence_form",
    "consequences", "can_be_online", "related_service_url",
    "is_canonical", "generated_by", "prompt_version", "model_confidence",
]


def validate(card: dict, idx: int) -> list[str]:
    """Возвращает список ошибок (пустой список = ОК)."""
    errs = []
    missing = REQUIRED_FIELDS - card.keys()
    if missing:
        errs.append(f"missing required fields: {sorted(missing)}")
    if card.get("sphere_code") not in VALID_SPHERES:
        errs.append(f"invalid sphere_code: {card.get('sphere_code')!r}")
    if card.get("role_fragment") not in VALID_ROLES and card.get("role_fragment") is not None:
        errs.append(f"invalid role_fragment: {card.get('role_fragment')!r}")
    sp = card.get("requirement_specificity")
    if sp is not None and sp not in VALID_SPECIFICITY:
        errs.append(f"invalid requirement_specificity: {sp!r}")
    for n in card.get("npa_links", []) or []:
        if n.get("relation_status") not in VALID_NPA_STATUS:
            errs.append(f"invalid npa relation_status: {n.get('relation_status')!r}")
    for o in card.get("okved_links", []) or []:
        if o.get("link_type") not in VALID_OKVED_LINK_TYPE:
            errs.append(f"invalid okved link_type: {o.get('link_type')!r}")
    return [f"[card #{idx} {card.get('card_code', '?')}] {e}" for e in errs]


def insert_card(cur, card: dict) -> int:
    """Возвращает id вставленной requirement_cards (или существующей)."""
    values = tuple(card.get(c) for c in CARD_COLUMNS)
    placeholders = ", ".join(["%s"] * len(CARD_COLUMNS))
    cur.execute(
        f"""
        INSERT INTO requirement_cards ({', '.join(CARD_COLUMNS)})
        VALUES ({placeholders})
        ON CONFLICT (card_code) DO UPDATE
            SET canonical_text = EXCLUDED.canonical_text,
                short_title    = EXCLUDED.short_title,
                role_fragment  = EXCLUDED.role_fragment,
                version        = requirement_cards.version + 1,
                updated_at     = NOW()
        RETURNING id
        """,
        values,
    )
    return cur.fetchone()[0]


def link_sources(cur, card_id: int, sources: list[dict]):
    if not sources:
        return
    fragment_ids = [s["fragment_id"] for s in sources if s.get("fragment_id")]
    if fragment_ids:
        cur.execute(
            "UPDATE source_fragments SET canonical_card_id = %s WHERE id = ANY(%s)",
            (card_id, fragment_ids),
        )


def insert_npa_links(cur, card_id: int, links: list[dict]):
    if not links:
        return
    rows = [
        (card_id, l.get("npa_title"), l.get("article_ref"), l.get("npa_url"),
         l.get("fragment_text"), l["relation_status"],
         l.get("found_method", "auto"), l.get("confidence"))
        for l in links
    ]
    execute_values(
        cur,
        """
        INSERT INTO npa_links
            (card_id, npa_title, article_ref, npa_url, fragment_text,
             relation_status, found_method, confidence)
        VALUES %s
        """,
        rows,
    )


def insert_okved_links(cur, card_id: int, links: list[dict]):
    if not links:
        return
    rows = [
        (card_id, l["okved_id"], l["link_type"],
         l.get("confidence"), l.get("source_note"))
        for l in links
    ]
    execute_values(
        cur,
        """
        INSERT INTO okved_links
            (card_id, okved_id, link_type, confidence, source_note)
        VALUES %s
        ON CONFLICT (card_id, okved_id, link_type) DO NOTHING
        """,
        rows,
    )


def insert_applicability(cur, card_id: int, rule: dict | None):
    if not rule:
        return
    cur.execute(
        """
        INSERT INTO applicability_rules (card_id, rule_yaml, rule_json, notes)
        VALUES (%s, %s, %s, %s)
        """,
        (card_id, rule.get("rule_yaml"), Json(rule.get("rule_json") or {}), rule.get("notes")),
    )


def insert_burden(cur, card_id: int, burden: dict | None):
    if not burden:
        return
    cols = [
        "card_id", "is_periodic", "frequency_per_year", "num_documents",
        "num_authorities", "num_actions", "estimated_cost_kzt",
        "waiting_days", "validity_days", "fine_risk", "suspension_risk",
        "refusal_risk", "needs_external_spec", "needs_equipment", "needs_premises",
    ]
    vals = [
        card_id,
        burden.get("is_periodic"),
        burden.get("frequency_per_year"),
        burden.get("num_documents", 0),
        burden.get("num_authorities", 0),
        burden.get("num_actions", 0),
        burden.get("estimated_cost_kzt"),
        burden.get("waiting_days"),
        burden.get("validity_days"),
        burden.get("fine_risk"),
        burden.get("suspension_risk"),
        burden.get("refusal_risk"),
        burden.get("needs_external_spec"),
        burden.get("needs_equipment"),
        burden.get("needs_premises"),
    ]
    placeholders = ", ".join(["%s"] * len(cols))
    cur.execute(
        f"""
        INSERT INTO burden_metrics ({', '.join(cols)})
        VALUES ({placeholders})
        ON CONFLICT (card_id) DO UPDATE
            SET is_periodic        = EXCLUDED.is_periodic,
                frequency_per_year = EXCLUDED.frequency_per_year,
                num_documents      = EXCLUDED.num_documents,
                num_authorities    = EXCLUDED.num_authorities,
                num_actions        = EXCLUDED.num_actions,
                estimated_cost_kzt = EXCLUDED.estimated_cost_kzt,
                waiting_days       = EXCLUDED.waiting_days,
                validity_days      = EXCLUDED.validity_days,
                fine_risk          = EXCLUDED.fine_risk,
                suspension_risk    = EXCLUDED.suspension_risk,
                refusal_risk       = EXCLUDED.refusal_risk,
                needs_external_spec= EXCLUDED.needs_external_spec,
                needs_equipment    = EXCLUDED.needs_equipment,
                needs_premises     = EXCLUDED.needs_premises,
                updated_at         = NOW()
        """,
        vals,
    )


def insert_field_metadata(cur, card_id: int, fm_list: list[dict] | None):
    if not fm_list:
        return
    rows = [
        (card_id, fm["field_name"], fm.get("value_text"),
         fm.get("source"), fm.get("method"),
         fm.get("confidence"), fm.get("explanation"),
         fm.get("check_status", "unchecked"))
        for fm in fm_list
    ]
    execute_values(
        cur,
        """
        INSERT INTO field_metadata
            (card_id, field_name, value_text, source, method,
             confidence, explanation, check_status)
        VALUES %s
        ON CONFLICT (card_id, field_name) DO UPDATE
            SET value_text   = EXCLUDED.value_text,
                source       = EXCLUDED.source,
                method       = EXCLUDED.method,
                confidence   = EXCLUDED.confidence,
                explanation  = EXCLUDED.explanation,
                check_status = EXCLUDED.check_status,
                updated_at   = NOW()
        """,
        rows,
    )


def log_batch(cur, sphere_code: str, batch_number: int,
              cards_count: int, generated_by: str, prompt_version: str,
              status: str = "completed", notes: str | None = None):
    cur.execute(
        """
        INSERT INTO batch_log
            (sphere_code, batch_number, num_processed, num_canonical_created,
             generated_by, prompt_version, status, started_at, completed_at, notes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (sphere_code, batch_number, cards_count, cards_count,
         generated_by, prompt_version, status,
         datetime.now(), datetime.now(), notes),
    )


# ─── main ────────────────────────────────────────────────────────────
def read_batch(arg: str) -> list[dict]:
    if arg == "-":
        return json.load(sys.stdin)
    return json.loads(Path(arg).read_text(encoding="utf-8"))


def main():
    p = argparse.ArgumentParser(description="Вставка батча канонических карточек требований.")
    p.add_argument("--batch", required=True, help="Путь к JSON-файлу с массивом карточек или '-' для stdin.")
    p.add_argument("--batch-number", type=int, default=None, help="Номер батча для batch_log.")
    p.add_argument("--sphere", default=None, help="Код сферы (для batch_log; если не задан — берётся из первой карточки).")
    p.add_argument("--prompt-version", default="v1")
    p.add_argument("--generated-by", default="claude-opus-4-7")
    p.add_argument("--dry-run", action="store_true", help="Только валидация, без вставки.")
    args = p.parse_args()

    cards = read_batch(args.batch)
    if not isinstance(cards, list):
        sys.exit("ERROR: batch root must be a JSON array of card objects.")

    print(f"[batch] Получено карточек: {len(cards)}")

    # Валидация
    all_errs = []
    for i, c in enumerate(cards, start=1):
        all_errs.extend(validate(c, i))

    if all_errs:
        print(f"[batch] Найдено ошибок: {len(all_errs)}")
        for e in all_errs[:50]:
            print(f"  ✗ {e}")
        if len(all_errs) > 50:
            print(f"  ...еще {len(all_errs) - 50} ошибок")
        sys.exit(1)
    print("[batch] Валидация: ✓")

    if args.dry_run:
        print("[batch] DRY RUN — записи не делаем.")
        return

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not set.")

    inserted = 0
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            for c in cards:
                card_id = insert_card(cur, c)
                link_sources(cur, card_id, c.get("sources", []))
                insert_npa_links(cur, card_id, c.get("npa_links", []))
                insert_okved_links(cur, card_id, c.get("okved_links", []))
                insert_applicability(cur, card_id, c.get("applicability_rule"))
                insert_burden(cur, card_id, c.get("burden"))
                insert_field_metadata(cur, card_id, c.get("field_metadata"))
                inserted += 1

            sphere = args.sphere or (cards[0].get("sphere_code") if cards else None)
            if sphere:
                log_batch(cur, sphere, args.batch_number or 0, inserted,
                          args.generated_by, args.prompt_version)

            conn.commit()

            # Итоговый срез
            cur.execute("""
                SELECT sphere_code, COUNT(*), SUM(CASE WHEN is_canonical THEN 1 ELSE 0 END)
                  FROM requirement_cards
                 GROUP BY sphere_code
                 ORDER BY sphere_code
            """)
            print()
            print("=" * 60)
            print(f"  ВСТАВЛЕНО / ОБНОВЛЕНО:  {inserted}")
            print("=" * 60)
            print("Текущее состояние requirement_cards:")
            for sc, total, canonical in cur.fetchall():
                print(f"  {sc:<10}  всего={total:<5}  канонических={canonical}")


if __name__ == "__main__":
    main()
