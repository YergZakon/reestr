import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const VOTE_LIMIT_PER_MIN = 60; // ≈1 vote/sec — комфортный темп для эксперта
const BULK_LIMIT_PER_MIN = 5;  // массовое голосование — реже

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // Rate-limit: защита от случайного цикла или вредоносного спама
  const rl = await checkRateLimit(user.id, "POST /api/votes", VOTE_LIMIT_PER_MIN);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Слишком частое голосование. Подождите минуту.", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { requirementId, vote, comment } = await req.json();

  if (!requirementId || !vote) {
    return NextResponse.json({ error: "requirementId и vote обязательны" }, { status: 400 });
  }
  if (!["confirm", "reject", "uncertain"].includes(vote)) {
    return NextResponse.json({ error: "vote: confirm | reject | uncertain" }, { status: 400 });
  }

  // Получаем iteration_id требования
  const reqResult = await query("SELECT iteration_id FROM requirements WHERE id = $1", [requirementId]);
  if (reqResult.rows.length === 0) {
    return NextResponse.json({ error: "Требование не найдено" }, { status: 404 });
  }
  const iterationId = reqResult.rows[0].iteration_id;

  // Upsert голоса
  await query(
    `INSERT INTO expert_votes (requirement_id, user_id, iteration_id, vote, comment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (requirement_id, user_id, iteration_id)
     DO UPDATE SET vote = $4, comment = $5, voted_at = NOW()`,
    [requirementId, user.id, iterationId, vote, comment || null]
  );

  // Лог
  await query(
    "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
    [user.id, "vote", JSON.stringify({ requirementId, vote })]
  );

  return NextResponse.json({ ok: true });
}

// Массовое голосование
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "PUT /api/votes", BULK_LIMIT_PER_MIN);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Слишком частые массовые операции. Подождите.", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { votes } = await req.json(); // [{requirementId, vote, comment}]
  if (!Array.isArray(votes)) {
    return NextResponse.json({ error: "votes должен быть массивом" }, { status: 400 });
  }

  let count = 0;
  for (const v of votes) {
    const reqResult = await query("SELECT iteration_id FROM requirements WHERE id = $1", [v.requirementId]);
    if (reqResult.rows.length === 0) continue;

    await query(
      `INSERT INTO expert_votes (requirement_id, user_id, iteration_id, vote, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (requirement_id, user_id, iteration_id)
       DO UPDATE SET vote = $4, comment = $5, voted_at = NOW()`,
      [v.requirementId, user.id, reqResult.rows[0].iteration_id, v.vote, v.comment || null]
    );
    count++;
  }

  return NextResponse.json({ ok: true, count });
}
