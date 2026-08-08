import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moderatorScopeOrgIds } from "@/lib/orgs";
import { zbody, ManualCardBody, NGR_RE } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/registry/manual — ручное добавление требования (когда парсер не справился).
 * Последний рубеж после направленной доподачи: таблицы, приложения, перечни.
 * Доступ: admin; moderator — только на орган своего поддерева.
 *
 * Предохранители промышленного качества:
 *  - похожие карточки того же НПА (trgm) возвращаются ДО создания; создание
 *    поверх похожих — только с force=true (осознанное решение модератора);
 *  - source='manual' + бейдж в UI, activity_log (кто/когда/что);
 *  - карточка создаётся pending — проходит обычное ревью органа.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "moderator")
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });

  const v = await zbody(req, ManualCardBody);
  if (!v.ok) return v.res;
  const b = v.data;
  const ngr = b.ngr.trim().replace(/.*\/docs\//, "").replace(/#.*$/, "");
  if (!NGR_RE.test(ngr))
    return NextResponse.json({ error: "Некорректный госрегномер (ngr)" }, { status: 400 });

  if (user.role === "moderator") {
    const scope = await moderatorScopeOrgIds(user.id);
    if (!scope.includes(b.org_id))
      return NextResponse.json({ error: "Орган вне вашего поддерева" }, { status: 403 });
  }
  const org = (await query(
    "SELECT code, name_ru FROM organizations WHERE id=$1 AND active", [b.org_id])).rows[0];
  if (!org) return NextResponse.json({ error: "Орган не найден" }, { status: 404 });

  // реквизиты НПА: название из реестра, если уже встречался
  const known = (await query(
    `SELECT max(npa_title) AS title FROM requirement_registry WHERE ngr=$1`, [ngr])).rows[0];
  const npaTitle = (b.npa_title || known?.title || ngr).slice(0, 300);

  // дедуп-предохранитель: похожие формулировки этого же НПА
  if (!b.force) {
    const sim = await query(
      `SELECT id, article, left(COALESCE(canon_text, legal_text, action), 220) AS text,
              similarity(lower(action), lower($2)) AS sim
       FROM requirement_registry
       WHERE ngr = $1 AND NOT COALESCE(excluded, false)
         AND lower(action) % lower($2)
       ORDER BY 4 DESC LIMIT 3`, [ngr, b.action]);
    if (sim.rows.length)
      return NextResponse.json({
        need_confirm: true,
        similar: sim.rows,
        message: "Найдены похожие требования этого НПА — проверьте, не дубль ли. Для создания повторите с force.",
      }, { status: 409 });
  }

  const ins = await query(
    `INSERT INTO requirement_registry
       (source, trust, ngr, npa_title, article, title, legal_text, canon_text,
        subject, action, condition, norm_url, authority_code, ministry,
        review_status, npa_status, is_canonical)
     VALUES ('manual','manual',$1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,'pending','действующий',true)
     RETURNING id`,
    [ngr, npaTitle, b.article.slice(0, 60),
     `${b.subject}: ${b.action}`.slice(0, 200), b.action, b.subject, b.action.slice(0, 400),
     b.condition || null, `https://adilet.zan.kz/rus/docs/${ngr}`, org.code, org.name_ru]);

  await query("INSERT INTO activity_log (user_id, action, details) VALUES ($1,'manual_card',$2)",
    [user.id, JSON.stringify({ registry_id: ins.rows[0].id, ngr, org: org.code })]);
  return NextResponse.json({ ok: true, id: ins.rows[0].id });
}
