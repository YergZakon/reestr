/**
 * Postgres-based sliding-window rate limiter.
 *
 * Использует таблицу rate_limit_log (миграция 007). Каждый INSERT с UNIQUE
 * constraint на (user_id, endpoint, window_start) — atomic upsert через
 * ON CONFLICT. Если за последнюю минуту user_id запросил endpoint > limit
 * раз → возвращает { allowed: false, retryAfter }.
 *
 * Альтернатива: Redis sliding-window (если будет подключён Upstash).
 *
 * Использование в API route:
 *
 *   import { checkRateLimit } from "@/lib/rate-limit";
 *   const limit = await checkRateLimit(user.id, "POST /api/votes", 60);
 *   if (!limit.allowed) {
 *     return NextResponse.json(
 *       { error: "Rate limit exceeded", retry_after: limit.retryAfter },
 *       { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
 *     );
 *   }
 */
import pool from "./db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds
}

/**
 * Проверить лимит. Окно — 60 секунд (1 минута), скользящее.
 *
 * @param userId    ID пользователя
 * @param endpoint  идентификатор эндпойнта (произвольная строка, ≤100 chars)
 * @param limit     максимум запросов в окне
 * @param windowSec длина окна в секундах (default 60)
 */
export async function checkRateLimit(
  userId: number,
  endpoint: string,
  limit: number = 60,
  windowSec: number = 60,
): Promise<RateLimitResult> {
  // Округляем window_start до начала минуты — это ключ uniqueness
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSec * 1000)) * windowSec * 1000);

  const client = await pool.connect();
  try {
    // Atomic upsert: либо вставка с count=1, либо increment
    const result = await client.query(
      `INSERT INTO rate_limit_log (user_id, endpoint, request_count, window_start)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, endpoint, window_start)
       DO UPDATE SET request_count = rate_limit_log.request_count + 1
       RETURNING request_count`,
      [userId, endpoint, windowStart],
    );
    const count = result.rows[0].request_count as number;
    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;
    const retryAfter = allowed ? 0 : Math.ceil((windowStart.getTime() + windowSec * 1000 - now.getTime()) / 1000);
    return { allowed, remaining, retryAfter };
  } catch (err) {
    // При ошибке БД — fail open (пропустить). Лучше пропустить запрос, чем
    // блокировать всё приложение из-за rate-limit ошибки.
    console.error("[rate-limit] error, failing open:", err);
    return { allowed: true, remaining: limit, retryAfter: 0 };
  } finally {
    client.release();
  }
}

/**
 * Очистка старых записей. Запускайте раз в день через cron (Railway scheduled job)
 * или периодически из admin endpoint.
 */
export async function cleanupOldRateLimits(olderThanHours: number = 24): Promise<number> {
  const result = await pool.query(
    `DELETE FROM rate_limit_log WHERE window_start < NOW() - INTERVAL '${olderThanHours} hours'`,
  );
  return result.rowCount || 0;
}
