import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { getCurrentUser, isMne } from "@/lib/auth";
import { zbody, NpaAdminBody, escapeLike } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Админ-управление НПА (только admin/МНЭ). Отличия от /api/npa-assignment:
 * перенос разрешён в ЛЮБОЙ активный орган (межминистерский), гранулярность —
 * весь НПА или выбранные статьи (метки rr.article), плюс исключение/возврат.
 *
 * GET  ?org_id=&q=&page=          — НПА выбранного корневого ГО: подразделение
 *                                   (путь), счётчики, активные назначения.
 * GET  ?ngr=...&articles=1        — статьи одного НПА: метка, нормы, орган, исключено.
 * POST {action:'transfer', ngr, target_org_id, articles?, reason?}
 * POST {action:'exclude'|'restore', ngr, articles?, reason}
 *
 * Ревью-статусы карточек при переносе сохраняются; ministry пересчитывает
 * триггер миграции 030. Кнопки «отменить» нет — историю хранит журнал,
 * исправление = новый перенос.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { err: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  if (!isMne(user.role))
    return { err: NextResponse.json({ error: "Только для администратора МНЭ" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const m = await requireAdmin();
  if (m.err) return m.err;
  const sp = new URL(req.url).searchParams;

  // — статьи одного НПА
  const ngr = sp.get("ngr");
  if (ngr && sp.get("articles")) {
    const r = await query(
      `SELECT COALESCE(rr.article,'—') AS article, count(*)::int AS reqs,
              count(*) FILTER (WHERE NOT COALESCE(rr.excluded,false))::int AS live,
              count(*) FILTER (WHERE COALESCE(rr.excluded,false))::int AS excluded,
              max(rr.authority_code) AS authority_code, max(o.name_ru) AS authority_name
       FROM requirement_registry rr
       LEFT JOIN organizations o ON o.code = rr.authority_code
       WHERE rr.ngr = $1 AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')
       GROUP BY COALESCE(rr.article,'—')
       ORDER BY min(rr.id)`, [ngr]);
    return NextResponse.json({ ngr, articles: r.rows });
  }

  // — список НПА органа
  const orgId = parseInt(sp.get("org_id") || "0", 10);
  if (!orgId) return NextResponse.json({ error: "org_id обязателен" }, { status: 400 });
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = 20;
  const q = (sp.get("q") || "").trim();

  const params: unknown[] = [orgId];
  let qCond = "";
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    qCond = `AND (rr.npa_title ILIKE $${params.length} OR rr.ngr ILIKE $${params.length})`;
  }
  params.push(limit);
  const lp = params.length;
  params.push((page - 1) * limit);
  const op = params.length;

  const items = await query(
    `WITH RECURSIVE org_sub AS (
       SELECT id, code, name_ru, ''::text AS unit_path FROM organizations WHERE id = $1
       UNION ALL
       SELECT c.id, c.code, c.name_ru,
              CASE WHEN s.unit_path = '' THEN c.name_ru ELSE s.unit_path || ' / ' || c.name_ru END
       FROM organizations c JOIN org_sub s ON c.parent_id = s.id)
     SELECT rr.ngr, max(rr.npa_title) AS npa_title,
            max(s.unit_path) AS unit_path,
            count(DISTINCT COALESCE(rr.article,'—'))::int AS articles_cnt,
            count(*) FILTER (WHERE NOT COALESCE(rr.excluded,false))::int AS reqs,
            count(*) FILTER (WHERE rr.review_status='confirmed' AND NOT COALESCE(rr.excluded,false))::int AS confirmed,
            count(*) FILTER (WHERE rr.review_status='pending' AND NOT COALESCE(rr.excluded,false))::int AS pending,
            count(*) FILTER (WHERE COALESCE(rr.excluded,false))::int AS excluded_cnt,
            (SELECT json_agg(json_build_object('org', ao.name_ru, 'articles', a.articles))
               FROM npa_assignment a JOIN organizations ao ON ao.id = a.org_id
              WHERE a.ngr = rr.ngr AND a.status = 'назначено') AS assignments
     FROM requirement_registry rr
     JOIN org_sub s ON s.code = rr.authority_code
     WHERE (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')
       AND rr.ngr IS NOT NULL ${qCond}
     GROUP BY rr.ngr
     ORDER BY count(*) DESC
     LIMIT $${lp} OFFSET $${op}`, params);

  const log = await query(
    `SELECT a.id, a.ngr, a.status, a.reason, a.articles, a.created_at,
            o.name_ru AS target_name, u.username AS by_name
     FROM npa_assignment a
     JOIN organizations o ON o.id = a.org_id
     LEFT JOIN users u ON u.id = a.assigned_by
     ORDER BY a.created_at DESC LIMIT 30`);

  return NextResponse.json({ items: items.rows, page, log: log.rows });
}

export async function POST(req: NextRequest) {
  const m = await requireAdmin();
  if (m.err) return m.err;
  const vb = await zbody(req, NpaAdminBody);
  if (!vb.ok) return vb.res;
  const { action, ngr, articles, target_org_id, reason } = vb.data;
  const arts = articles && articles.length ? articles : null;

  // ——— исключение / возврат ———
  if (action === "exclude" || action === "restore") {
    const exclude = action === "exclude";
    const params: unknown[] = [exclude, exclude ? reason : null,
      exclude ? m.user!.id : null, ngr];
    let artCond = "";
    if (arts) {
      params.push(arts);
      artCond = `AND COALESCE(article,'—') = ANY($${params.length}::text[])`;
    }
    const r = await query(
      `UPDATE requirement_registry
       SET excluded = $1, excluded_reason = $2,
           excluded_at = CASE WHEN $1 THEN now() ELSE NULL END, excluded_by = $3
       WHERE ngr = $4 ${artCond}
         AND (npa_status IS NULL OR npa_status <> 'утратил силу')`, params);
    await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,$2,$3)",
      [m.user!.id, exclude ? "npa_admin_exclude" : "npa_admin_restore",
       JSON.stringify({ ngr, articles: arts, reason: reason || null, affected: r.rowCount })]).catch(() => {});
    return NextResponse.json({ ok: true, affected: r.rowCount });
  }

  // ——— перенос (весь НПА или статьи) в любой активный орган ———
  const org = (await query(
    "SELECT id, code, name_ru FROM organizations WHERE id=$1 AND active", [target_org_id])).rows[0];
  if (!org) return NextResponse.json({ error: "Целевой орган не найден или неактивен" }, { status: 404 });

  const cl = await pool.connect();
  let cascaded = 0;
  let assignmentId: number;
  let npaTitle: string = ngr;
  try {
    await cl.query("BEGIN");
    if (!arts) {
      // весь НПА: закрываем ВСЕ активные назначения (полные и статейные)
      await cl.query(
        `UPDATE npa_assignment SET status='отменено', cancelled_at=now(), cancelled_by=$1
         WHERE ngr=$2 AND status='назначено'`, [m.user!.id, ngr]);
    } else {
      // статьи: закрываем только пересекающиеся статейные назначения; полное
      // назначение (articles IS NULL) оставляем — оно описывает «остаток» НПА
      await cl.query(
        `UPDATE npa_assignment SET status='отменено', cancelled_at=now(), cancelled_by=$1
         WHERE ngr=$2 AND status='назначено' AND articles && $3::text[]`,
        [m.user!.id, ngr, arts]);
    }
    const ins = await cl.query(
      `INSERT INTO npa_assignment (ngr, org_id, assigned_by, reason, articles)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [ngr, org.id, m.user!.id, reason || null, arts]);
    assignmentId = ins.rows[0].id;

    const upd = arts
      ? await cl.query(
          `UPDATE requirement_registry SET authority_code=$1
           WHERE ngr=$2 AND COALESCE(article,'—') = ANY($3::text[]) RETURNING npa_title`,
          [org.code, ngr, arts])
      : await cl.query(
          `UPDATE requirement_registry SET authority_code=$1 WHERE ngr=$2 RETURNING npa_title`,
          [org.code, ngr]);
    cascaded = upd.rowCount || 0;
    npaTitle = (upd.rows[0]?.npa_title as string) || ngr;
    await cl.query("COMMIT");
  } catch (e) {
    await cl.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { error: "Не удалось перенести", detail: String((e as Error).message).slice(0, 150) },
      { status: 500 });
  } finally {
    cl.release();
  }

  await query(
    `INSERT INTO notifications (authority_code, type, dedup_key, title, payload)
     VALUES ($1,'npa_assigned',$2,$3,$4::jsonb) ON CONFLICT (dedup_key) DO NOTHING`,
    [org.code, `npa_admin_transfer:${assignmentId}`,
     `Вам передан НПА: ${npaTitle.slice(0, 120)}${arts ? ` (статьи: ${arts.slice(0, 5).join(", ")}${arts.length > 5 ? "…" : ""})` : ""} — ${cascaded} требований`,
     JSON.stringify({ ngr, req_count: cascaded, articles: arts, reason: reason || null,
                      assigned_by: m.user!.username })]).catch(() => {});
  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'npa_admin_transfer',$2)",
    [m.user!.id, JSON.stringify({ ngr, target: org.code, articles: arts, cascaded })]).catch(() => {});

  return NextResponse.json({ ok: true, assignment_id: assignmentId, cascaded, target: org.name_ru });
}
