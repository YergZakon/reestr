import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/registry/list — сводный реестр требований (requirement_registry).
 * Доступ: любой авторизованный (реестр — сводный продукт, без dual-axis).
 * Фильтры: ministry, sphere, ngr, npa_status, trust, source, review_status,
 *          ersop_confirmed (1/0), q (поиск); по умолчанию только is_canonical.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const conds: string[] = [];
  const params: unknown[] = [];

  // По умолчанию показываем только канонические (дубли свёрнуты)
  if (searchParams.get("include_dups") !== "1") {
    conds.push("rr.is_canonical = true");
  }

  // Реестр действующих требований: утратившие силу НПА не показываем
  conds.push("(rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')");

  const eq = (col: string, val: string | null) => {
    if (val) {
      params.push(val);
      conds.push(`rr.${col} = $${params.length}`);
    }
  };
  eq("ministry", searchParams.get("ministry"));
  eq("sphere_code", searchParams.get("sphere"));
  eq("ngr", searchParams.get("ngr"));
  eq("npa_status", searchParams.get("npa_status"));
  eq("trust", searchParams.get("trust"));
  eq("source", searchParams.get("source"));
  eq("review_status", searchParams.get("review_status"));

  const ersopConf = searchParams.get("ersop_confirmed");
  if (ersopConf === "1") conds.push("rr.ersop_confirmed = true");

  const q = searchParams.get("q");
  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    const p = `$${params.length}`;
    conds.push(`(rr.title ILIKE ${p} OR rr.canon_text ILIKE ${p} OR rr.legal_text ILIKE ${p} OR rr.action ILIKE ${p})`);
  }

  const whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";

  const countRes = await query(
    `SELECT COUNT(*) AS cnt FROM requirement_registry rr ${whereClause}`,
    params,
  );
  const total = parseInt(countRes.rows[0].cnt, 10);

  params.push(limit, offset);
  const dataSql = `
    SELECT
      rr.id, rr.source, rr.trust, rr.ngr, rr.npa_title, rr.article,
      rr.npa_status, rr.replacement_ngr, rr.ministry, rr.sphere_code, rr.ersop_area,
      rr.okeds, rr.stages, rr.title, rr.legal_text, rr.canon_text,
      rr.subject, rr.action, rr.object, rr.condition, rr.evidence,
      rr.ersop_confirmed, rr.ersop_code, rr.dup_group_id,
      rr.review_status, rr.review_comment,
      s.name_ru AS sphere_name,
      CASE WHEN rr.dup_group_id IS NOT NULL THEN (
        SELECT COUNT(*) FROM requirement_registry d WHERE d.dup_group_id = rr.dup_group_id
      ) ELSE 1 END AS group_size
    FROM requirement_registry rr
    LEFT JOIN spheres s ON s.code = rr.sphere_code
    ${whereClause}
    ORDER BY rr.id
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await query(dataSql, params);

  return NextResponse.json({
    items: result.rows,
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  });
}
