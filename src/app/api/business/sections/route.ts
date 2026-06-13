import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/business/sections — 18 секций-отраслей (A..S) с числом бизнесов,
 * занятых и числом отраслевых требований. Для входа в бизнес-режим.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const res = await query(`
    SELECT os.section, os.name_ru, os.biz_total, os.workers_thousands,
      (SELECT COUNT(*) FROM requirement_registry rr
         WHERE rr.is_canonical
           AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')
           AND rr.scope = 'sectoral'
           AND os.section = ANY(rr.sections)) AS req_count
    FROM oked_section os
    ORDER BY os.biz_total DESC NULLS LAST
  `);
  return NextResponse.json({ sections: res.rows });
}
