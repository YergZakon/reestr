import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — проверка живости для Railway (публичный, без авторизации).
 *
 * Раньше healthcheck смотрел на /api/auth/me, который закрыт middleware и
 * отвечает редиректом на вход, — деплой не проходил проверку. Здесь всегда 200,
 * если процесс жив: состояние базы возвращается в теле, но не роняет выкатку —
 * при недоступной или медленной базе перезапуск контейнера всё равно не поможет.
 */
export async function GET() {
  let db = "ok";
  try {
    await Promise.race([
      query("SELECT 1"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 3000)),
    ]);
  } catch (e) {
    db = e instanceof Error && e.message === "slow" ? "slow" : "down";
  }
  return NextResponse.json({ ok: true, db, ts: new Date().toISOString() });
}
