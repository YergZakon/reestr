import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Дубли: группа = dup_group_id. Берём действующие, не исключённые (мусор).
const BASE = `rr.dup_group_id IS NOT NULL AND NOT COALESCE(rr.excluded,false)
  AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`;

/**
 * GET /api/registry/duplicates?cross=1            — группы дублей (cross=1 → только кросс-орган)
 * GET /api/registry/duplicates?group=<id>         — требования конкретной группы
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const group = sp.get("group");

  if (group) {
    const r = await query(`
      SELECT rr.id, rr.ngr, rr.npa_title, rr.article, rr.ministry, rr.sphere_code,
             s.name_ru AS sphere_name, rr.is_canonical, rr.review_status,
             COALESCE(NULLIF(rr.title,''), rr.action) AS title, rr.canon_text, rr.legal_text,
             rr.total_burden_kzt
      FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
      WHERE rr.dup_group_id = $1 AND NOT COALESCE(rr.excluded,false)
      ORDER BY rr.is_canonical DESC, rr.total_burden_kzt DESC NULLS LAST`, [group]);
    return NextResponse.json({ items: r.rows });
  }

  const cross = sp.get("cross") === "1";
  const having = cross ? "HAVING COUNT(*) > 1 AND COUNT(DISTINCT rr.ministry) > 1" : "HAVING COUNT(*) > 1";
  const r = await query(`
    SELECT rr.dup_group_id AS gid, COUNT(*) AS size,
           COUNT(DISTINCT rr.ministry) AS organs,
           ARRAY_AGG(DISTINCT rr.ministry) FILTER (WHERE rr.ministry IS NOT NULL) AS ministries,
           MAX(CASE WHEN rr.is_canonical THEN COALESCE(NULLIF(rr.title,''), rr.action) END) AS canon_title,
           COALESCE(SUM(CASE WHEN NOT rr.is_canonical THEN rr.total_burden_kzt ELSE 0 END),0)::numeric AS potential_saving
    FROM requirement_registry rr
    WHERE ${BASE}
    GROUP BY rr.dup_group_id
    ${having}
    ORDER BY ${cross ? "organs DESC, size DESC" : "size DESC"}
    LIMIT 200`);

  const stats = await query(`
    SELECT COUNT(*) FILTER (WHERE NOT is_canonical) AS dup_count,
           COUNT(DISTINCT dup_group_id) AS groups
    FROM requirement_registry rr WHERE ${BASE}`);

  return NextResponse.json({
    groups: r.rows,
    totalDuplicates: Number(stats.rows[0].dup_count),
    totalGroups: Number(stats.rows[0].groups),
  });
}
