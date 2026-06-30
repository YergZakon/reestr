import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserWithAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/registry/review — ревью записи(ей) реестра госорганом.
 * Body: { id | ids:[], action: 'confirm'|'reject'|'edit'|'include', comment?, ara_deadline?, fields? }
 * Доступ: эксперт может трогать только карточки своих органов (authority_code ∈ assigned_authorities);
 * admin (МНЭ) — все, и только он делает 'include' (согласование/включение в реестр, п.7).
 * confirm требует ara_deadline (срок АРА, п.6); валидация ≤3 года для законов/кодексов, ≤2 для иных.
 */
const EDITABLE = new Set([
  "title", "canon_text", "subject", "action", "object",
  "condition", "evidence", "ministry", "sphere_code", "npa_status",
]);

// кодекс (K) / закон (Z) → 3 года, иные НПА → 2 года (Правила, п.6)
const araMaxYears = (ngr: string): number => (/^[KZ]/i.test(ngr || "") ? 3 : 2);

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "expert" && user.role !== "admin")
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  const isAdmin = user.role === "admin";

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action обязателен" }, { status: 400 });
  const { action, comment, fields } = body;
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Boolean)
    : body.id ? [Number(body.id)] : [];
  if (!ids.length) return NextResponse.json({ error: "id или ids обязательны" }, { status: 400 });

  const rowsRes = await query("SELECT * FROM requirement_registry WHERE id = ANY($1)", [ids]);
  if (!rowsRes.rows.length) return NextResponse.json({ error: "Записи не найдены" }, { status: 404 });

  // доступ по органу (admin — без ограничений)
  const canTouch = (row: Record<string, unknown>) =>
    isAdmin || (!!row.authority_code && user.assigned_authorities.includes(row.authority_code as string));
  const denied = rowsRes.rows.filter((r) => !canTouch(r));
  if (denied.length)
    return NextResponse.json({ error: `Нет прав на ${denied.length} запис(и) другого органа` }, { status: 403 });

  const log = async (id: number, act: string) =>
    query(`INSERT INTO registry_edits (registry_id, user_id, action, comment) VALUES ($1,$2,$3,$4)`,
      [id, user.id, act, comment || null]);

  if (action === "edit") {
    if (ids.length !== 1) return NextResponse.json({ error: "edit — по одной записи" }, { status: 400 });
    const row = rowsRes.rows[0];
    if (!fields || typeof fields !== "object")
      return NextResponse.json({ error: "fields обязательны для edit" }, { status: 400 });
    const setParts: string[] = []; const params: unknown[] = [];
    const edits: Array<[string, unknown, unknown]> = [];
    for (const [col, val] of Object.entries(fields)) {
      if (!EDITABLE.has(col) || row[col] === val) continue;
      params.push(val); setParts.push(`${col}=$${params.length}`); edits.push([col, row[col], val]);
    }
    if (!setParts.length) return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
    params.push(user.id); const byIdx = params.length; params.push(ids[0]);
    await query(
      `UPDATE requirement_registry SET ${setParts.join(", ")}, review_status='edited', reviewed_by=$${byIdx}, reviewed_at=now() WHERE id=$${params.length}`,
      params);
    for (const [col, oldV, newV] of edits)
      await query(
        `INSERT INTO registry_edits (registry_id, user_id, action, field, old_value, new_value, comment) VALUES ($1,$2,'edit',$3,$4,$5,$6)`,
        [ids[0], user.id, col, oldV == null ? null : String(oldV), newV == null ? null : String(newV), comment || null]);
    return NextResponse.json({ ok: true, review_status: "edited", changed: edits.map((e) => e[0]) });
  }

  if (action === "confirm") {
    const dl = body.ara_deadline ? new Date(body.ara_deadline) : null;
    if (!dl || isNaN(dl.getTime()))
      return NextResponse.json({ error: "Укажите срок АРА (ara_deadline) при подтверждении" }, { status: 400 });
    for (const row of rowsRes.rows) {
      const max = new Date(); max.setFullYear(max.getFullYear() + araMaxYears(row.ngr as string));
      if (dl > max)
        return NextResponse.json({ error: `Срок АРА превышает ${araMaxYears(row.ngr as string)} года для ${row.ngr}` }, { status: 400 });
    }
    await query(
      `UPDATE requirement_registry SET review_status='confirmed', ara_status='на_согласовании',
       ara_deadline=$1, reviewed_by=$2, reviewed_at=now(), review_comment=$3 WHERE id = ANY($4)`,
      [body.ara_deadline, user.id, comment || null, ids]);
    for (const id of ids) await log(id, "confirm");
    return NextResponse.json({ ok: true, review_status: "confirmed", n: ids.length });
  }

  if (action === "reject") {
    await query(
      `UPDATE requirement_registry SET review_status='rejected', reviewed_by=$1, reviewed_at=now(), review_comment=$2 WHERE id = ANY($3)`,
      [user.id, comment || null, ids]);
    for (const id of ids) await log(id, "reject");
    return NextResponse.json({ ok: true, review_status: "rejected", n: ids.length });
  }

  if (action === "include") {
    if (!isAdmin) return NextResponse.json({ error: "Включение в реестр — только МНЭ" }, { status: 403 });
    await query(
      `UPDATE requirement_registry SET ara_status='в реестре', included_at=now() WHERE id = ANY($1) AND review_status='confirmed'`,
      [ids]);
    for (const id of ids) await log(id, "include");
    return NextResponse.json({ ok: true, ara_status: "в реестре", n: ids.length });
  }

  return NextResponse.json({ error: "Неизвестное action" }, { status: 400 });
}
