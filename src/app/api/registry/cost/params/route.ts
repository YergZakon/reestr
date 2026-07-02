import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { zbody, CostParamsBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET/POST /api/registry/cost/params — настраиваемые параметры расчёта нагрузки (SCM). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const r = await query(`SELECT hours_per_month, on_costs, overhead, mult_clerical, mult_specialist,
    mult_manager, inspector_rate_kzt, avg_wage_month FROM cost_params WHERE id=1`);
  return NextResponse.json({ params: r.rows[0] || null });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  // параметры SCM влияют на расчёт стоимости ВСЕГО реестра — только admin (МНЭ)
  if (user.role !== "admin") return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  const vb = await zbody(req, CostParamsBody);
  if (!vb.ok) return vb.res;
  const b = vb.data as Record<string, number | undefined>;
  // обновляем только переданные числовые поля (whitelist ключей — фиксированный)
  const allowed = ["hours_per_month", "on_costs", "overhead", "mult_clerical", "mult_specialist", "mult_manager", "inspector_rate_kzt", "avg_wage_month"];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const k of allowed) {
    if (b[k] !== undefined && b[k] !== null && !isNaN(Number(b[k]))) {
      params.push(Number(b[k]));
      sets.push(`${k}=$${params.length}`);
    }
  }
  if (!sets.length) return NextResponse.json({ error: "Нет полей" }, { status: 400 });
  await query(`UPDATE cost_params SET ${sets.join(", ")}, updated_at=now() WHERE id=1`, params);
  const r = await query(`SELECT hours_per_month, on_costs, overhead, mult_clerical, mult_specialist,
    mult_manager, inspector_rate_kzt, avg_wage_month FROM cost_params WHERE id=1`);
  return NextResponse.json({ params: r.rows[0], note: "Параметры сохранены. Стоимость пересчитана." });
}
