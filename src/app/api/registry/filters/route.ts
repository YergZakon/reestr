import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/registry/filters — справочники для дропдаунов реестра. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // Действующие требования (утратившие силу не считаем)
  const ACTIVE = "rr.is_canonical AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')";
  const [ministries, spheres, totals] = await Promise.all([
    query(`SELECT rr.ministry, COUNT(*) AS n FROM requirement_registry rr
           WHERE ${ACTIVE} AND rr.ministry IS NOT NULL
           GROUP BY rr.ministry ORDER BY n DESC`),
    query(`SELECT rr.sphere_code, COALESCE(s.name_ru, rr.sphere_code) AS name, COUNT(*) AS n
           FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
           WHERE ${ACTIVE} AND rr.sphere_code IS NOT NULL
           GROUP BY rr.sphere_code, s.name_ru ORDER BY n DESC`),
    query(`SELECT COUNT(*) FILTER (WHERE ${ACTIVE}) AS active FROM requirement_registry rr`),
  ]);

  return NextResponse.json({
    ministries: ministries.rows,
    spheres: spheres.rows,
    totals: totals.rows[0],
  });
}
