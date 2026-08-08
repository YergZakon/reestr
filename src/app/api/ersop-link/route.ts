import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { getCurrentUserWithAccess } from "@/lib/auth";
import { zbody, ErsopLinkBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Сшивка ЕРСОП↔НПА: правовое основание ЕРСОП-карточки (решения заказчика 2026-08-04).
 *
 * GET  ?card_id=<ersop_card_id> — активная связь карточки: статус (auto/proposed/
 *      accepted), предлагаемое основание (НПА-карточка: титул, ngr, статья, текст),
 *      уверенность и найденные различия (подсказка скептика).
 * POST {link_id, action: accept|reject, reason?} — решение по proposed-паре.
 *      accept (в одной транзакции): основание → ЕРСОП-карточка, наследование
 *      ревью, НПА-сторона excluded, JSONB-снимок для отката; reject — отказ.
 * Доступ: admin; expert — только в скоупе органа ЕРСОП-карточки.
 */

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const cardId = parseInt(new URL(req.url).searchParams.get("card_id") || "0", 10);
  if (!cardId) return NextResponse.json({ error: "card_id обязателен" }, { status: 400 });

  const r = await query(
    `SELECT l.id, l.status, l.cosine, l.llm_verdict, l.llm_confidence, l.reason,
            l.applied_at, l.article AS link_article,
            n.id AS npa_id, n.ngr, n.npa_title, n.article,
            COALESCE(n.canon_text, n.legal_text) AS npa_text, n.review_status AS npa_review
     FROM ersop_npa_link l
     JOIN requirement_registry n ON n.id = l.npa_card_id
     WHERE l.ersop_card_id = $1 AND l.status IN ('auto','proposed','accepted')
     ORDER BY (l.status='accepted') DESC, (l.status='auto') DESC, l.llm_confidence DESC NULLS LAST
     LIMIT 1`, [cardId]);
  return NextResponse.json({ link: r.rows[0] || null });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "expert")
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  const vb = await zbody(req, ErsopLinkBody);
  if (!vb.ok) return vb.res;
  const { link_id, action, reason } = vb.data;

  const l = (await query(
    `SELECT l.*, e.authority_code AS e_auth FROM ersop_npa_link l
     JOIN requirement_registry e ON e.id = l.ersop_card_id
     WHERE l.id = $1 AND l.status = 'proposed'`, [link_id])).rows[0];
  if (!l) return NextResponse.json({ error: "Связь не найдена или уже решена" }, { status: 404 });
  if (user.role !== "admin" && !user.assigned_authorities.includes(l.e_auth as string))
    return NextResponse.json({ error: "Карточка вне вашего органа" }, { status: 403 });

  if (action === "reject") {
    await query(
      `UPDATE ersop_npa_link SET status='rejected', decided_by=$1, decided_at=now(), reason=COALESCE($2, reason)
       WHERE id=$3 AND status='proposed'`, [user.id, reason || null, link_id]);
    await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'ersop_link_reject',$2)",
      [user.id, JSON.stringify({ link_id })]).catch(() => {});
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // accept — зеркало apply_ersop_link.py, в одной транзакции
  const cl = await pool.connect();
  try {
    await cl.query("BEGIN");
    const e = (await cl.query(
      `SELECT ngr, npa_title, article, norm_url, ersop_confirmed,
              review_status, reviewed_by, reviewed_at, ara_deadline, review_comment
       FROM requirement_registry WHERE id=$1 FOR UPDATE`, [l.ersop_card_id])).rows[0];
    const n = (await cl.query(
      `SELECT ngr, npa_title, article, excluded, excluded_reason, excluded_at, excluded_by,
              review_status, reviewed_by, reviewed_at, ara_deadline
       FROM requirement_registry WHERE id=$1 FOR UPDATE`, [l.npa_card_id])).rows[0];
    if (!e || !n) throw new Error("карточка пары не найдена");

    const rollback = { ersop: e, npa: { excluded: n.excluded, excluded_reason: n.excluded_reason, excluded_at: n.excluded_at, excluded_by: n.excluded_by } };

    await cl.query(
      `UPDATE requirement_registry
       SET ngr=$1, npa_title=$2, article=$3, norm_url=$4, ersop_confirmed=true
       WHERE id=$5`,
      [n.ngr, n.npa_title, l.article || n.article,
       n.ngr ? `https://adilet.zan.kz/rus/docs/${n.ngr}` : null, l.ersop_card_id]);
    if (["confirmed", "edited"].includes(n.review_status) && (!e.review_status || e.review_status === "pending")) {
      await cl.query(
        `UPDATE requirement_registry
         SET review_status='confirmed', reviewed_by=$1, reviewed_at=$2, ara_deadline=$3,
             review_comment=$4 WHERE id=$5`,
        [n.reviewed_by, n.reviewed_at, n.ara_deadline,
         `унаследовано при сшивке от #${l.npa_card_id}`, l.ersop_card_id]);
    }
    await cl.query(
      `UPDATE requirement_registry
       SET excluded=true, excluded_reason=$1, excluded_at=now(), excluded_by=$2 WHERE id=$3`,
      [`Сшито с ЕРСОП-требованием #${l.ersop_card_id} (link ${link_id})`, user.id, l.npa_card_id]);
    await cl.query(
      `UPDATE ersop_npa_link
       SET status='accepted', decided_by=$1, decided_at=now(), applied_at=now(), rollback=$2
       WHERE id=$3`, [user.id, JSON.stringify(rollback), link_id]);
    await cl.query(
      `INSERT INTO registry_edits (registry_id, user_id, action, field, old_value, new_value, comment)
       VALUES ($1,$2,'ersop_link','ngr',$3,$4,$5)`,
      [l.ersop_card_id, user.id, e.ngr, n.ngr, `сшивка принята органом, link=${link_id}`]);
    await cl.query("COMMIT");
  } catch (err) {
    await cl.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { error: "Не удалось применить", detail: String((err as Error).message).slice(0, 150) }, { status: 500 });
  } finally {
    cl.release();
  }
  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'ersop_link_accept',$2)",
    [user.id, JSON.stringify({ link_id })]).catch(() => {});
  return NextResponse.json({ ok: true, status: "accepted" });
}
