import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/registry/export — CSV отфильтрованного реестра (те же фильтры, что list). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conds: string[] = ["rr.is_canonical = true"];
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
    params.push(`%${q.trim()}%`);
    const p = `$${params.length}`;
    conds.push(`(rr.title ILIKE ${p} OR rr.canon_text ILIKE ${p} OR rr.legal_text ILIKE ${p})`);
  }

  const res = await query(
    `SELECT rr.ngr, rr.npa_title, rr.article, rr.npa_status, rr.ministry,
            rr.sphere_code, rr.trust, rr.ersop_confirmed, rr.review_status,
            rr.subject, rr.action, rr.object, rr.condition,
            COALESCE(rr.canon_text, rr.legal_text, rr.title) AS text,
            array_to_string(rr.stages, '|') AS stages,
            array_to_string(rr.okeds, '|') AS okeds
     FROM requirement_registry rr WHERE ${conds.join(" AND ")} ORDER BY rr.ministry, rr.ngr`,
    params,
  );

  const cols = ["ngr", "npa_title", "article", "npa_status", "ministry", "sphere_code",
    "trust", "ersop_confirmed", "review_status", "subject", "action", "object",
    "condition", "text", "stages", "okeds"];
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
