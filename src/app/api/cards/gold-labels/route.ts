/**
 * GET /api/cards/gold-labels
 *
 * Gold/Silver/Disputed/Insufficient разметка карточек на основе card_votes.
 *
 * Query: sphere, role_fragment, min_votes (default 3), gold_confidence (фильтр)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { computeGoldLabel, GoldLabel } from "@/lib/agreement";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin")
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const url = new URL(req.url);
    const sphere = url.searchParams.get("sphere");
    const roleFragment = url.searchParams.get("role_fragment");
    const minVotes = parseInt(url.searchParams.get("min_votes") || "3", 10);
    const goldConfidence = url.searchParams.get("gold_confidence");

    let cardWhere = "WHERE rc.is_canonical = true";
    const params: unknown[] = [];
    let idx = 1;

    if (sphere) {
      cardWhere += ` AND rc.sphere_code = $${idx}`;
      params.push(sphere);
      idx++;
    }
    if (roleFragment) {
      cardWhere += ` AND rc.role_fragment = $${idx}`;
      params.push(roleFragment);
      idx++;
    }

    // SUMMARY — посчитать в SQL без JS-цикла на 67К карточек.
    // Поднимать данные карточек в Node нужно только для тех что имеют голоса
    // (либо отфильтрованных по gold_confidence). Остальные — счётчик insufficient.
    const summaryResult = await query(
      `WITH vote_agg AS (
        SELECT card_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE vote = 'confirm')   AS confirms,
               COUNT(*) FILTER (WHERE vote = 'reject')    AS rejects,
               COUNT(*) FILTER (WHERE vote = 'uncertain') AS uncertains
        FROM card_votes
        GROUP BY card_id
      )
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (
          WHERE va.total >= $${idx}
            AND (
              GREATEST(va.confirms, va.rejects, va.uncertains)::float / NULLIF(va.total,0) = 1.0
            )
        ) AS gold,
        COUNT(*) FILTER (
          WHERE va.total >= $${idx}
            AND GREATEST(va.confirms, va.rejects, va.uncertains)::float / NULLIF(va.total,0) >= 0.75
            AND GREATEST(va.confirms, va.rejects, va.uncertains)::float / NULLIF(va.total,0) < 1.0
        ) AS silver,
        COUNT(*) FILTER (
          WHERE va.total >= $${idx}
            AND GREATEST(va.confirms, va.rejects, va.uncertains)::float / NULLIF(va.total,0) < 0.75
        ) AS disputed,
        COUNT(*) FILTER (WHERE va.card_id IS NULL OR va.total < $${idx}) AS insufficient
      FROM requirement_cards rc
      LEFT JOIN vote_agg va ON va.card_id = rc.id
      ${cardWhere}`,
      [...params, minVotes],
    );

    const summary = {
      total: parseInt(summaryResult.rows[0].total, 10),
      gold: parseInt(summaryResult.rows[0].gold, 10),
      silver: parseInt(summaryResult.rows[0].silver, 10),
      disputed: parseInt(summaryResult.rows[0].disputed, 10),
      insufficient: parseInt(summaryResult.rows[0].insufficient, 10),
    };

    // LABELS — берём только карточки с голосами (для всех остальных и так
    // gold_confidence=insufficient, скучно для UI). Лимит 500 чтобы не таскать
    // мегабайты по сети.
    const labelsResult = await query(
      `SELECT rc.id AS requirement_id,
              rc.card_code AS external_id,
              COALESCE(rc.role_fragment, 'unknown') AS category,
              rc.sphere_code AS sphere,
              rc.short_title AS text_summary,
              s.name_ru AS sphere_name,
              (SELECT npa_title FROM npa_links WHERE card_id = rc.id LIMIT 1) AS npa_title,
              json_agg(json_build_object('vote', cv.vote)) AS votes
       FROM requirement_cards rc
       JOIN card_votes cv ON cv.card_id = rc.id
       LEFT JOIN spheres s ON s.code = rc.sphere_code
       ${cardWhere}
       GROUP BY rc.id, rc.card_code, rc.role_fragment, rc.sphere_code,
                rc.short_title, s.name_ru
       ORDER BY rc.id
       LIMIT 500`,
      params,
    );

    const labels: (GoldLabel & {
      external_id: string;
      category: string;
      sphere: string;
      sphere_name: string | null;
      npa_title: string | null;
      text_summary: string | null;
    })[] = [];

    for (const row of labelsResult.rows) {
      const votes = row.votes || [];
      const gl = computeGoldLabel(row.requirement_id, votes, {
        majorityThreshold: 0.75,
        minVotes,
      });
      if (goldConfidence && gl.gold_confidence !== goldConfidence) continue;
      labels.push({
        ...gl,
        external_id: row.external_id,
        category: row.category,
        sphere: row.sphere,
        sphere_name: row.sphere_name,
        npa_title: row.npa_title,
        text_summary: row.text_summary,
      });
    }

    return NextResponse.json({ summary, labels, _label_limit: 500 });
  } catch (error) {
    console.error("[/api/cards/gold-labels] error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 },
    );
  }
}
