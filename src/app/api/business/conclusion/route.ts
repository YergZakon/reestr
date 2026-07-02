import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIVE = `rr.is_canonical AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')
  AND NOT COALESCE(rr.excluded, false)
  AND COALESCE(rr.review_status,'pending') <> 'rejected'`;
const STAGE_LABEL: Record<string, string> = {
  planning: "Планирование", registration: "Регистрация", pre_launch: "До запуска", launch: "Запуск",
  operation: "Деятельность", reporting: "Отчётность", inspection: "Проверки", expansion: "Расширение",
  suspension: "Приостановка", closure: "Закрытие",
};
const STAGE_ORDER = Object.keys(STAGE_LABEL);

const SYSTEM = `Ты — консультант по регуляторным требованиям для бизнеса Казахстана.
На основе переданных данных реестра составь практическое ЗАКЛЮЧЕНИЕ для предпринимателя.
Пиши по-деловому, конкретно, без воды и без выдумок — опирайся ТОЛЬКО на переданные требования и органы.
Структура (Markdown, заголовки ##):
## Кратко
1–2 абзаца: чем регулируется этот вид деятельности и общий объём обязательств.
## Что оформить до старта
Маркированный список разрешений/лицензий с указанием органа (из данных). Если разрешений нет — так и напиши.
Укажи, что лицензии и разрешения оформляются на портале **eLicense.kz**, а регистрация бизнеса и налоговые процедуры — на **eGov.kz**.
## Пошаговый план
По стадиям жизненного цикла (планирование → регистрация → запуск → деятельность → отчётность → проверки). Под каждой — ключевые действия.
## Постоянные обязанности
Что соблюдать на регулярной основе.
## На что обратить внимание
Риски, типичные нарушения, на чём концентрируется надзор.
Не перечисляй все требования дословно — обобщай и группируй. Объём — до ~700 слов.`;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (!process.env.DEEPSEEK_API_KEY)
    return NextResponse.json({ error: "ИИ-сервис не настроен (нет ключа)" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const oked = String(body.oked || "").replace(/\./g, "").trim();
  let section = String(body.section || "").trim().toUpperCase();
  const title = String(body.title || "ваш бизнес").slice(0, 120);
  const T: string[] = Array.isArray(body.triggers) ? body.triggers.filter((x: unknown) => typeof x === "string") : [];

  if (oked && !section) {
    const prefixes = [oked, oked.slice(0, 4), oked.slice(0, 3), oked.slice(0, 2)].filter((p) => p.length >= 2);
    const r = await query(
      `SELECT section FROM oked_dict WHERE code = ANY($1) AND section IS NOT NULL ORDER BY length(code) DESC LIMIT 1`,
      [prefixes]);
    if (r.rows[0]) section = r.rows[0].section;
  }
  const sectionName = section
    ? (await query(`SELECT name_ru FROM oked_section WHERE section = $1`, [section])).rows[0]?.name_ru ?? null
    : null;

  // фильтр применимости (как в requirements)
  const applic = (params: unknown[]) => {
    if (T.length) { params.push(T); return `(rr.triggers IS NULL OR cardinality(rr.triggers)=0 OR rr.triggers && $${params.length}::text[])`; }
    return `(rr.triggers IS NULL OR cardinality(rr.triggers)=0)`;
  };
  const expandCut = String(body.path || "") === "expand" ? " AND NOT ('registration' = ANY(rr.stages) AND rr.scope='horizontal')" : "";

  // релевантные отраслевые сферы по ОКЭД-охвату (карта сфера→ОКЭД)
  let relSpheres: string[] = [];
  if (oked) {
    const r = await query(`SELECT code FROM spheres WHERE NOT COALESCE(is_horizontal,false) AND oked_prefixes IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(oked_prefixes) p WHERE $1 LIKE p || '%')`, [oked]);
    relSpheres = r.rows.map((x: { code: string }) => x.code);
  }
  const useSpheres = !!oked && relSpheres.length > 0;
  const sectoralRel = (params: unknown[]) => {
    if (useSpheres) { params.push(relSpheres); return `rr.sphere_code = ANY($${params.length}::text[])`; }
    if (section) { params.push(section); return `$${params.length} = ANY(rr.sections)`; }
    return "false";
  };

  // permits
  const pParams: unknown[] = [];
  const pSr = sectoralRel(pParams);
  const pAp = applic(pParams);
  const permits = (await query(
    `SELECT DISTINCT COALESCE(NULLIF(rr.title,''), rr.action) AS t, rr.ministry
     FROM requirement_registry rr LEFT JOIN spheres s ON s.code=rr.sphere_code
     WHERE ${ACTIVE} AND COALESCE(rr.is_permit,false)=true
       AND ((COALESCE(s.is_horizontal,false) AND COALESCE(rr.audience,'any')='any') OR ${pSr}) AND ${pAp}${expandCut}
     ORDER BY 1 LIMIT 50`, pParams)).rows;

  // sectoral по стадиям (только названия, компактно)
  const sectoral = (useSpheres || section) ? (await (async () => {
    const sParams: unknown[] = [];
    const sSr = sectoralRel(sParams);
    const sAp = applic(sParams);
    return query(
      `SELECT COALESCE(NULLIF(rr.title,''), rr.action) AS t, rr.stages, rr.ministry
       FROM requirement_registry rr LEFT JOIN spheres s ON s.code=rr.sphere_code
       WHERE ${ACTIVE} AND NOT COALESCE(s.is_horizontal,false) AND COALESCE(rr.is_permit,false)=false
         AND ${sSr} AND ${sAp}${expandCut}
       ORDER BY rr.ministry NULLS LAST LIMIT 140`, sParams);
  })()).rows : [];

  // общие — сводка по сферам
  const hParams: unknown[] = [];
  const hAp = applic(hParams);
  const horiz = (await query(
    `SELECT s.name_ru, count(*)::int n FROM requirement_registry rr LEFT JOIN spheres s ON s.code=rr.sphere_code
     WHERE ${ACTIVE} AND COALESCE(s.is_horizontal,false) AND COALESCE(rr.is_permit,false)=false
       AND COALESCE(rr.audience,'any')='any' AND ${hAp}${expandCut}
     GROUP BY s.name_ru ORDER BY n DESC LIMIT 20`, hParams)).rows;

  // компактный контекст
  const byStage: Record<string, string[]> = {};
  for (const r of sectoral as { t: string; stages: string[] | null }[]) {
    const sts = (r.stages && r.stages.length) ? r.stages : ["operation"];
    for (const st of sts) { (byStage[st] ||= []).push(r.t); }
  }
  const stageBlock = STAGE_ORDER.filter((st) => byStage[st]?.length)
    .map((st) => `### ${STAGE_LABEL[st]}\n` + Array.from(new Set(byStage[st])).slice(0, 18).map((t) => `- ${t}`).join("\n"))
    .join("\n");
  const permitsBlock = permits.length
    ? (permits as { t: string; ministry: string | null }[]).map((p) => `- ${p.t}${p.ministry ? ` (${p.ministry})` : ""}`).join("\n")
    : "(разрешительных требований не выявлено)";
  const horizBlock = (horiz as { name_ru: string | null; n: number }[]).map((h) => `- ${h.name_ru || "Прочее"}: ${h.n}`).join("\n");

  const userMsg =
    `ВИД ДЕЯТЕЛЬНОСТИ: ${title}${sectionName ? ` (отрасль: ${sectionName})` : ""}${oked ? `, ОКЭД ${oked}` : ""}\n` +
    `ПРОФИЛЬ (отмеченные условия): ${T.length ? T.join(", ") : "только базовые"}\n\n` +
    `РАЗРЕШЕНИЯ/ЛИЦЕНЗИИ К ОФОРМЛЕНИЮ:\n${permitsBlock}\n\n` +
    `ОТРАСЛЕВЫЕ ТРЕБОВАНИЯ ПО СТАДИЯМ:\n${stageBlock || "(нет)"}\n\n` +
    `ОБЩИЕ ТРЕБОВАНИЯ (по сферам, число):\n${horizBlock || "(нет)"}\n\n` +
    `Составь заключение по заданной структуре.`;

  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
        max_tokens: 2600, temperature: 0.3,
      }),
    });
    if (!resp.ok) {
      const e = await resp.text();
      return NextResponse.json({ error: `Ошибка ИИ-сервиса (${resp.status})`, detail: e.slice(0, 200) }, { status: 502 });
    }
    const j = await resp.json();
    const text = j.choices?.[0]?.message?.content || "";
    return NextResponse.json({
      conclusion: text,
      meta: { title, sectionName, oked: oked || null, triggers: T, permits: permits.length, sectoral: sectoral.length },
    });
  } catch (e) {
    return NextResponse.json({ error: "Не удалось сгенерировать заключение", detail: String(e).slice(0, 200) }, { status: 502 });
  }
}
