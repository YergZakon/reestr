import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/registry/filters — справочники для дропдаунов реестра. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // Действующие требования (утратившие силу не считаем)
  const ACTIVE = "rr.is_canonical AND NOT COALESCE(rr.excluded, false) AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')";
  const [ministries, spheres, stages, totals] = await Promise.all([
    query(`SELECT rr.ministry, COUNT(*) AS n FROM requirement_registry rr
           WHERE ${ACTIVE} AND rr.ministry IS NOT NULL AND rr.ministry NOT LIKE '%|%'
           GROUP BY rr.ministry ORDER BY n DESC`),
    query(`SELECT rr.sphere_code, COALESCE(s.name_ru, rr.sphere_code) AS name, COUNT(*) AS n
           FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
           WHERE ${ACTIVE} AND rr.sphere_code IS NOT NULL AND rr.sphere_code NOT LIKE '%;%'
           GROUP BY rr.sphere_code, s.name_ru ORDER BY n DESC`),
    query(`SELECT st AS stage, COUNT(*) AS n
           FROM requirement_registry rr, unnest(rr.stages) st
           WHERE ${ACTIVE}
           GROUP BY st ORDER BY n DESC`),
    query(`SELECT COUNT(*) FILTER (WHERE ${ACTIVE}) AS active,
                  COUNT(DISTINCT rr.ngr) FILTER (WHERE ${ACTIVE}) AS npa
           FROM requirement_registry rr`),
  ]);

  return NextResponse.json({
    ministries: ministries.rows,
    spheres: spheres.rows,
    stages: stages.rows,
    totals: totals.rows[0],
  });
}
