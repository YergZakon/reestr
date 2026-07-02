import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserWithAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/registry/organs — узлы справочника органов со сводкой по НПА/требованиям
 * (вкладка «Органы и НПА»). Ось — requirement_registry.authority_code ↔ organizations.code,
 * поэтому назначения «комитет↔НПА» отражаются здесь сразу (НПА уходит под комитет).
 * Скоуп: admin видит все органы; moderator/expert — только узлы своего поддерева
 * (assigned_authorities). parent_id отдаётся для отрисовки дерева на клиенте.
 */
export async function GET() {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const scoped = user.role !== "admin";
  const params: unknown[] = [];
  let scopeCond = "";
  if (scoped) {
    if (!user.assigned_authorities.length) return NextResponse.json({ organs: [], scoped: true });
    params.push(user.assigned_authorities);
    scopeCond = "AND o.code = ANY($1::text[])";
  }

  const res = await query(
    `SELECT o.code, o.name_ru, o.short_name, o.type, po.code AS parent_code,
            count(DISTINCT rr.ngr)::int AS npa_count,
            count(*)::int AS req_count,
            count(DISTINCT rr.ngr) FILTER (WHERE COALESCE(rr.npa_status,'') <> 'утратил силу')::int AS npa_active
     FROM organizations o
     LEFT JOIN organizations po ON po.id = o.parent_id
     JOIN requirement_registry rr ON rr.authority_code = o.code
     WHERE o.active AND NOT COALESCE(rr.excluded, false) AND rr.ngr IS NOT NULL
       ${scopeCond}
     GROUP BY o.id, o.code, o.name_ru, o.short_name, o.type, po.code
     ORDER BY count(*) DESC`,
    params,
  );
  return NextResponse.json({ organs: res.rows, scoped });
}
