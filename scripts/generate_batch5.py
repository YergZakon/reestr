"""
generate_batch5.py — генератор карточек для батча 4.

Берёт _candidates_batch5.json и для каждого фрагмента строит карточку
по шаблону. Не вызывает LLM — все эвристики правила.

Цель: добить MVP до ~250 карточек с упором на ЗЕМЛЮ.

Принципы:
- text_original → legal_text + canonical_text (с минимальной нормализацией)
- ml_summary (если есть) → short_title; иначе — первые 80 символов canonical_text
- ml_subject → subject (с расшифровкой)
- ml_category → requirement_type + role_fragment (по таблице)
- npa_title + article_ref → npa_links
- requirement_specificity = concrete по умолчанию (фрагменты предотобраны)
- Для ROT-фрагментов про действия органов → role_fragment="действие государственного органа",
  requirement_specificity=NULL — они не пойдут в портал бизнеса.

Запуск:
    python generate_batch5.py
Создаёт 4 файла в outputs/cards/batch_005{a,b,c,d}_*.json.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
INPUT = PROJECT_ROOT / "outputs" / "cards" / "_candidates_batch5.json"
OUT_DIR = PROJECT_ROOT / "outputs" / "cards"

START_CODE = 236   # следующий номер после пилота 112

ML_CAT_TO_TYPE = {
    "OBL": "процесс",
    "ZAP": "запрет",
    "USL": "условие",
    "STD": "норматив",
    "DOC": "документ",
    "LIC": "лицензия",
    "FIN": "финансовое обязательство",
    "OTV": "описательная",
    "PRO": "процесс",
    "REP": "отчётность",
}

ML_CAT_TO_ROLE = {
    "OBL": "обязанность бизнеса",
    "ZAP": "запрет",
    "USL": "условие допуска",
    "STD": "обязанность бизнеса",
    "DOC": "документ для заявления",
    "LIC": "обязанность бизнеса",
    "FIN": "обязанность бизнеса",
    "OTV": "описательная норма",
    "PRO": "процедурная обязанность бизнеса",
    "REP": "обязанность бизнеса",
}

REQ_CAT_TO_TYPE = {
    "Документы и записи":              "документ",
    "Инфраструктура и оборудование":   "оборудование",
    "Операционные процессы":           "процесс",
    "Технические параметры и нормативы": "норматив",
    "Запреты и ограничения":           "запрет",
    "Персонал и обучение":             "персонал",
    "Отчетность и уведомления":        "отчётность",
    "Согласования и разрешения":       "разрешение",
    "Финансовые обязательства":        "финансовое обязательство",
    "TECHNICAL_COMPLIANCE":            "норматив",
    "CONTRACT_INSURANCE":              "финансовое обязательство",
    "TRANSLATION_NOTARY_APOSTILLE":    "документ",
    "CERTIFICATE_LICENSE":             "лицензия",
    "EXTERNAL_APPROVAL":               "разрешение",
    "QUALIFICATION_STAFF":             "персонал",
    "PAYMENT_COST":                    "финансовое обязательство",
    "PROPERTY_RIGHTS":                 "документ",
    "PROPERTY_EQUIPMENT":              "оборудование",
    "OPERATIONAL_ORGANIZATION":        "процесс",
    "UNCLASSIFIED_POSSIBLE_REQUIREMENT": "процесс",
}

SUBJECT_DISPLAY = {
    "ЮЛ":            "Юридическое лицо",
    "ИП":            "Индивидуальный предприниматель",
    "ФЛ":            "Физическое лицо",
    "ВСЕ":           "Любой субъект (ФЛ/ЮЛ/ИП)",
    "КФХ":           "Крестьянское/фермерское хозяйство",
    "ДО":            "Дошкольная организация",
    "ВП":            "Водопользователь",
    "НП":            "Недропользователь",
    "BOTH":          "Физическое и юридическое лицо",
    "ОРГАНИЗАЦИИ":   "Юридическое лицо (организация)",
}

# Признаки фрагмента про действия госоргана (тогда role = noise, spec = NULL)
ORGAN_PATTERNS = [
    r"\bместн\w+ исполнительн\w+ орган",
    r"\bПринятие решения\b.*\bорган",
    r"\bСоблюдение.*\bоргана?м",
    r"\bРазмещение информации\b.*\bвеб-портал",
    r"\bФормирование перечня\b",
    r"\bСоблюдение.*срок.*местным исполнительным",
    r"\bСоблюдение структурным подразделением",
    r"\bПодготовка комплекта",
    r"\bкомитет\w+ управления",
    r"\bупорядочение",
]


def is_organ_action(text: str) -> bool:
    if not text:
        return False
    for p in ORGAN_PATTERNS:
        if re.search(p, text, re.IGNORECASE):
            return True
    return False


def make_short_title(text: str, summary: str | None) -> str:
    if summary:
        return summary[:120]
    s = text.strip()
    if len(s) > 110:
        s = s[:107] + "…"
    return s


def make_canonical(text: str, normalized: str | None) -> str:
    """Простая нормализация: оригинал. Если есть text_normalized — он лучше."""
    if normalized and len(normalized) > len(text) * 0.5:
        return normalized
    return text


def extract_subject_action_object(text: str, ml_subject: str | None) -> tuple[str, str, str]:
    """Очень простая эвристика. Если не находит — возвращает заглушки."""
    subject = SUBJECT_DISPLAY.get(ml_subject or "", ml_subject or "—") if ml_subject else "Субъект, к которому применяется норма"

    # Глагол-действие
    text_lc = text.lower().lstrip()
    action = "—"
    object_text = "—"

    verb_patterns = [
        ("обязан\\w*\\s+(\\w+)", 1),
        ("обеспеч\\w+", 0),
        ("представ\\w+", 0),
        ("получ\\w+", 0),
        ("осуществл\\w+", 0),
        ("вест\\w+", 0),
        ("провод\\w+", 0),
        ("разработ\\w+", 0),
        ("утвер\\w+", 0),
        ("соблюд\\w+", 0),
        ("установ\\w+", 0),
        ("уведом\\w+", 0),
        ("не допуска", 0),
        ("запреща", 0),
    ]
    for pat, grp in verb_patterns:
        m = re.search(pat, text_lc)
        if m:
            action = m.group(grp) if grp > 0 else m.group(0)
            break

    return subject, action, "—"


def life_cycle_hint(role: str, req_type: str, text: str) -> str:
    """Грубая оценка этапа жизненного цикла."""
    t = text.lower()
    if any(w in t for w in ["до начала", "при подаче", "при заявлении", "получ", "регистрац"]):
        return "registration;pre_launch"
    if "ежегодно" in t or "отчёт" in t or "отчет" in t:
        return "operation;reporting"
    if "при проверке" in t or "по предписан" in t or "по запросу" in t:
        return "inspection;operation"
    return "operation"


def make_applicability(sphere: str, text: str) -> dict:
    """Минимальное правило применимости по сфере."""
    rules: list[dict] = []
    t = text.lower()
    if sphere == "land":
        rules.append({"axis": "land_use_type", "op": "in", "value": ["agricultural", "settlement", "industrial", "protected"]})
        if "сельхоз" in t or "пастб" in t or "арендатор" in t or "крестьян" in t:
            rules = [{"axis": "land_use_type", "op": "eq", "value": "agricultural"}]
        if "пастб" in t:
            rules.append({"axis": "object_category", "op": "eq", "value": "pasture"})
    elif sphere == "transport":
        if "морск" in t or "судовлад" in t or "судн" in t:
            rules.append({"axis": "transport_subtype", "op": "eq", "value": "maritime"})
        elif "автомоб" in t:
            rules.append({"axis": "transport_subtype", "op": "eq", "value": "automobile"})
        elif "железно" in t:
            rules.append({"axis": "transport_subtype", "op": "eq", "value": "railway"})
        else:
            rules.append({"axis": "transport_subtype", "op": "in", "value": ["maritime", "inland_waterway", "automobile", "railway", "aviation"]})
    else:  # ecology
        if "отход" in t:
            rules.append({"axis": "waste_handling", "op": "in", "value": ["hazardous", "non_hazardous"]})
        elif "выбрс" in t or "эмисс" in t:
            rules.append({"axis": "emissions", "op": "eq", "value": "yes"})
        elif "опасн" in t or "радиац" in t:
            rules.append({"axis": "hazardous_substances", "op": "eq", "value": "yes"})
        elif "помещ" in t:
            rules.append({"axis": "has_premises", "op": "eq", "value": "yes"})
        else:
            rules.append({"axis": "has_premises", "op": "eq", "value": "yes"})

    return {
        "rule_yaml": "автогенерация — упрощённое правило, требует уточнения\n",
        "rule_json": {"all_of": rules, "any_of": [], "exceptions": []},
        "notes": "Авто-сгенерированное правило. Эксперт должен уточнить условия.",
    }


def make_burden(role: str, req_type: str, is_periodic: bool) -> dict:
    return {
        "is_periodic": is_periodic,
        "frequency_per_year": 12 if is_periodic else None,
        "num_documents": 1,
        "num_authorities": 1 if role != "запрет" else 0,
        "num_actions": 1 if role != "запрет" else 0,
        "fine_risk": "medium",
        "suspension_risk": "medium" if role in ("обязанность бизнеса", "условие допуска") else "low",
        "refusal_risk": "low",
        "needs_external_spec": False,
        "needs_equipment": req_type in ("оборудование", "норматив"),
        "needs_premises": False,
    }


def build_card(d: dict, code_num: int) -> dict:
    text = d["text_original"]
    text_norm = d.get("text_normalized")
    summary = d.get("ml_summary")
    npa_title = d.get("npa_title") or "(не указано)"
    article = d.get("article_ref") or ""
    ml_cat = (d.get("ml_category") or "").strip()
    req_cat = (d.get("requirement_category") or "").strip()
    sphere = d["sphere_code"]
    layer = d["source_layer"]
    fragment_id = d["id"]

    organ = is_organ_action(text)

    if organ:
        role = "действие государственного органа"
        spec = None
        req_type = "описательная"
    elif ml_cat:
        role = ML_CAT_TO_ROLE.get(ml_cat, d.get("_role_target") or "обязанность бизнеса")
        req_type = ML_CAT_TO_TYPE.get(ml_cat, "процесс")
        spec = d.get("_spec_target") or "concrete"
    elif req_cat:
        # ROT/services без ml_cat — берём requirement_category
        req_type = REQ_CAT_TO_TYPE.get(req_cat, "процесс")
        role = (
            "запрет" if req_type == "запрет" else
            "документ для заявления" if req_type in ("документ", "лицензия", "разрешение") else
            "обязанность бизнеса"
        )
        spec = d.get("_spec_target") or "concrete"
    else:
        role = d.get("_role_target") or "обязанность бизнеса"
        req_type = "процесс"
        spec = d.get("_spec_target") or "concrete"

    subject, action, obj = extract_subject_action_object(text, d.get("ml_subject"))
    canonical = make_canonical(text, text_norm)
    short = make_short_title(text, summary)

    is_periodic = role == "обязанность бизнеса" and req_type in ("отчётность", "норматив")

    card = {
        "card_code": f"TREB-MVP-{code_num:06d}",
        "sphere_code": sphere,
        "subsphere": (npa_title[:90] if npa_title else "(не указано)"),
        "short_title": short,
        "canonical_text": canonical,
        "legal_text": text,
        "subject": subject,
        "action": action,
        "object": obj,
        "condition_text": None,
        "exception_text": None,
        "requirement_type": req_type,
        "role_fragment": role,
        "requirement_specificity": spec,
        "regulatory_regime": f"{sphere}_{layer}",
        "life_cycle_stage": life_cycle_hint(role, req_type, text),
        "mandatory_level": "mandatory" if role != "описательная норма" and role != "действие государственного органа" else None,
        "timing": None,
        "frequency": "periodic_year" if is_periodic else "continuous",
        "evidence_required": d.get("text_normalized") if (d.get("text_normalized") and "Обеспечить наличие" in d.get("text_normalized", "")) else None,
        "evidence_form": None,
        "consequences": None,
        "can_be_online": False,
        "is_canonical": True,
        "generated_by": "claude-opus-4-7",
        "prompt_version": "v1-batch5-auto",
        "model_confidence": 0.7 if not organ else 0.85,
        "sources": [{"fragment_id": fragment_id, "weight": 1.0}],
        "npa_links": [
            {
                "npa_title": npa_title or "(не указано)",
                "article_ref": article or None,
                "npa_url": None,
                "fragment_text": text,
                "relation_status": "прямая_связь" if (article or layer == "npa_extracted") else "косвенная_связь",
                "confidence": 0.9 if article else 0.7,
            }
        ],
        "okved_links": [],
        "applicability_rule": make_applicability(sphere, text) if not organ else {
            "rule_yaml": "не_применимо: действие госоргана\n",
            "rule_json": {"all_of": [], "any_of": [], "exceptions": [], "scope_note": "процедура госоргана, не порождает обязанности бизнеса"},
            "notes": "Не включается в маршрут предпринимателя",
        },
        "burden": make_burden(role, req_type, is_periodic),
    }

    # Добавим service_name в notes/subsphere если есть
    if d.get("service_name"):
        card["subsphere"] = f"Услуга: {d['service_name'][:80]}"
    if d.get("authority"):
        card["regulatory_regime"] = f"{sphere}_надзор_{d['authority'][:30]}"

    # Метаданные про авто-генерацию (для прозрачности)
    card["field_metadata"] = [
        {
            "field_name": "auto_generation",
            "value_text": "batch4 шаблон",
            "source": "rule",
            "method": "generate_batch5.py",
            "confidence": 0.7,
            "explanation": f"Карточка сгенерирована автоматически из {layer} (ml_category={ml_cat or '—'}, req_category={req_cat or '—'}). Требует ручного ревью эксперта на этапе валидации.",
        }
    ]
    if organ:
        card["field_metadata"].append({
            "field_name": "role_fragment",
            "value_text": "действие государственного органа",
            "source": "rule",
            "method": "regex_organ_pattern",
            "confidence": 0.85,
            "explanation": "Текст содержит признаки процедуры госоргана (МИО, комитет, формирование перечня). Не порождает обязанности бизнеса. Помечено как noise.",
        })

    return card


def main() -> None:
    candidates = json.loads(INPUT.read_text(encoding="utf-8"))
    print(f"Прочитано кандидатов: {len(candidates)}")

    by_split = {
        "land_npa":      [],
        "land_other":    [],
        "ecology":       [],
        "transport":     [],
    }

    code = START_CODE
    for d in candidates:
        c = build_card(d, code)
        code += 1

        sphere = d["sphere_code"]
        layer = d["source_layer"]
        if sphere == "land" and layer == "npa_extracted":
            by_split["land_npa"].append(c)
        elif sphere == "land":
            by_split["land_other"].append(c)
        elif sphere == "ecology":
            by_split["ecology"].append(c)
        elif sphere == "transport":
            by_split["transport"].append(c)

    suffixes = {"land_npa": "a", "land_other": "b", "ecology": "c", "transport": "d"}
    for k, cards in by_split.items():
        out_path = OUT_DIR / f"batch_005{suffixes[k]}_{k}.json"
        out_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
        roles = Counter(c["role_fragment"] for c in cards)
        organs = sum(1 for c in cards if c["role_fragment"] == "действие государственного органа")
        print(f"  {out_path.name}  cards={len(cards):>3}  organs={organs}  roles={dict(roles)}")


if __name__ == "__main__":
    main()
