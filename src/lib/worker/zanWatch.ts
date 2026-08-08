// Правовой мониторинг по ЗАН: суточная сверка НПА реестра с Mongo-репликой adilet.
// Детект: «утратил силу» (st='yts' ИЛИ сноска в шапке) и «новая редакция»
// (рост dl И смена hash нормализованного текста; пере-импорт того же текста — не событие).
// Автодействий с карточками НЕТ (решение заказчика): события npa_zan_event по паре
// (ngr × орган) + notifications модераторам; исключение/переподача — кнопками в UI.
// Снапшот-сравнение вместо дельта-курсора: поле dp реплики ненадёжно, а наших ngr ~2.3k.
import { gunzipSync } from "zlib";
import { createHash } from "crypto";
import { MongoClient, Binary, ObjectId } from "mongodb";
import { query } from "@/lib/db";

const BATCH = 500;
// Канон mark_repealed.py: «Утратил силу <актом>» в статус-плашке (первые ~700
// симв. чистого текста). Простое вхождение «утратил силу» в шапке ловит сноски
// о ДРУГИХ актах (техрегламенты ТС) — 215 ложных на baseline 2026-08-08.
const LOST_RE = /Утративший силу|Утратил[аио]? силу (?:приказом|постановлением|Закон|указом|решением|совместн)/;

interface ZanMeta {
  ngr: string;
  st: string | null;
  actual: boolean;
  dl: Date | null;
  zg: string | null;
  _id: ObjectId;
}

interface SnapRow {
  ngr: string;
  zan_st: string | null;
  zan_dl: string | null;
  text_hash: string | null;
  lost_marker: boolean;
  missing: boolean;
}

function normTextKeepCase(html: string): string {
  return html
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

let inFlight = false;

export async function zanWatchTick(): Promise<void> {
  if (inFlight) return;
  const uri = process.env.ZAN_MONGO_URI;
  if (!uri) {
    console.log("[zan] ZAN_MONGO_URI не задан — мониторинг ЗАН выключен");
    return;
  }
  inFlight = true;
  const t0 = Date.now();
  const cli = new MongoClient(uri, { serverSelectionTimeoutMS: 20_000 });
  try {
    // 1. НПА реестра: все ngr (снапшот) + живые карточки по органам (события)
    const ngrRows = await query(
      `SELECT DISTINCT ngr FROM requirement_registry WHERE ngr IS NOT NULL AND ngr <> ''`);
    const ngrs: string[] = ngrRows.rows.map((r) => r.ngr as string);
    const liveRows = await query(`
      SELECT ngr, authority_code, count(*)::int AS cnt, max(npa_title) AS title,
             count(*) FILTER (WHERE review_status = 'confirmed')::int AS confirmed,
             count(*) FILTER (WHERE review_status = 'pending')::int AS pending,
             count(*) FILTER (WHERE review_status = 'rejected')::int AS rejected
      FROM requirement_registry
      WHERE ngr IS NOT NULL AND NOT COALESCE(excluded, false)
        AND (npa_status IS NULL OR npa_status <> 'утратил силу')
      GROUP BY 1, 2`);
    const liveByNgr = new Map<string, { auth: string; cnt: number; title: string;
      confirmed: number; pending: number; rejected: number }[]>();
    for (const r of liveRows.rows) {
      if (!r.authority_code) continue;
      const arr = liveByNgr.get(r.ngr as string) || [];
      arr.push({ auth: r.authority_code as string, cnt: r.cnt as number,
        title: (r.title as string) || "", confirmed: r.confirmed as number,
        pending: r.pending as number, rejected: r.rejected as number });
      liveByNgr.set(r.ngr as string, arr);
    }

    // resolve-фаза: событие — зеркало РАСХОЖДЕНИЯ ЗАН↔реестр (решение заказчика
    // 2026-08-08). Гэп устранён любым путём (кнопка, ревью, чистка) → событие
    // закрывается само; «просто утратившие силу» без живых карточек не висят.
    const resolved = await query(`
      UPDATE npa_zan_event e
      SET status = 'processed', status_at = now(),
          status_note = 'расхождение устранено в реестре (живых карточек не осталось)'
      WHERE e.status IN ('new', 'acked') AND e.event_type = 'repealed'
        AND NOT EXISTS (
          SELECT 1 FROM requirement_registry rr
          WHERE rr.ngr = e.ngr AND rr.authority_code = e.authority_code
            AND NOT COALESCE(rr.excluded, false)
            AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу'))`);
    if (resolved.rowCount) console.log(`[zan] авто-закрыто событий (гэп устранён): ${resolved.rowCount}`);

    // 2. снапшот
    const snapRows = await query(`SELECT ngr, zan_st, zan_dl::text, text_hash, lost_marker, missing FROM npa_zan_status`);
    const snap = new Map<string, SnapRow>();
    for (const r of snapRows.rows) snap.set(r.ngr as string, r as unknown as SnapRow);
    const baseline = snap.size === 0;

    // 3. лучшая rus-редакция по каждому ngr
    await cli.connect();
    const db = cli.db(process.env.ZAN_DB_NAME || "zan");
    const best = new Map<string, ZanMeta>();
    for (let i = 0; i < ngrs.length; i += BATCH) {
      const docs = await db.collection("doc_meta")
        .find({ ngr: { $in: ngrs.slice(i, i + BATCH) }, lg: "rus" })
        .project({ ngr: 1, st: 1, actual: 1, dl: 1, zg: 1 })
        .toArray();
      for (const d of docs as unknown as ZanMeta[]) {
        const cur = best.get(d.ngr);
        const key = (x: ZanMeta) => [x.actual ? 1 : 0, x.dl ? x.dl.getTime() : 0];
        if (!cur || key(d) > key(cur) ||
            (key(d)[0] === key(cur)[0] && key(d)[1] > key(cur)[1])) best.set(d.ngr, d);
      }
    }

    // 4. диф + события
    let events = 0, reimports = 0, texts = 0;
    for (const ngr of ngrs) {
      const m = best.get(ngr);
      const s = snap.get(ngr);
      if (!m) {
        await upsertSnap({ ngr, st: null, actual: null, dl: null, hash: s?.text_hash || null,
          lost: s?.lost_marker || false, title: null, missing: true, changed: !s || !s.missing });
        continue;
      }
      const dlChanged = !s || ymd(m.dl) !== (s.zan_dl || "");
      const stChanged = !s || (m.st || "") !== (s.zan_st || "");
      let hash = s?.text_hash || null;
      let lost = s?.lost_marker || false;
      if (!s || dlChanged || stChanged || !hash) {
        const dd = await db.collection("doc_data").findOne({ _id: m._id });
        const bin = dd?.compressedText as Binary | undefined;
        if (bin) {
          try {
            const html = gunzipSync(Buffer.from(bin.buffer)).toString("utf-8");
            const clean = normTextKeepCase(html);
            hash = createHash("md5").update(clean.toLowerCase()).digest("hex");
            lost = LOST_RE.test(clean.slice(0, 700));
            texts++;
          } catch { /* битый gzip — оставляем прежний hash */ }
        }
      }

      const live = liveByNgr.get(ngr) || [];
      const isRepealedNow = m.st === "yts" || lost;
      const wasRepealed = s ? (s.zan_st === "yts" || s.lost_marker) : false;
      const hashChanged = s && s.text_hash && hash && s.text_hash !== hash;

      if (live.length) {
        // repealed: сигналим и в baseline (утративший акт с живыми карточками)
        if (isRepealedNow && !wasRepealed) {
          for (const l of live) {
            events += await emitEvent("repealed", ngr, l, m,
              `repealed:${l.auth}:${ngr}`,
              { old_st: s?.zan_st || null, new_st: m.st, signal: m.st === "yts" ? "st" : "text_marker" });
          }
        } else if (!baseline && s && dlChanged && hashChanged && !isRepealedNow) {
          for (const l of live) {
            events += await emitEvent("amended", ngr, l, m,
              `amended:${l.auth}:${ngr}:${ymd(m.dl).replace(/-/g, "")}`,
              { old_dl: s.zan_dl, new_dl: ymd(m.dl), signal: "hash" });
          }
        } else if (!baseline && s && dlChanged && !hashChanged) {
          reimports++;
        }
      }

      await upsertSnap({ ngr, st: m.st, actual: m.actual, dl: m.dl, hash, lost,
        title: (m.zg || "").slice(0, 300), missing: false,
        changed: !s || dlChanged || stChanged });
    }

    await query(`INSERT INTO activity_log (user_id, action, details) VALUES (NULL, 'zan_watch', $1)`,
      [JSON.stringify({ scanned: ngrs.length, events, reimports, texts_fetched: texts,
        baseline, took_s: Math.round((Date.now() - t0) / 1000) })]).catch(() => {});
    console.log(`[zan] сверка: ${ngrs.length} НПА, событий ${events}, пере-импортов ${reimports}, ` +
      `текстов ${texts}, baseline=${baseline}, ${(Date.now() - t0) / 1000 | 0}с`);
  } catch (e) {
    console.error("[zan] тик упал:", (e as Error).message);
  } finally {
    inFlight = false;
    await cli.close().catch(() => {});
  }
}

async function emitEvent(
  type: "repealed" | "amended", ngr: string,
  l: { auth: string; cnt: number; title: string; confirmed?: number; pending?: number; rejected?: number },
  m: ZanMeta, dedup: string, details: Record<string, unknown>,
): Promise<number> {
  const title = (m.zg || l.title || ngr).slice(0, 300);
  const full = { ...details, confirmed: l.confirmed ?? 0, pending: l.pending ?? 0, rejected: l.rejected ?? 0 };
  const ins = await query(`
    INSERT INTO npa_zan_event (ngr, authority_code, event_type, dedup_key, npa_title, req_count, details)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (dedup_key) DO NOTHING RETURNING id`,
    [ngr, l.auth, type, dedup, title, l.cnt, JSON.stringify(full)]);
  if (!ins.rows.length) return 0;
  const notifTitle = type === "repealed"
    ? `НПА утратил силу (по базе ЗАН): ${title.slice(0, 150)}`
    : `Новая редакция НПА от ${details.new_dl}: ${title.slice(0, 150)}`;
  await query(`
    INSERT INTO notifications (authority_code, type, dedup_key, title, payload)
    VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (dedup_key) DO NOTHING`,
    [l.auth, type === "repealed" ? "npa_repealed" : "npa_amended", `zan:${dedup}`, notifTitle,
     JSON.stringify({ ngr, req_count: l.cnt, ...details })]).catch(() => {});
  return 1;
}

async function upsertSnap(s: { ngr: string; st: string | null; actual: boolean | null;
  dl: Date | null; hash: string | null; lost: boolean; title: string | null;
  missing: boolean; changed: boolean }): Promise<void> {
  await query(`
    INSERT INTO npa_zan_status (ngr, zan_st, zan_actual, zan_dl, text_hash, lost_marker,
                                zan_title, missing, checked_at, changed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), CASE WHEN $9 THEN now() ELSE NULL END)
    ON CONFLICT (ngr) DO UPDATE SET
      zan_st = EXCLUDED.zan_st, zan_actual = EXCLUDED.zan_actual, zan_dl = EXCLUDED.zan_dl,
      text_hash = COALESCE(EXCLUDED.text_hash, npa_zan_status.text_hash),
      lost_marker = EXCLUDED.lost_marker,
      zan_title = COALESCE(EXCLUDED.zan_title, npa_zan_status.zan_title),
      missing = EXCLUDED.missing, checked_at = now(),
      changed_at = CASE WHEN $9 THEN now() ELSE npa_zan_status.changed_at END`,
    [s.ngr, s.st, s.actual, s.dl ? ymd(s.dl) : null, s.hash, s.lost, s.title, s.missing, s.changed]);
}
