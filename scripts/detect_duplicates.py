"""
detect_duplicates.py — автоматический детектор смысловых дублей.

Что делает:
- читает все requirement_cards;
- для каждой пары в ОДНОЙ сфере считает Jaccard на 3-граммах слов
  по canonical_text (или legal_text как fallback);
- пары с Jaccard >= 0.55 кластеризуются (транзитивное замыкание);
- каждый кластер записывается в duplicate_groups
  (duplicate_type='text_ai', detected_method='jaccard_3gram');
- requirement_cards.duplicate_group_id обновляется ДЛЯ ВСЕХ карточек кластера;
- is_canonical НЕ меняется (по решению заказчика — не схлопываем);
- в field_metadata каждой карточке добавляется запись 'duplicate_alert'
  со списком похожих card_codes и средней similarity.

Не меняет is_canonical и не удаляет карточки. Только помечает.

Запуск:
    DATABASE_URL=... python detect_duplicates.py
    DATABASE_URL=... python detect_duplicates.py --threshold 0.5
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict

import psycopg2
from psycopg2.extras import Json, execute_values


def shingles(text: str, n: int = 3) -> set[str]:
    if not text:
        return set()
    words = re.findall(r"[\w°]+", text.lower())
    if len(words) < n:
        return set(words)
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


class UnionFind:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--threshold", type=float, default=0.55)
    p.add_argument("--min-cluster", type=int, default=2)
    args = p.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not set")

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, card_code, sphere_code,
                       COALESCE(NULLIF(canonical_text, ''), legal_text) AS text
                  FROM requirement_cards
                 WHERE COALESCE(canonical_text, legal_text) IS NOT NULL
                """
            )
            cards = cur.fetchall()
            print(f"[dup] Карточек к анализу: {len(cards)}")

            # Группируем по сфере для эффективности
            by_sphere: dict[str, list[tuple[int, str, str]]] = defaultdict(list)
            for cid, code, sphere_code, text in cards:
                by_sphere[sphere_code].append((cid, code, text))

            # Шинглы
            sh: dict[int, set[str]] = {}
            for cid, _code, _sphere, text in cards:
                sh[cid] = shingles(text)

            # Поиск пар + кластеризация
            pairs: list[tuple[int, int, float]] = []
            for sphere, items in by_sphere.items():
                idx = {cid: i for i, (cid, _, _) in enumerate(items)}
                uf = UnionFind(len(items))
                for i in range(len(items)):
                    cid_i = items[i][0]
                    for j in range(i + 1, len(items)):
                        cid_j = items[j][0]
                        sim = jaccard(sh[cid_i], sh[cid_j])
                        if sim >= args.threshold:
                            pairs.append((cid_i, cid_j, sim))
                            uf.union(i, j)

                # Собираем кластеры
                clusters: dict[int, list[tuple[int, str]]] = defaultdict(list)
                for i, (cid, code, _) in enumerate(items):
                    root = uf.find(i)
                    clusters[root].append((cid, code))

                # Сохраняем кластеры размера ≥ min_cluster
                for root, members in clusters.items():
                    if len(members) < args.min_cluster:
                        continue

                    # Средняя similarity внутри кластера
                    member_ids = {m[0] for m in members}
                    cluster_pairs = [
                        sim for cid_i, cid_j, sim in pairs
                        if cid_i in member_ids and cid_j in member_ids
                    ]
                    avg_sim = round(sum(cluster_pairs) / len(cluster_pairs), 3) if cluster_pairs else 0.0

                    group_code = f"DUP-AI-{sphere[:3].upper()}-{members[0][0]:06d}"

                    cur.execute(
                        """
                        INSERT INTO duplicate_groups
                            (group_code, duplicate_type, avg_similarity, detected_method)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (group_code) DO UPDATE
                            SET avg_similarity = EXCLUDED.avg_similarity,
                                detected_method = EXCLUDED.detected_method
                        RETURNING id
                        """,
                        (group_code, "text_ai", avg_sim, "jaccard_3gram_v1"),
                    )
                    group_id = cur.fetchone()[0]

                    # Привязываем карточки к группе
                    cur.execute(
                        "UPDATE requirement_cards SET duplicate_group_id = %s WHERE id = ANY(%s::int[])",
                        (group_id, [m[0] for m in members]),
                    )

                    # field_metadata: для каждой карточки записать duplicate_alert
                    rows = []
                    for cid, code in members:
                        peers = [m_code for m_id, m_code in members if m_id != cid]
                        explanation = (
                            f"ИИ-детектор обнаружил {len(peers)} похожих карточек в сфере {sphere}: "
                            f"{', '.join(peers[:5])}{'...' if len(peers) > 5 else ''}. "
                            f"Средняя текстовая similarity (Jaccard 3-грамм): {avg_sim:.2f}. "
                            f"Группа: {group_code}. "
                            f"ВНИМАНИЕ: дедупликация не выполнена — карточки сохранены, "
                            f"требуется ручная проверка эксперта."
                        )
                        rows.append((
                            cid, "duplicate_alert", group_code, "rule",
                            f"jaccard_3gram>={args.threshold}", float(avg_sim),
                            explanation, "unchecked"
                        ))

                    if rows:
                        execute_values(
                            cur,
                            """
                            INSERT INTO field_metadata
                                (card_id, field_name, value_text, source, method,
                                 confidence, explanation, check_status)
                            VALUES %s
                            ON CONFLICT (card_id, field_name) DO UPDATE
                                SET value_text = EXCLUDED.value_text,
                                    confidence = EXCLUDED.confidence,
                                    explanation = EXCLUDED.explanation,
                                    updated_at = NOW()
                            """,
                            rows,
                        )

            conn.commit()

            # Сводка
            cur.execute(
                """
                SELECT COUNT(*) FROM duplicate_groups WHERE duplicate_type = 'text_ai'
                """
            )
            n_groups = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*) FROM requirement_cards WHERE duplicate_group_id IS NOT NULL
                """
            )
            n_in_groups = cur.fetchone()[0]

            cur.execute(
                """
                SELECT dg.group_code, dg.avg_similarity, COUNT(rc.id) AS members
                  FROM duplicate_groups dg
                  JOIN requirement_cards rc ON rc.duplicate_group_id = dg.id
                 WHERE dg.duplicate_type = 'text_ai'
                 GROUP BY dg.group_code, dg.avg_similarity
                 ORDER BY members DESC, avg_similarity DESC
                 LIMIT 10
                """
            )
            top = cur.fetchall()

            print()
            print(f"[dup] Создано text_ai групп: {n_groups}")
            print(f"[dup] Карточек в группах:    {n_in_groups}")
            print(f"[dup] Пар найдено:           {len(pairs)}")
            print()
            print("Топ-10 групп:")
            for code, sim, members in top:
                print(f"  {code:<30} sim={sim}  members={members}")


if __name__ == "__main__":
    main()
