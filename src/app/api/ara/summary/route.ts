import { NextResponse } from "next/server";
import { getCurrentUserWithAccess, isMne } from "@/lib/auth";
import { araKpi, araByOrg } from "@/lib/araData";

export const dynamic = "force-dynamic";

/** GET /api/ara/summary — сводка АРА: МНЭ — пять групп + разрез по органам;
 *  модератор/аналитик — пять групп своего скоупа. */
export async function GET() {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (isMne(user.role)) {
    const [kpi, byOrg] = await Promise.all([araKpi(null), araByOrg()]);
    return NextResponse.json({ kpi, byOrg, isMne: true });
  }
  if (!user.assigned_authorities.length)
    return NextResponse.json({ kpi: null, byOrg: [], isMne: false, noAuthorities: true });
  const kpi = await araKpi(user.assigned_authorities);
  return NextResponse.json({ kpi, byOrg: [], isMne: false });
}
