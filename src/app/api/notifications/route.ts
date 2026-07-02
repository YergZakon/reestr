import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserWithAccess } from "@/lib/auth";
import { zbody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications — уведомления органов пользователя (admin — все).
 *   ?unread=1 — только непрочитанные текущим пользователем. Лимит 50.
 * PUT /api/notifications — отметить прочитанными. Body: {ids:number[]}.
 * Генерация — конвейер (scripts/registry/generate_notifications.py), Д5-заготовка.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const unreadOnly = new URL(req.url).searchParams.get("unread") === "1";

  const conds: string[] = [];
  const params: unknown[] = [];
  if (user.role !== "admin") {
    if (!user.assigned_authorities.length) return NextResponse.json({ items: [], unread: 0 });
    params.push(user.assigned_authorities);
    conds.push(`n.authority_code = ANY($${params.length}::text[])`);
  }
  params.push(user.id);
  const uidP = `$${params.length}`;
  if (unreadOnly) conds.push(`NOT (n.read_by @> ARRAY[${uidP}::int])`);
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  const r = await query(
    `SELECT n.id, n.authority_code, n.type, n.title, n.payload, n.created_at,
            (n.read_by @> ARRAY[${uidP}::int]) AS is_read
     FROM notifications n ${where}
     ORDER BY n.created_at DESC LIMIT 50`, params);
  const unread = r.rows.filter((x) => !x.is_read).length;
  return NextResponse.json({ items: r.rows, unread });
}

const MarkReadBody = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(100) });

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const vb = await zbody(req, MarkReadBody);
  if (!vb.ok) return vb.res;

  // отмечать можно только уведомления доступных органов (admin — любые)
  const params: unknown[] = [vb.data.ids, user.id];
  let scope = "";
  if (user.role !== "admin") {
    params.push(user.assigned_authorities);
    scope = `AND authority_code = ANY($3::text[])`;
  }
  const r = await query(
    `UPDATE notifications
     SET read_by = array_append(COALESCE(read_by, '{}'), $2::int)
     WHERE id = ANY($1::bigint[]) AND NOT (COALESCE(read_by,'{}') @> ARRAY[$2::int]) ${scope}`,
    params);
  return NextResponse.json({ ok: true, marked: r.rowCount });
}
