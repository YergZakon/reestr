import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, getCurrentUserWithAccess, isMne } from "@/lib/auth";
import { zbody, ZanEventActionBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Правовой мониторинг по ЗАН — события «утратил силу» / «новая редакция».
 * GET  ?status=new|acked|processed|all&page= — события в скоупе пользователя
 *      (модератор — его органы, admin/mne — все) + дата последней сверки.
 * POST {event_id, action, note?}:
 *   ack / processed — смена статуса обработки;
 *   exclude_cards  — (repealed) живым карточкам НПА npa_status='утратил силу'
 *                    в пределах органа события; обратимо правкой поля;
 *   resubmit       — (amended) подача акта в очередь воркера (новая редакция).
 * Автодействий нет: правовое решение принимает орган (решение заказчика 2026-08-08).
 */

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") || "new";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = 20;

  const conds: string[] = [];
  const params: unknown[] = [];
  if (status !== "all") {
    params.push(status);
    conds.push(`e.status = $${params.length}`);
  }
  if (!isMne(user.role)) {
    params.push(user.assigned_authorities);
    // поддерево органов пользователя: коды организаций уже развёрнуты в assigned_authorities
    conds.push(`e.authority_code = ANY($${params.length}::text[])`);
  }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  params.push(limit, (page - 1) * limit);
  const items = await query(`
    SELECT e.id, e.ngr, e.authority_code, o.name_ru AS authority_name,
           e.event_type, e.npa_title, e.req_count, e.details, e.detected_at,
           e.status, e.status_note, u.username AS status_by_name, e.status_at,
           live.total AS live_total, live.confirmed AS live_confirmed,
           live.pending AS live_pending, live.rejected AS live_rejected
    FROM npa_zan_event e
    LEFT JOIN organizations o ON o.code = e.authority_code
    LEFT JOIN users u ON u.id = e.status_by
    -- сопоставление со стороны реестра: что СЕЙЧАС стоит на учёте по этому акту у органа
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE rr.review_status = 'confirmed')::int AS confirmed,
             count(*) FILTER (WHERE rr.review_status = 'pending')::int AS pending,
             count(*) FILTER (WHERE rr.review_status = 'rejected')::int AS rejected
      FROM requirement_registry rr
      WHERE rr.ngr = e.ngr AND rr.authority_code = e.authority_code
        AND NOT COALESCE(rr.excluded, false)
        AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')
    ) live ON true
    ${where}
    ORDER BY e.detected_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

  // счётчики по статусам в СКОУПЕ пользователя (для вкладок) + total текущего фильтра
  const scopeConds: string[] = [];
  const scopeParams: unknown[] = [];
  if (!isMne(user.role)) {
    scopeParams.push(user.assigned_authorities);
    scopeConds.push(`e.authority_code = ANY($${scopeParams.length}::text[])`);
  }
  const scopeWhere = scopeConds.length ? "WHERE " + scopeConds.join(" AND ") : "";
  const countsQ = await query(
    `SELECT e.status, count(*)::int AS n FROM npa_zan_event e ${scopeWhere} GROUP BY e.status`,
    scopeParams);
  const counts: Record<string, number> = {};
  for (const r of countsQ.rows) counts[r.status as string] = Number(r.n);
  const total = status === "all"
    ? Object.values(counts).reduce((a, b) => a + b, 0)
    : (counts[status] || 0);

  const meta = await query(`SELECT max(checked_at) AS last_check FROM npa_zan_status`);
  return NextResponse.json({
    items: items.rows, page, total, pages: Math.max(1, Math.ceil(total / limit)),
    counts,
    last_check: meta.rows[0]?.last_check || null,
    total_new: counts["new"] || 0,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (!isMne(user.role) && user.role !== "moderator")
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });

  const v = await zbody(req, ZanEventActionBody);
  if (!v.ok) return v.res;
  const { event_id, action, note } = v.data;

  const ev = (await query(`SELECT * FROM npa_zan_event WHERE id = $1`, [event_id])).rows[0];
  if (!ev) return NextResponse.json({ error: "Событие не найдено" }, { status: 404 });

  // скоуп модератора: орган события должен входить в его поддерево
  if (!isMne(user.role)) {
    const acc = await getCurrentUserWithAccess();
    if (!acc?.assigned_authorities.includes(ev.authority_code as string))
      return NextResponse.json({ error: "Событие другого органа" }, { status: 403 });
  }

  if (action === "ack" || action === "processed") {
    await query(`UPDATE npa_zan_event SET status=$1, status_by=$2, status_at=now(), status_note=$3 WHERE id=$4`,
      [action === "ack" ? "acked" : "processed", user.id, note || null, event_id]);
    return NextResponse.json({ ok: true });
  }

  if (action === "exclude_cards") {
    if (ev.event_type !== "repealed")
      return NextResponse.json({ error: "Исключение — только для событий утраты силы" }, { status: 400 });
    const upd = await query(`
      UPDATE requirement_registry SET npa_status = 'утратил силу'
      WHERE ngr = $1 AND authority_code = $2
        AND NOT COALESCE(excluded, false)
        AND (npa_status IS NULL OR npa_status <> 'утратил силу')`,
      [ev.ngr, ev.authority_code]);
    await query(`UPDATE npa_zan_event SET status='processed', status_by=$1, status_at=now(),
                 status_note=$2 WHERE id=$3`,
      [user.id, `утратил силу: снято с учёта ${upd.rowCount} карточек`, event_id]);
    await query(`INSERT INTO activity_log (user_id, action, details) VALUES ($1,'zan_exclude',$2)`,
      [user.id, JSON.stringify({ ngr: ev.ngr, authority: ev.authority_code, cards: upd.rowCount })]).catch(() => {});
    return NextResponse.json({ ok: true, cards: upd.rowCount });
  }

  if (action === "resubmit") {
    const org = (await query(`SELECT id FROM organizations WHERE code=$1 AND active`, [ev.authority_code])).rows[0];
    if (!org) return NextResponse.json({ error: "Орган события не найден в справочнике" }, { status: 404 });
    const ins = await query(`
      INSERT INTO npa_submission (ngr, npa_title, org_id, submitted_by, status)
      VALUES ($1,$2,$3,$4,'submitted') RETURNING id`,
      [ev.ngr, ev.npa_title, org.id, user.id]);
    await query(`UPDATE npa_zan_event SET status='processed', status_by=$1, status_at=now(),
                 status_note=$2 WHERE id=$3`,
      [user.id, `переподан на извлечение (подача #${ins.rows[0].id})`, event_id]);
    await query(`INSERT INTO activity_log (user_id, action, details) VALUES ($1,'zan_resubmit',$2)`,
      [user.id, JSON.stringify({ ngr: ev.ngr, submission_id: ins.rows[0].id })]).catch(() => {});
    return NextResponse.json({ ok: true, submission_id: ins.rows[0].id });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
