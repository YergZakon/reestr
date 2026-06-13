import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/registry/[id]/duplicates — все формулировки дубль-группы записи. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await ctx.params;
  const g = await query("SELECT dup_group_id FROM requirement_registry WHERE id = $1", [id]);
  if (g.rows.length === 0) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  const groupId = g.rows[0].dup_group_id;
  if (!groupId) return NextResponse.json({ items: [] });

  const res = await query(
    `SELECT id, source, trust, ngr, npa_title, article, ministry, sphere_code,
            COALESCE(canon_text, legal_text, title) AS text, is_canonical, ersop_confirmed
     FROM requirement_registry WHERE dup_group_id = $1
     ORDER BY is_canonical DESC, id`,
    [groupId],
  );
  return NextResponse.json({ items: res.rows });
}
