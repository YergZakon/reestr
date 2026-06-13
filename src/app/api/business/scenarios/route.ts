import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/business/scenarios — курируемые типовые сценарии «открыть …».
 * Каждый ведёт на конкретный ОКЭД. Плитки на входе в бизнес-режим.
 */
const SCENARIOS = [
  { id: "cafe", title: "Кафе или ресторан", oked: "5610", section: "I", icon: "🍽️", desc: "Общепит, доставка питания" },
  { id: "shop", title: "Продуктовый магазин", oked: "4711", section: "G", icon: "🛒", desc: "Розничная торговля" },
  { id: "sto", title: "СТО / ремонт авто", oked: "4520", section: "G", icon: "🔧", desc: "Техобслуживание автомобилей" },
  { id: "bakery", title: "Пекарня", oked: "1071", section: "C", icon: "🥖", desc: "Производство хлеба и выпечки" },
  { id: "taxi", title: "Такси", oked: "4932", section: "H", icon: "🚕", desc: "Пассажирские перевозки" },
  { id: "cargo", title: "Грузоперевозки", oked: "4941", section: "H", icon: "🚚", desc: "Грузовой автотранспорт" },
  { id: "salon", title: "Салон красоты", oked: "9602", section: "S", icon: "💇", desc: "Парикмахерские услуги" },
  { id: "pharmacy", title: "Аптека", oked: "4773", section: "G", icon: "💊", desc: "Розница фарм-товаров" },
  { id: "dental", title: "Стоматология", oked: "8623", section: "Q", icon: "🦷", desc: "Стоматологическая практика" },
  { id: "hotel", title: "Гостиница", oked: "5510", section: "I", icon: "🏨", desc: "Услуги по проживанию" },
  { id: "kindergarten", title: "Детский сад", oked: "8510", section: "P", icon: "🧸", desc: "Дошкольное образование" },
  { id: "build", title: "Строительство", oked: "4120", section: "F", icon: "🏗️", desc: "Строительство зданий" },
  { id: "farm", title: "Ферма (КРС)", oked: "0141", section: "A", icon: "🐄", desc: "Разведение скота" },
  { id: "it", title: "IT / разработка", oked: "6201", section: "J", icon: "💻", desc: "Разработка ПО" },
  { id: "fitness", title: "Фитнес-центр", oked: "9311", section: "R", icon: "🏋️", desc: "Спортивные объекты" },
  { id: "quarry", title: "Карьер / добыча", oked: "0812", section: "B", icon: "⛏️", desc: "Добыча песка, глины, камня" },
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  return NextResponse.json({ scenarios: SCENARIOS });
}
