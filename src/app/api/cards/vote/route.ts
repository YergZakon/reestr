/**
 * POST /api/cards/vote
 *
 * Голос эксперта по карточке. Идемпотентный upsert по UNIQUE(card_id, user_id).
 * Защищён rate-limit (60 votes/min на user).
 *
 * Body: { cardId: number, vote: "confirm"|"reject"|"uncertain", comment?: string }
 *
 * Response (success): { ok: true, version: int, totals: {confirms, rejects, uncertains} }
 * Response (rate limit): 429 + { retry_after: seconds }
 *
 * PUT /api/cards/vote — массовое голосование, body: { votes: [...] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { zbody, VoteBody, BulkVotesBody } from "@/lib/validate";

const VOTE_LIMIT_PER_MIN = 60;
const BULK_LIMIT_PER_MIN = 5;

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "POST /api/cards/vote", VOTE_LIMIT_PER_MIN);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Слишком частое голосование. Подождите минуту.", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const vb = await zbody(req, VoteBody);
  if (!vb.ok) return vb.res;
  const { cardId, vote, comment } = vb.data;

  // Проверим, что карточка существует, и что её (sphere, authority) разрешены эксперту
  const card = await query(
    "SELECT id, sphere_code, controller_authority FROM requirement_cards WHERE id = $1",
    [cardId],
  );
  if (card.rows.length === 0) {
    return NextResponse.json({ error: "Карточка не найдена" }, { status: 404 });
  }
  if (user.role === "expert") {
    if (!user.assigned_spheres.includes(card.rows[0].sphere_code)) {
      return NextResponse.json(
        { error: "Нет доступа к этой сфере" },
        { status: 403 },
      );
    }
    if (
      !user.assigned_authorities.includes(card.rows[0].controller_authority)
    ) {
      return NextResponse.json(
        { error: "Нет доступа к этому органу" },
        { status: 403 },
      );
    }
  }

  // Upsert голоса
  const result = await query(
    `INSERT INTO card_votes (card_id, user_id, vote, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (card_id, user_id)
     DO UPDATE SET vote = $3, comment = $4
     RETURNING version`,
    [cardId, user.id, vote, comment || null],
  );
  const version = result.rows[0].version;

  // Лог
  await query(
    "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
    [user.id, "card_vote", JSON.stringify({ cardId, vote })],
  );

  // Обновим expert_status в requirement_cards в зависимости от консенсуса
  // (если 3+ confirm и 0 reject — approved; если 3+ reject и 0 confirm — rejected; иначе in_review)
  const totals = await query(
    `SELECT
        COUNT(*) FILTER (WHERE vote = 'confirm') AS confirms,
        COUNT(*) FILTER (WHERE vote = 'reject')  AS rejects,
        COUNT(*) FILTER (WHERE vote = 'uncertain') AS uncertains
     FROM card_votes WHERE card_id = $1`,
    [cardId],
  );
  const t = totals.rows[0];
  let newStatus = "in_review";
  if (parseInt(t.confirms, 10) >= 3 && parseInt(t.rejects, 10) === 0) newStatus = "approved";
  else if (parseInt(t.rejects, 10) >= 3 && parseInt(t.confirms, 10) === 0) newStatus = "rejected";
  else if (parseInt(t.confirms, 10) > 0 && parseInt(t.rejects, 10) > 0) newStatus = "disputed";

  await query(
    "UPDATE requirement_cards SET expert_status = $1, updated_at = NOW() WHERE id = $2",
    [newStatus, cardId],
  );

  return NextResponse.json({
    ok: true,
    version,
    totals: {
      confirms: parseInt(t.confirms, 10),
      rejects: parseInt(t.rejects, 10),
      uncertains: parseInt(t.uncertains, 10),
    },
    expert_status: newStatus,
  });
}

// Массовое голосование
export async function PUT(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "PUT /api/cards/vote", BULK_LIMIT_PER_MIN);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Слишком частые массовые операции.", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const vb = await zbody(req, BulkVotesBody);
  if (!vb.ok) return vb.res;
  const { votes } = vb.data;

  // Pre-fetch (sphere, authority) для всех cardId — одним запросом
  const validVotes = votes.filter(
    (v) => v.cardId && ["confirm", "reject", "uncertain"].includes(v.vote),
  );
  if (validVotes.length === 0) return NextResponse.json({ ok: true, count: 0 });

  const cardIds = Array.from(new Set(validVotes.map((v) => Number(v.cardId))));
  const lookup = await query(
    "SELECT id, sphere_code, controller_authority FROM requirement_cards WHERE id = ANY($1::int[])",
    [cardIds],
  );
  const cardAccess = new Map<number, { sphere: string; authority: string | null }>(
    lookup.rows.map((r) => [
      r.id as number,
      { sphere: r.sphere_code as string, authority: r.controller_authority as string | null },
    ]),
  );

  let count = 0;
  let skippedNoAccess = 0;
  for (const v of validVotes) {
    const acc = cardAccess.get(Number(v.cardId));
    if (!acc) continue; // карточка не существует
    if (user.role === "expert") {
      if (!user.assigned_spheres.includes(acc.sphere)) {
        skippedNoAccess++;
        continue;
      }
      if (!acc.authority || !user.assigned_authorities.includes(acc.authority)) {
        skippedNoAccess++;
        continue;
      }
    }
    await query(
      `INSERT INTO card_votes (card_id, user_id, vote, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (card_id, user_id)
       DO UPDATE SET vote = $3, comment = $4`,
      [v.cardId, user.id, v.vote, v.comment || null],
    );
    count++;
  }
  return NextResponse.json({ ok: true, count, skipped_no_access: skippedNoAccess });
}
