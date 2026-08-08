import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser, isMne } from "@/lib/auth";
import { buildMonitorData } from "@/lib/monitorData";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/monitor/export — Excel-выгрузка панели мониторинга (только admin).
 * Пять листов: Сводка, По органам, Сотрудники, Поданные НПА, Подающие.
 * Данные — из общего сборщика monitorData: числа в файле совпадают с панелью.
 */

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
const HEAD_FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
const BODY_FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns;
  const h = ws.getRow(1);
  h.font = HEAD_FONT;
  h.eachCell((c) => { c.fill = HEAD_FILL; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

const dt = (v: unknown) => (v ? String(v).slice(0, 16).replace("T", " ") : "");

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (!isMne(user.role))
    return NextResponse.json({ error: "Раздел доступен только уполномоченному органу (МНЭ)" }, { status: 403 });

  const d = await buildMonitorData();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Реестр обязательных требований";

  // ── Сводка ──
  const sv = sheet(wb, "Сводка", [
    { header: "Показатель", key: "k", width: 52 },
    { header: "Значение", key: "v", width: 16 },
  ]);
  const processed = d.kpi.confirmed + d.kpi.rejected + d.kpi.edited;
  ([
    ["Действующих требований", d.kpi.total],
    ["Ожидают подтверждения", d.kpi.pending],
    ["Подтверждено", d.kpi.confirmed],
    ["Отклонено", d.kpi.rejected],
    ["Отредактировано", d.kpi.edited],
    ["Из них дублей (к устранению)", d.kpi.dupes],
    ["НПА в реестре", d.kpi.npa_count],
    ["Обработано госорганами", processed],
    ["Обработано, %", d.kpi.total ? Math.round((processed / d.kpi.total) * 1000) / 10 : 0],
    ["Модераторов (активных)", d.users.moderators_active],
    ["Аналитиков (активных)", d.users.analysts_active],
    ["НПА подано органами", d.subs.by_users],
    ["Подач за 7 дней", d.subs.last7],
    ["Требований из подач", d.subs.cards],
    ["Подающих пользователей", d.subs.submitters],
  ] as [string, number][]).forEach(([k, v]) => sv.addRow({ k, v }).font = BODY_FONT);

  // ── По органам ──
  const org = sheet(wb, "По органам", [
    { header: "Государственный орган", key: "name", width: 44 },
    { header: "Код", key: "code", width: 12 },
    { header: "Модераторов", key: "moderators", width: 13 },
    { header: "Аналитиков", key: "analysts", width: 12 },
    { header: "НПА", key: "npa", width: 9 },
    { header: "Требований", key: "total", width: 12 },
    { header: "Дублей", key: "dupes", width: 10 },
    { header: "Ожидают", key: "pending", width: 11 },
    { header: "Подтверждено", key: "confirmed", width: 14 },
    { header: "Отклонено", key: "rejected", width: 11 },
    { header: "Отредактировано", key: "edited", width: 16 },
    { header: "Обработано, %", key: "done", width: 14 },
    { header: "Подано НПА", key: "submissions", width: 12 },
  ]);
  for (const r of d.byOrg) {
    const done = r.total ? Math.round(((r.confirmed + r.rejected + r.edited) / r.total) * 1000) / 10 : 0;
    org.addRow({ ...r, done }).font = BODY_FONT;
  }

  // ── Сотрудники ──
  const st = sheet(wb, "Сотрудники", [
    { header: "Логин", key: "username", width: 24 },
    { header: "ФИО", key: "full_name", width: 30 },
    { header: "Роль", key: "role", width: 12 },
    { header: "Орган", key: "org", width: 34 },
    { header: "Активен", key: "active", width: 10 },
    { header: "Подтверждено", key: "confirmed", width: 14 },
    { header: "Отклонено", key: "rejected", width: 11 },
    { header: "Отредактировано", key: "edited", width: 16 },
    { header: "Всего обработано", key: "total", width: 16 },
    { header: "Последняя активность", key: "last", width: 20 },
  ]);
  for (const r of d.reviewers) {
    st.addRow({
      ...r,
      role: r.role === "expert" ? "Аналитик" : r.role === "moderator" ? "Модератор" : r.role,
      active: r.is_active ? "да" : "нет",
      last: dt(r.last_at),
    }).font = BODY_FONT;
  }

  // ── Поданные НПА ──
  const sb = sheet(wb, "Поданные НПА", [
    { header: "Дата подачи", key: "created", width: 17 },
    { header: "Госорган", key: "root_name", width: 30 },
    { header: "Подразделение подачи", key: "org_name", width: 30 },
    { header: "Кто подал", key: "submitted_by", width: 24 },
    { header: "Госрегномер (ngr)", key: "ngr", width: 16 },
    { header: "Название НПА", key: "npa_title", width: 80 },
    { header: "Статус", key: "status", width: 12 },
    { header: "Карточек создано", key: "cards_created", width: 16 },
  ]);
  for (const r of d.submissions) {
    sb.addRow({
      ...r,
      created: dt(r.created_at),
      org_name: r.org_name === r.root_name ? "—" : r.org_name,
      npa_title: (r.npa_title || "").replace(/&quot;/g, '"'),
    }).font = BODY_FONT;
  }

  // ── Подающие ──
  const sm = sheet(wb, "Подающие", [
    { header: "Логин", key: "username", width: 24 },
    { header: "ФИО", key: "full_name", width: 30 },
    { header: "Орган", key: "org", width: 34 },
    { header: "Подач", key: "submissions", width: 9 },
    { header: "Карточек создано", key: "cards", width: 16 },
    { header: "Последняя подача", key: "last", width: 18 },
  ]);
  for (const r of d.submitters) sm.addRow({ ...r, last: dt(r.last_at) }).font = BODY_FONT;

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="monitoring_${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Мониторинг_${stamp}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
