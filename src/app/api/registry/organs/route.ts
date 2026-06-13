import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/registry/organs — органы со сводкой по НПА (для вкладки «Органы и НПА»). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const res = await query(`
    SELECT ministry,
           COUNT(*) AS npa_count,
           COUNT(*) FILTER (WHERE npa_status <> 'утратил силу') AS npa_active,
           SUM(req_count) AS req_count,
           COUNT(*) FILTER (WHERE review_deadline IS NOT NULL AND review_deadline < now()) AS overdue
    FROM npa_registry
    WHERE ministry IS NOT NULL
    GROUP BY ministry
    ORDER BY req_count DESC
  `);
  return NextResponse.json({ organs: res.rows });
}
