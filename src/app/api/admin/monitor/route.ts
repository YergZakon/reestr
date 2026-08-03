import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildMonitorData } from "@/lib/monitorData";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/monitor — панель мониторинга для МНЭ (только admin).
 * Отдаёт: KPI-сводку, срез по органам (пользователи + требования + статусы ревью),
 * активность ревьюеров и журнал подач НПА. Сбор данных — src/lib/monitorData.ts
 * (общий с Excel-выгрузкой /api/admin/monitor/export).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Раздел доступен только уполномоченному органу (МНЭ)" }, { status: 403 });

  return NextResponse.json(await buildMonitorData());
}
