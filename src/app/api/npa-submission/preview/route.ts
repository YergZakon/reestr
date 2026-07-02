import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseArticles, parseTitle } from "@/lib/npaParse";
import { zbody, PreviewBody, NGR_RE } from "@/lib/validate";
import { request as httpsRequest } from "node:https";

/** GET adilet-страницы через node:https.
 *  adilet.zan.kz не отдаёт промежуточный сертификат цепочки → штатный fetch (undici,
 *  Mozilla CA) падает с UNABLE_TO_VERIFY_LEAF_SIGNATURE. Python-контур работает так же
 *  (verify=False). TODO Б6 (docs/architecture/09): закреплённый CA-bundle вместо отключения. */
function fetchAdilet(path: string, timeoutMs = 20000, depth = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: "adilet.zan.kz", path, method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (reestr-preview)" },
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && depth < 2) {
        res.resume();
        const loc = res.headers.location.replace(/^https?:\/\/adilet\.zan\.kz/, "");
        resolve(fetchAdilet(loc, timeoutMs, depth + 1));
        return;
      }
      if (code >= 400) { res.resume(); reject(new Error("adilet HTTP " + code)); return; }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
    req.on("timeout", () => req.destroy(new Error("adilet timeout")));
    req.on("error", reject);
    req.end();
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Мгновенный черновой превью: тянем публичный adilet-HTML по ngr, режем на статьи,
// прогоняем первые содержательные статьи через DeepSeek → черновые требования.
// Это UX-подсказка «что нашлось». Авторитетное извлечение — Python process_submissions.py.

const SYSTEM = `Ты юрист-аналитик регуляторики РК. На вход — фрагменты НПА (несколько статей).
Извлеки отдельные операционные требования к БИЗНЕСУ (ЮЛ, ИП, КФХ, недропользователь, оператор).
Требование — конкретная обязанность: процедура, документ, стандарт/норматив, платёж, оборудование, отчёт.
НЕ извлекай: полномочия госоргана; определения/термины/принципы; нормы к физлицу/работнику; чистые санкции; отсылочные нормы.
Верни СТРОГО JSON: {"requirements":[{"subject":"кто обязан","action":"что сделать (инфинитив)","object":"в отношении чего|null","condition":"условие|null","article":"№ статьи|null","quote":"5-20 слов из текста"}]}`;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "moderator")
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  if (!process.env.DEEPSEEK_API_KEY)
    return NextResponse.json({ error: "ИИ-сервис не настроен" }, { status: 503 });

  const v = await zbody(req, PreviewBody);
  if (!v.ok) return v.res;
  const ngr = v.data.ngr.trim().replace(/.*\/docs\//, "").replace(/#.*$/, "");
  if (!NGR_RE.test(ngr))
    return NextResponse.json({ error: "Укажите корректный ngr или ссылку adilet" }, { status: 400 });

  // 1. тянем adilet (node:https — см. fetchAdilet о причине)
  let html = "";
  try {
    html = await fetchAdilet(`/rus/docs/${ngr}`);
  } catch (e) {
    return NextResponse.json(
      { error: "Не удалось получить текст с adilet", detail: String((e as Error).message).slice(0, 120) },
      { status: 502 });
  }

  const title = parseTitle(html);
  const articles = parseArticles(html);
  if (!articles.length)
    return NextResponse.json({ title, articleCount: 0, requirements: [], note: "Структура НПА не распознана. Полный парсинг сделает пайплайн." });

  // 2. первые содержательные сегменты (статьи закона или пункт-блоки приказа) → до ~5000 симв
  const substantive = articles.filter((a) => a.text.length > 200).slice(0, 4);
  let joined = "";
  for (const a of substantive) {
    if (joined.length > 5000) break;
    joined += `\n\n[${a.label}]\n${a.text.slice(0, 1800)}`;
  }

  // 3. DeepSeek
  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: joined || articles[0].text }],
        max_tokens: 2000, temperature: 0.2, response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return NextResponse.json({ error: `Ошибка ИИ (${resp.status})` }, { status: 502 });
    const j = await resp.json();
    let reqs: unknown[] = [];
    try { reqs = JSON.parse(j.choices?.[0]?.message?.content || "{}").requirements || []; } catch { reqs = []; }
    return NextResponse.json({
      title, articleCount: articles.length, previewedArticles: substantive.map((a) => a.label),
      requirements: reqs,
    });
  } catch (e) {
    return NextResponse.json({ error: "Сбой ИИ-превью", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
