import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/registry/review — ревью записи реестра.
 * Body: { id, action: 'confirm'|'reject'|'edit', comment?, fields?: {col: value} }
 * confirm/reject → review_status. edit → обновить разрешённые поля + лог в registry_edits.
 */
const EDITABLE = new Set([
  "title", "canon_text", "subject", "action", "object",
  "condition", "evidence", "ministry", "sphere_code", "npa_status",
]);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "expert" && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.action) {
    return NextResponse.json({ error: "id и action обязательны" }, { status: 400 });
  }
  const { id, action, comment, fields } = body;

  const cur = await query("SELECT * FROM requirement_registry WHERE id = $1", [id]);
  if (cur.rows.length === 0) {
    return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  }
  const row = cur.rows[0];

  if (action === "confirm" || action === "reject") {
    const status = action === "confirm" ? "confirmed" : "rejected";
    await query(
      `UPDATE requirement_registry
       SET review_status=$1, reviewed_by=$2, reviewed_at=now(), review_comment=$3
       WHERE id=$4`,
      [status, user.id, comment || null, id],
    );
    await query(
      `INSERT INTO registry_edits (registry_id, user_id, action, comment) VALUES ($1,$2,$3,$4)`,
      [id, user.id, action, comment || null],
    );
    return NextResponse.json({ ok: true, review_status: status });
  }

  if (action === "edit") {
    if (!fields || typeof fields !== "object") {
      return NextResponse.json({ error: "fields обязательны для edit" }, { status: 400 });
    }
    const edits: Array<[string, unknown, unknown]> = [];
    const setParts: string[] = [];
    const params: unknown[] = [];
    for (const [col, val] of Object.entries(fields)) {
      if (!EDITABLE.has(col)) continue;
      if (row[col] === val) continue;
      params.push(val);
      setParts.push(`${col}=$${params.length}`);
      edits.push([col, row[col], val]);
    }
    if (setParts.length === 0) {
      return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
    }
    params.push(user.id);
    const byIdx = params.length;
    params.push(id);
    await query(
      `UPDATE requirement_registry
       SET ${setParts.join(", ")}, review_status='edited', reviewed_by=$${byIdx}, reviewed_at=now()
       WHERE id=$${params.length}`,
      params,
    );
    for (const [col, oldV, newV] of edits) {
      await query(
        `INSERT INTO registry_edits (registry_id, user_id, action, field, old_value, new_value, comment)
         VALUES ($1,$2,'edit',$3,$4,$5,$6)`,
        [id, user.id, col, oldV == null ? null : String(oldV), newV == null ? null : String(newV), comment || null],
      );
    }
    return NextResponse.json({ ok: true, review_status: "edited", changed: edits.map((e) => e[0]) });
  }

  return NextResponse.json({ error: "Неизвестное action" }, { status: 400 });
}
