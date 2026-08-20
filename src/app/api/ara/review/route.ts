import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { getCurrentUserWithAccess, isMne } from "@/lib/auth";
import { zbody, AraReviewBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/ara/review — статус-машина цикла пересмотра АРА (план 2026-08-20):
 *   open {ara_id}                     — модератор органа / МНЭ; один живой цикл на акт;
 *   assign {review_id, analyst_ids…}  — поручения аналитикам + адресные уведомления;
 *   accept {review_id}                — адресат поручения; цикл → in_progress;
 *   conclude {review_id, conclusion…} — исполнитель или модератор; цикл → concluded;
 *   approve {review_id, apply_cards?} — модератор/МНЭ; авто-срок +3 (code/law) / +2 (bylaw)
 *                                       от даты утверждения, deadline_src='cycle';
 *   return {review_id, note?}         — МНЭ на любом шаге, модератор — с concluded;
 *   cancel {review_id}                — модератор/МНЭ, цикл и поручения → cancelled.
 * Автодействий по карточкам нет, кроме явного apply_cards при approve.
 */

interface Act { id: number; ngr: string | null; authority_code: string | null; npa_kind: string; deadline: string | null; npa_title: string | null }

async function notify(authority: string | null, userId: number | null, type: string, dedup: string, title: string, payload: object) {
  await query(
    `INSERT INTO notifications (authority_code, type, dedup_key, title, payload, user_id)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (dedup_key) DO NOTHING`,
    [authority, type, dedup, title, JSON.stringify(payload), userId]);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const vb = await zbody(req, AraReviewBody);
  if (!vb.ok) return vb.res;
  const b = vb.data;
  const mne = isMne(user.role);

  // акт + живой цикл
  let act: Act | null = null;
  let rev: { id: number; status: string; conclusion: string | null } | null = null;
  if (b.action === "open") {
    if (!b.ara_id) return NextResponse.json({ error: "ara_id обязателен" }, { status: 400 });
    const r = await query("SELECT id, ngr, authority_code, npa_kind, deadline, npa_title FROM npa_ara WHERE id = $1", [b.ara_id]);
    if (!r.rows.length) return NextResponse.json({ error: "Акт не найден" }, { status: 404 });
    act = r.rows[0];
  } else {
    if (!b.review_id) return NextResponse.json({ error: "review_id обязателен" }, { status: 400 });
    const r = await query(
      `SELECT rev.id AS rid, rev.status, rev.conclusion, a.id, a.ngr, a.authority_code, a.npa_kind, a.deadline, a.npa_title
       FROM ara_review rev JOIN npa_ara a ON a.id = rev.ara_id WHERE rev.id = $1`, [b.review_id]);
    if (!r.rows.length) return NextResponse.json({ error: "Цикл не найден" }, { status: 404 });
    const row = r.rows[0];
    rev = { id: row.rid, status: row.status, conclusion: row.conclusion };
    act = { id: row.id, ngr: row.ngr, authority_code: row.authority_code, npa_kind: row.npa_kind, deadline: row.deadline, npa_title: row.npa_title };
  }
  const canManage = mne || (user.role === "moderator" && act!.authority_code != null
    && user.assigned_authorities.includes(act!.authority_code));
  const title = (act!.npa_title || act!.ngr || "акт").slice(0, 120);

  switch (b.action) {
    case "open": {
      if (!canManage) return NextResponse.json({ error: "Открывает цикл модератор органа или МНЭ" }, { status: 403 });
      try {
        const r = await query(
          `INSERT INTO ara_review (ara_id, deadline_snapshot, opened_by) VALUES ($1,$2,$3) RETURNING id`,
          [act!.id, act!.deadline, user.id]);
        return NextResponse.json({ ok: true, review_id: r.rows[0].id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("ara_review_active"))
          return NextResponse.json({ error: "По акту уже открыт цикл" }, { status: 409 });
        throw e;
      }
    }

    case "assign": {
      if (!canManage) return NextResponse.json({ error: "Поручает модератор органа или МНЭ" }, { status: 403 });
      if (!b.analyst_ids?.length) return NextResponse.json({ error: "analyst_ids обязательны" }, { status: 400 });
      if (!["open", "assigned", "in_progress"].includes(rev!.status))
        return NextResponse.json({ error: `Нельзя поручать в статусе «${rev!.status}»` }, { status: 409 });
      // адресат — активный аналитик, чей скоуп покрывает орган акта
      const ok = await query(
        `WITH RECURSIVE org_users AS (
           SELECT uo.user_id, o.id, o.code FROM user_orgs uo JOIN organizations o ON o.id = uo.org_id
           UNION
           SELECT ou.user_id, c.id, c.code FROM organizations c JOIN org_users ou ON c.parent_id = ou.id)
         SELECT u.id FROM users u
         WHERE u.id = ANY($1::int[]) AND u.is_active AND u.role = 'expert' AND (
           EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = u.id AND ua.authority_code = $2)
           OR EXISTS (SELECT 1 FROM org_users ou WHERE ou.user_id = u.id AND ou.code = $2))`,
        [b.analyst_ids, act!.authority_code]);
      const valid: number[] = ok.rows.map((x) => x.id);
      if (!valid.length) return NextResponse.json({ error: "Ни один адресат не является аналитиком этого органа" }, { status: 400 });
      let added = 0;
      for (const uid of valid) {
        const r = await query(
          `INSERT INTO ara_assignment (review_id, assignee_id, assigned_by, note, due_date)
           SELECT $1,$2,$3,$4,$5
           WHERE NOT EXISTS (SELECT 1 FROM ara_assignment
             WHERE review_id = $1 AND assignee_id = $2 AND status IN ('assigned','accepted'))`,
          [rev!.id, uid, user.id, b.note ?? null, b.due_date ?? null]);
        if (r.rowCount) {
          added++;
          await notify(act!.authority_code, uid, "ara_assigned", `ara_assigned:${rev!.id}:${uid}`,
            `Поручение АРА: ${title}`, { review_id: rev!.id, ngr: act!.ngr, due_date: b.due_date ?? null, note: b.note ?? null });
        }
      }
      if (rev!.status === "open")
        await query("UPDATE ara_review SET status='assigned' WHERE id=$1 AND status='open'", [rev!.id]);
      return NextResponse.json({ ok: true, assigned: added, skipped: b.analyst_ids.length - added });
    }

    case "accept": {
      const r = await query(
        `UPDATE ara_assignment SET status='accepted', status_at=now()
         WHERE review_id=$1 AND assignee_id=$2 AND status='assigned'`, [rev!.id, user.id]);
      if (!r.rowCount) return NextResponse.json({ error: "Нет ожидающего поручения" }, { status: 404 });
      await query("UPDATE ara_review SET status='in_progress' WHERE id=$1 AND status IN ('open','assigned')", [rev!.id]);
      return NextResponse.json({ ok: true });
    }

    case "conclude": {
      if (!b.conclusion) return NextResponse.json({ error: "conclusion обязателен (revise|keep)" }, { status: 400 });
      const mine = await query(
        `SELECT 1 FROM ara_assignment WHERE review_id=$1 AND assignee_id=$2 AND status IN ('assigned','accepted')`,
        [rev!.id, user.id]);
      if (!mine.rows.length && !canManage)
        return NextResponse.json({ error: "Заключение даёт исполнитель поручения или модератор" }, { status: 403 });
      if (!["open", "assigned", "in_progress"].includes(rev!.status))
        return NextResponse.json({ error: `Нельзя заключить в статусе «${rev!.status}»` }, { status: 409 });
      await query(
        `UPDATE ara_review SET status='concluded', conclusion=$2, rationale=$3, proposals=$4,
           concluded_by=$5, concluded_at=now() WHERE id=$1`,
        [rev!.id, b.conclusion, b.rationale ?? null, b.proposals ?? null, user.id]);
      await query(
        `UPDATE ara_assignment SET status='done', status_at=now()
         WHERE review_id=$1 AND assignee_id=$2 AND status IN ('assigned','accepted')`, [rev!.id, user.id]);
      await notify(act!.authority_code, null, "ara_concluded", `ara_concluded:${rev!.id}`,
        `Заключение АРА (${b.conclusion === "revise" ? "пересмотреть" : "оставить"}): ${title}`,
        { review_id: rev!.id, ngr: act!.ngr, conclusion: b.conclusion });
      return NextResponse.json({ ok: true });
    }

    case "approve": {
      if (!canManage) return NextResponse.json({ error: "Утверждает модератор органа или МНЭ" }, { status: 403 });
      if (rev!.status !== "concluded")
        return NextResponse.json({ error: "Утверждать можно только заключённый цикл" }, { status: 409 });
      const years = act!.npa_kind === "bylaw" ? 2 : 3; // законы/кодексы +3, подзаконка +2
      const client = await pool.connect();
      let newDeadline = "";
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE ara_review SET status='approved', approved_by=$2, approved_at=now(), approve_note=$3 WHERE id=$1`,
          [rev!.id, user.id, b.note ?? null]);
        const nd = await client.query(
          `UPDATE npa_ara SET deadline = current_date + make_interval(years => $2),
             deadline_src='cycle', updated_at=now(), updated_by=$3
           WHERE id=$1 RETURNING deadline::text`, [act!.id, years, user.id]);
        newDeadline = nd.rows[0].deadline;
        await client.query(
          `UPDATE ara_assignment SET status='done', status_at=now()
           WHERE review_id=$1 AND status IN ('assigned','accepted')`, [rev!.id]);
        // опциональные массовые действия по карточкам акта в скоупе органа
        if (b.apply_cards === "confirm" && act!.ngr) {
          await client.query(
            `UPDATE requirement_registry SET review_status='confirmed', reviewed_by=$3, reviewed_at=now(), ara_deadline=$4
             WHERE ngr=$1 AND authority_code=$2 AND review_status='pending'
               AND NOT COALESCE(excluded,false) AND (npa_status IS NULL OR npa_status <> 'утратил силу')`,
            [act!.ngr, act!.authority_code, user.id, newDeadline]);
          await client.query(
            `UPDATE requirement_registry SET ara_deadline=$3
             WHERE ngr=$1 AND authority_code=$2 AND review_status='confirmed'
               AND NOT COALESCE(excluded,false) AND (npa_status IS NULL OR npa_status <> 'утратил силу')`,
            [act!.ngr, act!.authority_code, newDeadline]);
        } else if (b.apply_cards === "exclude" && act!.ngr) {
          await client.query(
            `UPDATE requirement_registry SET excluded=true, ara_status='исключён'
             WHERE ngr=$1 AND authority_code=$2 AND NOT COALESCE(excluded,false)`,
            [act!.ngr, act!.authority_code]);
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      const assignees = await query(
        `SELECT DISTINCT assignee_id FROM ara_assignment WHERE review_id=$1 AND status='done'`, [rev!.id]);
      for (const a of assignees.rows)
        await notify(act!.authority_code, a.assignee_id, "ara_approved", `ara_approved:${rev!.id}:${a.assignee_id}`,
          `Заключение АРА утверждено: ${title}`, { review_id: rev!.id, ngr: act!.ngr, new_deadline: newDeadline });
      return NextResponse.json({ ok: true, new_deadline: newDeadline });
    }

    case "return": {
      const may = mne || (canManage && rev!.status === "concluded");
      if (!may) return NextResponse.json({ error: "Возврат: МНЭ — на любом шаге, модератор — с заключения" }, { status: 403 });
      if (["approved", "cancelled"].includes(rev!.status))
        return NextResponse.json({ error: "Цикл уже закрыт" }, { status: 409 });
      await query(
        `UPDATE ara_review SET status='in_progress', approve_note=$2 WHERE id=$1`,
        [rev!.id, b.note ? `Возврат: ${b.note}` : "Возвращено на доработку"]);
      await notify(act!.authority_code, null, "ara_returned", `ara_returned:${rev!.id}:${Date.now()}`,
        `Цикл АРА возвращён на доработку: ${title}`, { review_id: rev!.id, ngr: act!.ngr, note: b.note ?? null });
      return NextResponse.json({ ok: true });
    }

    case "cancel": {
      if (!canManage) return NextResponse.json({ error: "Отменяет модератор органа или МНЭ" }, { status: 403 });
      if (["approved", "cancelled"].includes(rev!.status))
        return NextResponse.json({ error: "Цикл уже закрыт" }, { status: 409 });
      await query("UPDATE ara_review SET status='cancelled' WHERE id=$1", [rev!.id]);
      await query(
        `UPDATE ara_assignment SET status='cancelled', status_at=now(), cancelled_by=$2
         WHERE review_id=$1 AND status IN ('assigned','accepted')`, [rev!.id, user.id]);
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
