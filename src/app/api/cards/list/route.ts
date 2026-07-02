/**
 * GET /api/cards/list
 *
 * Постраничный список requirement_cards с фильтрами.
 *
 * Query params:
 *   - page (1-based, default 1)
 *   - limit (default 20, max 100)
 *   - sphere — sphere_code (mz_zdrav, mchs, ...)
 *   - vote_status — unvoted | voted | all (default unvoted — что эксперт ещё не оценил)
 *   - role_fragment — фильтр по типу нормы
 *   - requirement_type — фильтр по типу требования
 *   - q — поиск по short_title / canonical_text (ILIKE)
 *
 * Response:
 *   { cards: [...], total: int, page: int, pages: int }
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeLike } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const sphere = searchParams.get("sphere");
  const authority = searchParams.get("authority");
  const voteStatus = searchParams.get("vote_status") || "unvoted";
  const roleFragment = searchParams.get("role_fragment");
  const requirementType = searchParams.get("requirement_type");
  const q = searchParams.get("q");

  // Access control для эксперта (двойная ось):
  //   - нет назначенных сфер ИЛИ органов → пусто (с флагом для UI)
  //   - запросил сферу/орган не из своих → тоже пусто
  //   - иначе фильтруем по пересечению (запрошенное ИЛИ все назначенные)
  if (user.role === "expert") {
    if (user.assigned_spheres.length === 0 || user.assigned_authorities.length === 0) {
      return NextResponse.json({
        cards: [],
        total: 0,
        page: 1,
        pages: 0,
        limit,
        no_spheres_assigned: user.assigned_spheres.length === 0,
        no_authorities_assigned: user.assigned_authorities.length === 0,
      });
    }
    if (sphere && !user.assigned_spheres.includes(sphere)) {
      return NextResponse.json({ cards: [], total: 0, page: 1, pages: 0, limit });
    }
    if (authority && !user.assigned_authorities.includes(authority)) {
      return NextResponse.json({ cards: [], total: 0, page: 1, pages: 0, limit });
    }
  }

  // Build WHERE clause
  const conds: string[] = ["rc.is_canonical = true"];
  const params: unknown[] = [];

  if (user.role === "expert") {
    const allowedSpheres = sphere ? [sphere] : user.assigned_spheres;
    params.push(allowedSpheres);
    conds.push(`rc.sphere_code = ANY($${params.length}::text[])`);

    const allowedAuthorities = authority ? [authority] : user.assigned_authorities;
    params.push(allowedAuthorities);
    conds.push(`rc.controller_authority = ANY($${params.length}::text[])`);
  } else {
    if (sphere) {
      params.push(sphere);
      conds.push(`rc.sphere_code = $${params.length}`);
    }
    if (authority) {
      params.push(authority);
      conds.push(`rc.controller_authority = $${params.length}`);
    }
  }
  if (roleFragment) {
    params.push(roleFragment);
    conds.push(`rc.role_fragment = $${params.length}`);
  }
  if (requirementType) {
    params.push(requirementType);
    conds.push(`rc.requirement_type = $${params.length}`);
  }
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    conds.push(`(rc.short_title ILIKE $${params.length} OR rc.canonical_text ILIKE $${params.length})`);
  }

  // Vote status filter — JOIN card_votes
  if (voteStatus === "unvoted") {
    params.push(user.id);
    conds.push(`NOT EXISTS (SELECT 1 FROM card_votes cv WHERE cv.card_id = rc.id AND cv.user_id = $${params.length})`);
  } else if (voteStatus === "voted") {
    params.push(user.id);
    conds.push(`EXISTS (SELECT 1 FROM card_votes cv WHERE cv.card_id = rc.id AND cv.user_id = $${params.length})`);
  }

  const whereClause = conds.length > 0 ? "WHERE " + conds.join(" AND ") : "";

  // Total count (для pagination)
  const countSql = `SELECT COUNT(*) AS cnt FROM requirement_cards rc ${whereClause}`;
  const countResult = await query(countSql, params);
  const total = parseInt(countResult.rows[0].cnt, 10);

  // Page data — с агрегатом голосов и голосом текущего эксперта
  params.push(user.id, limit, offset);
  const dataSql = `
    SELECT
      rc.id, rc.card_code, rc.sphere_code, rc.subsphere,
      rc.short_title, rc.canonical_text, rc.legal_text, rc.business_text,
      rc.subject, rc.action, rc.object, rc.condition_text, rc.exception_text,
      rc.requirement_type, rc.role_fragment, rc.requirement_specificity,
      rc.mandatory_level, rc.timing, rc.frequency, rc.life_cycle_stage,
      rc.evidence_required, rc.evidence_form, rc.consequences, rc.can_be_online,
      rc.expert_status, rc.model_confidence, rc.created_at,
      rc.controller_authority,
      s.name_ru AS sphere_name,
      a.short_name AS authority_short, a.name_ru AS authority_name,
      (SELECT json_build_object('npa_title', n.npa_title, 'article_ref', n.article_ref, 'npa_url', n.npa_url)
         FROM npa_links n WHERE n.card_id = rc.id LIMIT 1) AS npa_link,
      COALESCE(votes.confirms, 0) AS confirms,
      COALESCE(votes.rejects, 0)  AS rejects,
      COALESCE(votes.uncertains, 0) AS uncertains,
      my_vote.vote AS my_vote,
      my_vote.comment AS my_comment
    FROM requirement_cards rc
    LEFT JOIN spheres s ON s.code = rc.sphere_code
    LEFT JOIN authorities a ON a.code = rc.controller_authority
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE vote = 'confirm') AS confirms,
        COUNT(*) FILTER (WHERE vote = 'reject')  AS rejects,
        COUNT(*) FILTER (WHERE vote = 'uncertain') AS uncertains
      FROM card_votes WHERE card_id = rc.id
    ) votes ON true
    LEFT JOIN card_votes my_vote ON my_vote.card_id = rc.id AND my_vote.user_id = $${params.length - 2}
    ${whereClause}
    ORDER BY rc.created_at DESC, rc.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await query(dataSql, params);

  return NextResponse.json({
    cards: result.rows,
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  });
}
