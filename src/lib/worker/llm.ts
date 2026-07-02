// DeepSeek-клиент воркера: temp 0, JSON-режим, ретраи с backoff.
// Учёт затрат ($) — ТОЛЬКО в серверные логи Railway (по решению заказчика
// стоимость обработки нигде в API/UI не показывается).

const API = "https://api.deepseek.com/v1/chat/completions";
// Тарифы DeepSeek (за 1M токенов): вход miss $0.27 / hit $0.014, выход $1.10.
const PRICE = { inMiss: 0.27, inHit: 0.014, out: 1.1 };

export interface Usage { in: number; hit: number; out: number; calls: number }
export const newUsage = (): Usage => ({ in: 0, hit: 0, out: 0, calls: 0 });
export const usageCostUsd = (u: Usage) =>
  ((u.in - u.hit) / 1e6) * PRICE.inMiss + (u.hit / 1e6) * PRICE.inHit + (u.out / 1e6) * PRICE.out;

export async function dsChat(
  system: string, user: string, maxTokens: number, usage?: Usage, retries = 3,
): Promise<Record<string, unknown>> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY не задан");
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          max_tokens: maxTokens, temperature: 0, response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (r.status === 429 || r.status >= 500) throw new Error("DeepSeek " + r.status);
      if (!r.ok) throw Object.assign(new Error("DeepSeek " + r.status), { fatal: true });
      const j = await r.json();
      if (usage) {
        usage.calls += 1;
        usage.in += j.usage?.prompt_tokens || 0;
        usage.hit += j.usage?.prompt_cache_hit_tokens || 0;
        usage.out += j.usage?.completion_tokens || 0;
      }
      try {
        return JSON.parse(j.choices?.[0]?.message?.content || "{}");
      } catch {
        return {}; // невалидный JSON от модели — считаем пустым результатом
      }
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
      if (i < retries) await new Promise((res) => setTimeout(res, 800 * 2 ** i));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Пул с ограничением параллелизма (LLM-вызовы IO-bound). */
export async function pMap<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
