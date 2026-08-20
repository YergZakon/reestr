import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithAccess, isMne } from "@/lib/auth";
import { araActs } from "@/lib/araData";

export const dynamic = "force-dynamic";

/** GET /api/ara/acts?authority=&group=&q=&page=&lang= — акты со сроками АРА.
 *  МНЭ — любой орган (или все, включая несматченные); орган — свой скоуп. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const mne = isMne(user.role);

  const authority = sp.get("authority") || null;
  if (!mne) {
    if (!user.assigned_authorities.length)
      return NextResponse.json({ items: [], total: 0, pages: 0, noAuthorities: true });
    if (authority && !user.assigned_authorities.includes(authority))
      return NextResponse.json({ error: "Орган вне вашего скоупа" }, { status: 403 });
  }

  const data = await araActs({
    authority,
    scopeCodes: mne ? null : user.assigned_authorities,
    group: sp.get("group"),
    q: sp.get("q"),
    page: parseInt(sp.get("page") || "1", 10),
    lang: sp.get("lang") || undefined,
  });
  return NextResponse.json({ ...data, isMne: mne });
}
