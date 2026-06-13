import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/registry/npa?ministry=&q=&status= — НПА органа с датами и ссылкой adilet. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const conds: string[] = ["ngr IS NOT NULL"];
  const params: unknown[] = [];

  const ministry = sp.get("ministry");
  if (ministry) { params.push(ministry); conds.push(`ministry = $${params.length}`); }
  const status = sp.get("status");
  if (status === "active") conds.push("npa_status <> 'утратил силу'");
  if (status === "dead") conds.push("npa_status = 'утратил силу'");
  const q = sp.get("q");
  if (q && q.trim()) { params.push(`%${q.trim()}%`); conds.push(`(title ILIKE $${params.length} OR ngr ILIKE $${params.length})`); }

  const res = await query(`
    SELECT ngr, title, ministry, npa_status,
           to_char(date_adopted, 'DD.MM.YYYY') AS date_adopted,
           to_char(date_revision, 'DD.MM.YYYY') AS date_revision,
           to_char(review_deadline, 'DD.MM.YYYY') AS review_deadline,
           (review_deadline IS NOT NULL AND review_deadline < now()) AS overdue,
           req_count, adilet_url
    FROM npa_registry
    WHERE ${conds.join(" AND ")}
    ORDER BY req_count DESC, title
  `, params);
  return NextResponse.json({ npa: res.rows });
}
