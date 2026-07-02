// Облачный воркер подач: npa_submission(submitted) → adilet → чанкер → DeepSeek
// (извлечение → валидация+классификация) → trgm-дедуп-фильтр → requirement_registry
// (source='submission', review_status='pending') → очередь ревью органа.
//
// Человеческая (юридическая) валидация НЕ здесь: ревью органом → срок АРА → include МНЭ.
// Полный семантический дедуп (bge-m3) — регламентный; здесь только быстрый pg_trgm-флаг.
// Затраты DeepSeek логируются ТОЛЬКО в console (серверные логи Railway).
import pool, { query } from "@/lib/db";
import { fetchAdilet } from "@/lib/adilet";
import { parseArticles, parseTitle } from "@/lib/npaParse";
import { dsChat, pMap, newUsage, usageCostUsd } from "./llm";
import { SYSTEM_EXTRACT, buildExtractUser, SYSTEM_CARD, buildCardUser, buildSphereSystem } from "./prompts";

const MAX_SEGMENTS = 120;      // как в Python-конвейере (--max-articles 120)
const EXTRACT_POOL = 5;
const CARD_POOL = 6;
const MAX_ATTEMPTS = 3;        // порог trgm-дубля задаётся в checkDup (similarity_threshold=0.6)

interface Sub { id: number; ngr: string; sphere_code: string | null; org_id: number | null }

/** Захват следующей подачи (SKIP LOCKED); подхватывает и зависшие (lease истёк). */
export async function claimNext(): Promise<Sub | null> {
  const r = await query(`
    UPDATE npa_submission SET status='processing', stage='fetch',
           lease_until = now() + interval '20 minutes', attempt_count = attempt_count + 1
    WHERE id = (
      SELECT id FROM npa_submission
      WHERE status = 'submitted' OR (status = 'processing' AND lease_until < now())
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
    RETURNING id, ngr, sphere_code, org_id`);
  return (r.rows[0] as Sub) || null;
}

const setStage = (id: number, stage: string) =>
  query("UPDATE npa_submission SET stage=$1, lease_until = now() + interval '20 minutes' WHERE id=$2", [stage, id]);

async function fail(id: number, attempt: number, msg: string) {
  const final = attempt >= MAX_ATTEMPTS;
  await query(
    `UPDATE npa_submission SET status=$1, error=$2, lease_until=NULL WHERE id=$3`,
    [final ? "error" : "submitted", msg.slice(0, 300), id]);
  console.error(`[worker] подача ${id}: ${final ? "ERROR (исчерпаны попытки)" : "retry"} — ${msg.slice(0, 160)}`);
}

/** Дедуп-подозрение для одной карточки. Двухэшелонный и НЕ фатальный:
 *  1) exact: та же пара (ngr, action) уже в каноне — btree, мгновенно (повторная подача НПА);
 *  2) trgm: похожий текст по всему реестру — выделенное соединение, порог 0.6 НА УРОВНЕ
 *     ИНДЕКСА (set pg_trgm.similarity_threshold) + statement_timeout 5s.
 *  Любая ошибка/таймаут → null (подача не тормозится; полный дедуп — регламентный bge-m3). */
async function checkDup(ngr: string, action: string, legal: string): Promise<number | null> {
  try {
    const exact = await query(
      `SELECT id FROM requirement_registry
       WHERE ngr = $1 AND action = $2 AND is_canonical
         AND (npa_status IS NULL OR npa_status <> 'утратил силу') LIMIT 1`,
      [ngr, action]);
    if (exact.rows[0]) return exact.rows[0].id as number;
  } catch { /* не фатально */ }

  if (legal.length < 25) return null;
  const cl = await pool.connect();
  try {
    await cl.query("SET statement_timeout = '5s'");
    await cl.query("SET pg_trgm.similarity_threshold = 0.6");
    const r = await cl.query(
      `SELECT id FROM requirement_registry
       WHERE is_canonical AND (npa_status IS NULL OR npa_status <> 'утратил силу')
         AND COALESCE(canon_text, legal_text, '') % $1
       LIMIT 1`, [legal]);
    return r.rows[0] ? (r.rows[0].id as number) : null;
  } catch {
    return null; // таймаут/ошибка trgm — карточка идёт без флага
  } finally {
    try { await cl.query("RESET statement_timeout; RESET pg_trgm.similarity_threshold"); } catch { /* noop */ }
    cl.release();
  }
}

const norm = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const num = (v: unknown): number | null => {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : null;
};

/** Полная обработка одной подачи. Возвращает true, если что-то обработано. */
export async function processOne(): Promise<boolean> {
  const claim = await query("SELECT 1"); // прогрев соединения пула
  void claim;
  const sub = await claimNext();
  if (!sub) return false;

  const attempt = (await query("SELECT attempt_count FROM npa_submission WHERE id=$1", [sub.id])).rows[0]?.attempt_count || 1;
  const usage = newUsage();
  const t0 = Date.now();
  try {
    // — орган подачи (authority_code/ministry как в Python-конвейере)
    const org = sub.org_id
      ? (await query("SELECT code, name_ru FROM organizations WHERE id=$1", [sub.org_id])).rows[0]
      : null;

    // 1. adilet + чанкер (единый каскад, контракт с Python закреплён тестами)
    const html = await fetchAdilet(`/rus/docs/${sub.ngr}`);
    const npaTitle = (parseTitle(html) || sub.ngr).slice(0, 250);
    let segments = parseArticles(html);
    const capped = segments.length > MAX_SEGMENTS;
    if (capped) segments = segments.slice(0, MAX_SEGMENTS);
    if (!segments.length) {
      await query(
        `UPDATE npa_submission SET status='parsed', stage=NULL, lease_until=NULL,
         cards_created=0, processed_at=now(), npa_title=COALESCE(npa_title,$2) WHERE id=$1`,
        [sub.id, npaTitle]);
      console.log(`[worker] подача ${sub.id} (${sub.ngr}): структура не распознана → parsed/0`);
      return true;
    }

    // 2. сфера НПА (если не задана подачей) — один вызов по живому справочнику
    await setStage(sub.id, "extract");
    let sphere = sub.sphere_code;
    if (!sphere) {
      const sp = await query("SELECT code, name_ru FROM spheres ORDER BY code");
      const list = sp.rows.map((s) => `${s.code} — ${s.name_ru}`).join("\n");
      const probe = segments.slice(0, 2).map((s) => s.text.slice(0, 900)).join("\n");
      const res = await dsChat(buildSphereSystem(list), `НПА: ${npaTitle}\n\nФрагменты:\n${probe}`, 200, usage);
      const code = norm(res.sphere_code, 40);
      if (code && sp.rows.some((s) => s.code === code)) sphere = code;
    }

    // 3. извлечение по сегментам (промпт — дословно Python SYSTEM_EXTRACT)
    type RawCard = Record<string, unknown> & { _label: string };
    const extracted = await pMap(segments, EXTRACT_POOL, async (seg) => {
      const res = await dsChat(SYSTEM_EXTRACT, buildExtractUser(seg.label, seg.title, seg.text), 4000, usage);
      const reqs = Array.isArray(res.requirements) ? (res.requirements as Record<string, unknown>[]) : [];
      return reqs.filter((c) => norm(c.action, 400)).map((c) => ({ ...c, _label: seg.label }) as RawCard);
    });
    const rawCards = extracted.flat();

    // 4. валидация + классификация карточек (combo, критерии — канонические)
    await setStage(sub.id, "classify");
    const judged = await pMap(rawCards, CARD_POOL, async (c) => ({
      c,
      v: await dsChat(SYSTEM_CARD, buildCardUser(c as never, sphere, org?.name_ru || null), 600, usage),
    }));
    const confirmed = judged.filter(({ v }) => v.verdict === "confirm");

    // 5. запись + trgm-дедуп-флаг (полный семантический дедуп — регламентный bge-m3)
    await setStage(sub.id, "dedup");
    let inserted = 0;
    let suspects = 0;
    for (const { c, v } of confirmed) {
      const legal = norm(c.quote, 1000) || "";
      const subj = norm(c.subject, 200) || "";
      const act = norm(c.action, 400) || "";
      const suspectId = await checkDup(sub.ngr, act, legal);
      if (suspectId) suspects++;

      const stages = Array.isArray(c.stages) ? (c.stages as unknown[]).map(String).slice(0, 10) : [];
      const triggers = Array.isArray(v.triggers) ? (v.triggers as unknown[]).map(String).slice(0, 14) : [];
      await query(
        `INSERT INTO requirement_registry
           (submission_id, ngr, npa_title, article, authority_code, ministry, sphere_code,
            title, legal_text, subject, action, object, condition, evidence, stages,
            scope, triggers, is_permit, audience,
            action_type, time_hours, frequency_per_year, staff_role, external_cost_kzt,
            inspection_hours_biz, cost_estimate_source,
            audit_addr, audit_type, dup_suspect, dup_suspect_of,
            source, trust, review_status, npa_status, is_canonical)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                 $20,$21,$22,$23,$24,$25,'llm','business','requirement',$26,$27,
                 'submission','cloud_worker','pending','действующий',true)`,
        [sub.id, sub.ngr, npaTitle, (c._label as string).slice(0, 60), org?.code || null, org?.name_ru || null,
         sphere, `${subj.slice(0, 60)}: ${act.slice(0, 80)}`.replace(/^: /, ""), legal, subj, act,
         norm(c.object, 400), norm(c.condition, 600), norm(c.evidence, 300), stages,
         v.scope === "horizontal" || v.scope === "sectoral" ? v.scope : null,
         triggers, v.permit === true, v.audience === "specific" ? "specific" : "any",
         norm(v.action_type, 20), num(v.time_hours), num(v.frequency_per_year),
         norm(v.staff_role, 20), num(v.external_cost_kzt), num(v.inspection_hours_biz),
         suspectId ? true : null, suspectId]);
      inserted++;
    }

    await query(
      `UPDATE npa_submission SET status='parsed', stage=NULL, lease_until=NULL,
       cards_created=$2, processed_at=now(), npa_title=COALESCE(npa_title,$3), error=NULL WHERE id=$1`,
      [sub.id, inserted, npaTitle]);

    // затраты — только в серверный лог
    console.log(
      `[worker] подача ${sub.id} (${sub.ngr}): сегм=${segments.length}${capped ? "(cap)" : ""} ` +
      `сырых=${rawCards.length} confirm=${confirmed.length} записано=${inserted} подозрений-на-дубль=${suspects} ` +
      `за ${((Date.now() - t0) / 1000).toFixed(0)}с; llm: ${usage.calls} вызовов, ~$${usageCostUsd(usage).toFixed(4)}`);
    return true;
  } catch (e) {
    await fail(sub.id, attempt, (e as Error).message || String(e));
    return true;
  }
}
