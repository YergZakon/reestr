import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/registry/filters — справочники для дропдаунов реестра. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const [ministries, spheres, trusts, statuses, totals] = await Promise.all([
    query(`SELECT ministry, COUNT(*) AS n FROM requirement_registry
           WHERE is_canonical AND ministry IS NOT NULL
           GROUP BY ministry ORDER BY n DESC`),
    query(`SELECT rr.sphere_code, COALESCE(s.name_ru, rr.sphere_code) AS name, COUNT(*) AS n
           FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
           WHERE rr.is_canonical AND rr.sphere_code IS NOT NULL
           GROUP BY rr.sphere_code, s.name_ru ORDER BY n DESC`),
    query(`SELECT trust, COUNT(*) AS n FROM requirement_registry
           WHERE is_canonical GROUP BY trust ORDER BY n DESC`),
    query(`SELECT review_status, COUNT(*) AS n FROM requirement_registry
           WHERE is_canonical GROUP BY review_status ORDER BY n DESC`),
    query(`SELECT
             COUNT(*) FILTER (WHERE is_canonical) AS canonical,
             COUNT(*) AS all_rows,
             COUNT(*) FILTER (WHERE is_canonical AND ersop_confirmed) AS ersop_confirmed,
             COUNT(*) FILTER (WHERE is_canonical AND npa_status='утратил силу') AS stale
           FROM requirement_registry`),
  ]);

  return NextResponse.json({
    ministries: ministries.rows,
    spheres: spheres.rows,
    trusts: trusts.rows,
    review_statuses: statuses.rows,
    totals: totals.rows[0],
  });
}
