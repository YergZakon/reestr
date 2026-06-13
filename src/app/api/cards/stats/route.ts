/**
 * GET /api/cards/stats
 *
 * Сводка по requirement_cards для admin/dashboard.
 * Использует CTE для оптимальной производительности (1 проход expert_votes
 * через CTE вместо N×6 nested subqueries).
 *
 * Response:
 *   {
 *     overview: { total, by_status: {...}, total_votes, active_experts },
 *     by_sphere: [{ code, name, total, approved, rejected, in_review, disputed }],
 *     by_role: [{ role_fragment, count }],
 *     consensus: { confirmed, rejected, disputed, pending },
 *     expert_progress: [{ username, voted, total }]
 *   }
 *
 * Cache: 60-секундное in-memory кэширование (избегаем повторных тяжёлых query).
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Простой in-memory cache на 60 сек (per-process, без Redis)
let cache: { data: unknown; expires: number } | null = null;
const TTL_MS = 60_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // Cache hit
  if (cache && cache.expires > Date.now()) {
    return NextResponse.json({ ...(cache.data as object), _cached: true });
  }

  try {
    // Overview
    const overview = await query(`
      SELECT
        (SELECT COUNT(*) FROM requirement_cards WHERE is_canonical = true) AS total,
        (SELECT COUNT(*) FROM card_votes) AS total_votes,
        (SELECT COUNT(DISTINCT user_id) FROM card_votes) AS active_experts
    `);

    // By sphere with consensus statuses
    const bySphere = await query(`
      SELECT
        s.code,
        s.name_ru AS name,
        COUNT(rc.id) AS total,
        COUNT(*) FILTER (WHERE rc.expert_status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE rc.expert_status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE rc.expert_status = 'in_review') AS in_review,
        COUNT(*) FILTER (WHERE rc.expert_status = 'disputed') AS disputed,
        COUNT(*) FILTER (WHERE rc.expert_status = 'unchecked') AS unchecked
      FROM spheres s
      LEFT JOIN requirement_cards rc ON rc.sphere_code = s.code AND rc.is_canonical = true
      GROUP BY s.code, s.name_ru, s.is_mvp
      ORDER BY total DESC
    `);

    // By role_fragment
    const byRole = await query(`
      SELECT role_fragment, COUNT(*) AS count
      FROM requirement_cards
      WHERE is_canonical = true AND role_fragment IS NOT NULL
      GROUP BY role_fragment ORDER BY count DESC
    `);

    // Consensus aggregate (using CTE for O(n) instead of O(n²))
    const consensus = await query(`
      WITH vote_agg AS (
        SELECT
          card_id,
          COUNT(*) FILTER (WHERE vote = 'confirm') AS confirms,
          COUNT(*) FILTER (WHERE vote = 'reject')  AS rejects,
          COUNT(*) AS total
        FROM card_votes
        GROUP BY card_id
      )
      SELECT
        COUNT(*) FILTER (WHERE va.confirms >= 3 AND va.rejects = 0) AS confirmed,
        COUNT(*) FILTER (WHERE va.rejects >= 3 AND va.confirms = 0) AS rejected,
        COUNT(*) FILTER (WHERE va.total >= 3 AND va.confirms > 0 AND va.rejects > 0) AS disputed,
        COUNT(*) FILTER (WHERE va.total > 0 AND va.total < 3) AS partial,
        (SELECT COUNT(*) FROM requirement_cards WHERE is_canonical = true)
          - COUNT(*) AS pending
      FROM requirement_cards rc
      LEFT JOIN vote_agg va ON va.card_id = rc.id
      WHERE rc.is_canonical = true AND va.card_id IS NOT NULL
    `);

    // Expert progress
    const expertProgress = await query(`
      SELECT
        u.id, u.username, u.full_name,
        COUNT(cv.id) AS voted,
        (SELECT COUNT(*) FROM requirement_cards WHERE is_canonical = true) AS total
      FROM users u
      LEFT JOIN card_votes cv ON cv.user_id = u.id
      WHERE u.role = 'expert' AND u.is_active = true
      GROUP BY u.id, u.username, u.full_name
      ORDER BY voted DESC
    `);

    const data = {
      overview: overview.rows[0],
      by_sphere: bySphere.rows,
      by_role: byRole.rows,
      consensus: consensus.rows[0],
      expert_progress: expertProgress.rows,
      generated_at: new Date().toISOString(),
    };

    cache = { data, expires: Date.now() + TTL_MS };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/cards/stats] error:", err);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(err) },
      { status: 500 },
    );
  }
}
