import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { escapeLike } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET /api/registry/export — CSV отфильтрованного реестра (те же фильтры, что list). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conds: string[] = ["NOT COALESCE(rr.excluded, false)", "(rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')"];
  const params: unknown[] = [];
  const eq = (col: string, val: string | null) => {
    if (val) { params.push(val); conds.push(`rr.${col} = $${params.length}`); }
  };
  eq("ministry", searchParams.get("ministry"));
  eq("sphere_code", searchParams.get("sphere"));
  eq("ngr", searchParams.get("ngr"));
  eq("npa_status", searchParams.get("npa_status"));
  eq("trust", searchParams.get("trust"));
  eq("source", searchParams.get("source"));
  eq("review_status", searchParams.get("review_status"));
  if (searchParams.get("ersop_confirmed") === "1") conds.push("rr.ersop_confirmed = true");
  const q = searchParams.get("q");
  if (q && q.trim()) {
    params.push(`%${escapeLike(q.trim())}%`);
    const p = `$${params.length}`;
    conds.push(`(rr.title ILIKE ${p} OR rr.canon_text ILIKE ${p} OR rr.legal_text ILIKE ${p})`);
  }

  const res = await query(
    `SELECT rr.ministry, s.name_ru AS sphere, rr.npa_title, rr.ngr, rr.article,
            COALESCE(rr.canon_text, rr.legal_text, rr.title) AS text,
            rr.subject, rr.action, rr.object, rr.condition,
            array_to_string(rr.stages, '|') AS stages,
            array_to_string(rr.okeds, '|') AS okeds,
            CASE WHEN NOT rr.is_canonical THEN 'дубль группы ' || rr.dup_group_id ELSE '' END AS duplicate
     FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
     WHERE ${conds.join(" AND ")} ORDER BY rr.ministry, rr.ngr`,
    params,
  );

  const cols = ["ministry", "sphere", "npa_title", "ngr", "article",
    "text", "subject", "action", "object", "condition", "stages", "okeds"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(";");
  const lines = res.rows.map((r) => cols.map((c) => esc(r[c])).join(";"));
  const csv = "﻿" + [header, ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registry_export.csv"`,
    },
  });
}
