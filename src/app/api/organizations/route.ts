import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { zbody, OrgCreateBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET  /api/organizations — плоский список узлов иерархии органов (клиент строит дерево по parent_id).
 * POST /api/organizations — добавить узел (только admin). Body: {code, parent_id?, type, name_ru, short_name?, region_code?, sphere_codes?}
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const r = await query(`
    SELECT o.id, o.code, o.parent_id, o.type, o.name_ru, o.short_name, o.region_code,
           o.sphere_codes, o.is_regulator, o.active,
           (SELECT count(*) FROM requirement_registry rr
             WHERE rr.authority_code = o.code AND NOT COALESCE(rr.excluded, false)
               AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу'))::int AS req_count
    FROM organizations o
    WHERE o.active
    ORDER BY o.type, o.display_order, o.name_ru`);
  return NextResponse.json({ organizations: r.rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  const v = await zbody(req, OrgCreateBody);
  if (!v.ok) return v.res;
  const { code, parent_id, type, name_ru, short_name, region_code, sphere_codes } = v.data;
  try {
    const r = await query(
      `INSERT INTO organizations (code, parent_id, type, name_ru, short_name, region_code, sphere_codes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [code, parent_id || null, type, name_ru, short_name || null, region_code || null, sphere_codes || null]);
    return NextResponse.json({ ok: true, id: r.rows[0].id });
  } catch (e) {
    return NextResponse.json({ error: "Не удалось создать (код занят?)", detail: String(e).slice(0, 120) }, { status: 400 });
  }
}
