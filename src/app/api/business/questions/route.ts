import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/business/questions — опросник (tailoring questions, модель ABLIS).
 * Каждый вопрос активирует тег применимости (trigger) на требованиях.
 */
const QUESTIONS = [
  { tag: "employees", q: "Нанимаете наёмных работников?", def: true },
  { tag: "premises", q: "Есть стационарное помещение (офис, магазин, цех)?", def: true },
  { tag: "cash", q: "Принимаете оплату от населения (наличные/карты)?", def: true },
  { tag: "personal_data", q: "Собираете персональные данные клиентов?", def: true },
  { tag: "food", q: "Производите, храните или продаёте продукты питания или напитки?", def: false },
  { tag: "alcohol_tobacco", q: "Продаёте алкоголь, табак или подакцизные товары?", def: false },
  { tag: "production", q: "Производите или перерабатываете продукцию?", def: false },
  { tag: "import_export", q: "Перемещаете товары через границу (импорт/экспорт)?", def: false },
  { tag: "vehicles", q: "Используете транспорт для перевозок (груз/пассажиры)?", def: false },
  { tag: "hazardous", q: "Работаете с опасными веществами, отходами или оборудованием под давлением?", def: false },
  { tag: "advertising", q: "Размещаете рекламу или вывеску?", def: false },
  { tag: "online", q: "Ведёте деятельность онлайн (интернет-магазин, сервис)?", def: false },
  { tag: "foreign_labor", q: "Привлекаете иностранных работников?", def: false },
  { tag: "public_space", q: "Используете улицу или прилегающую территорию (летняя площадка, нестационарная торговля)?", def: false },
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  return NextResponse.json({ questions: QUESTIONS });
}
