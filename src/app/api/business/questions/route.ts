import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/business/questions[?oked=5610&section=I] — адаптивный опросник (ABLIS).
 * Слой 1: универсальный вопрос показывается только если его тег реально влияет
 *   на выдачу профиля (count карточек с тегом > 0); часть тегов активируется
 *   автоматически по виду деятельности (auto) и не спрашивается.
 * Слой 2: отраслевые вопрос-паки по ОКЭД-префиксу (кафе/перевозки/магазин/
 *   аптека/стройка) — курируемые, показываются всегда для своего профиля.
 * Без профиля — прежний полный список.
 */
const QUESTIONS = [
  { tag: "employees", q: "Нанимаете наёмных работников?", hint: "Трудовые договоры, охрана труда, регистрация работодателя.", def: true },
  { tag: "premises", q: "Есть стационарное помещение (офис, магазин, цех)?", hint: "Пожарная безопасность, санитария помещений, размещение объекта.", def: true },
  { tag: "cash", q: "Принимаете оплату от населения (наличные/карты)?", hint: "Контрольно-кассовые машины, фискализация, защита прав потребителей.", def: true },
  { tag: "personal_data", q: "Собираете персональные данные клиентов?", hint: "Требования по защите персональных данных.", def: true },
  { tag: "food", q: "Производите, храните или продаёте продукты питания или напитки?", hint: "Санэпид-требования, ХАССП, медкнижки, маркировка пищи.", def: false },
  { tag: "alcohol_tobacco", q: "Продаёте алкоголь, табак или подакцизные товары?", hint: "Лицензия на алкоголь, акцизы, особый учёт.", def: false },
  { tag: "production", q: "Производите или перерабатываете продукцию?", hint: "Технические регламенты, сертификация, маркировка продукции.", def: false },
  { tag: "import_export", q: "Перемещаете товары через границу (импорт/экспорт)?", hint: "Таможенное декларирование, сертификаты, маркировка.", def: false },
  { tag: "vehicles", q: "Используете транспорт для перевозок (груз/пассажиры)?", hint: "Лицензия перевозчика, коммерческий техосмотр, тахографы.", def: false },
  { tag: "hazardous", q: "Работаете с опасными веществами, отходами или оборудованием под давлением?", hint: "Промбезопасность, экологические разрешения, спецдопуски.", def: false },
  { tag: "advertising", q: "Размещаете рекламу или вывеску?", hint: "Закон о рекламе, языковые требования к визуальной информации.", def: false },
  { tag: "online", q: "Ведёте деятельность онлайн (интернет-магазин, сервис)?", hint: "Правила электронной коммерции.", def: false },
  { tag: "foreign_labor", q: "Привлекаете иностранных работников?", hint: "Разрешение на привлечение иностранной рабочей силы.", def: false },
  { tag: "public_space", q: "Используете улицу или прилегающую территорию (летняя площадка, нестационарная торговля)?", hint: "Разрешение акимата на использование территории.", def: false },
];

const TAG_LABEL: Record<string, string> = {
  food: "Продукты питания", premises: "Помещение", vehicles: "Транспорт",
  production: "Производство", cash: "Расчёты с населением",
};

// авто-теги по виду деятельности: очевидное не спрашиваем
const AUTO_DEFAULTS: [string[], string[]][] = [
  [["56"], ["food", "premises"]],
  [["55"], ["premises"]],
  [["47", "4773"], ["premises", "cash"]],
  [["49", "50", "51", "52", "53"], ["vehicles"]],
  [["86", "87", "88", "85"], ["premises"]],
];
// производственные 10–33
for (let i = 10; i <= 33; i++) AUTO_DEFAULTS.push([[String(i)], ["production"]]);

// отраслевые вопрос-паки (слой 2); теги размечаются tag_sector_triggers.py
const SECTOR_PACKS: { prefixes: string[]; questions: { tag: string; q: string; hint?: string; def: boolean }[] }[] = [
  {
    prefixes: ["56"],
    questions: [
      { tag: "food_alcohol", q: "Продаёте алкоголь в заведении?", hint: "Лицензия на розничную реализацию алкоголя в общепите.", def: false },
      { tag: "food_hall", q: "Есть зал обслуживания посетителей?", hint: "Санитарные требования к залу, число посадочных мест.", def: true },
      { tag: "food_delivery", q: "Доставляете еду клиентам?", hint: "Требования к перевозке пищевой продукции.", def: false },
      { tag: "food_children", q: "Готовите для детей (детское меню, питание для школ/детсадов)?", hint: "Усиленные санитарные нормы детского питания.", def: false },
      { tag: "food_catering", q: "Выездное обслуживание (кейтеринг)?", hint: "Требования к выездному приготовлению и транспортировке.", def: false },
    ],
  },
  {
    prefixes: ["49", "52"],
    questions: [
      { tag: "cargo_dangerous", q: "Перевозите опасные грузы?", hint: "Спецразрешение, ДОПОГ, требования к ТС и водителям.", def: false },
      { tag: "cargo_international", q: "Выполняете международные перевозки?", hint: "Допуск к международным перевозкам, разрешения ЕЭК/двусторонние.", def: false },
      { tag: "cargo_passengers", q: "Перевозите пассажиров?", hint: "Лицензия на регулярные/нерегулярные пассажирские перевозки.", def: false },
      { tag: "cargo_oversize", q: "Возите тяжеловесные или крупногабаритные грузы?", hint: "Специальное разрешение на проезд по дорогам.", def: false },
    ],
  },
  {
    prefixes: ["47"],
    questions: [
      { tag: "retail_gsm", q: "Продаёте топливо (АЗС, ГСМ)?", hint: "Лицензия/уведомление, требования к АЗС.", def: false },
      { tag: "retail_pharma", q: "Продаёте лекарства или медицинские изделия?", hint: "Фармацевтическая лицензия, требования к хранению.", def: false },
      { tag: "retail_weapons", q: "Продаёте оружие или спецсредства?", hint: "Лицензия, требования к хранению и учёту.", def: false },
    ],
  },
  {
    prefixes: ["4773", "21"],
    questions: [
      { tag: "pharm_narcotics", q: "Работаете с наркосодержащими препаратами или прекурсорами?", hint: "Спецлицензия, учёт, охрана, отчётность.", def: false },
      { tag: "pharm_making", q: "Изготавливаете лекарства в аптеке?", hint: "Требования к производственной аптеке.", def: false },
      { tag: "pharm_online", q: "Продаёте лекарства дистанционно (интернет-аптека)?", hint: "Правила дистанционной реализации.", def: false },
    ],
  },
  {
    prefixes: ["41", "42", "43"],
    questions: [
      { tag: "constr_design", q: "Выполняете проектирование или изыскания?", hint: "Лицензия на проектную деятельность, экспертиза проектов.", def: false },
      { tag: "constr_special", q: "Работаете на технически сложных или особо опасных объектах?", hint: "Повышенные категории лицензий, промбезопасность.", def: false },
      { tag: "constr_cranes", q: "Используете краны и грузоподъёмные механизмы?", hint: "Регистрация ОПО, освидетельствование, крановщики.", def: false },
      { tag: "constr_roads", q: "Ведёте работы на дорогах или инженерных сетях (раскопки)?", hint: "Ордер на производство работ, согласования с владельцами сетей.", def: false },
    ],
  },
];

function bestMatch<T>(oked: string, entries: [string[], T][]): T | null {
  let best: T | null = null;
  let bestLen = 0;
  for (const [prefixes, val] of entries) {
    for (const p of prefixes) {
      if (oked.startsWith(p) && p.length > bestLen) { best = val; bestLen = p.length; }
    }
  }
  return best;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const oked = (sp.get("oked") || "").replace(/\./g, "").trim();
  const section = (sp.get("section") || "").trim().toUpperCase();

  if (!oked && !section) return NextResponse.json({ questions: QUESTIONS, auto: [] });

  // авто-теги и отраслевой пак по ОКЭДу
  const autoTags = oked ? (bestMatch(oked, AUTO_DEFAULTS) || []) : [];
  const pack = oked
    ? (bestMatch(oked, SECTOR_PACKS.map((p) => [p.prefixes, p.questions] as [string[], typeof p.questions])) || [])
    : [];

  // счётчик влияния каждого тега на выдачу профиля (те же условия, что requirements)
  let relSpheres: string[] = [];
  if (oked) {
    const r = await query(
      `SELECT code FROM spheres WHERE NOT COALESCE(is_horizontal,false) AND oked_prefixes IS NOT NULL
         AND EXISTS (SELECT 1 FROM unnest(oked_prefixes) p WHERE $1 LIKE p || '%')`, [oked]);
    relSpheres = r.rows.map((x: { code: string }) => x.code);
  }
  const params: unknown[] = [];
  let rel = "false";
  if (oked && relSpheres.length) { params.push(relSpheres); rel = `rr.sphere_code = ANY($${params.length}::text[])`; }
  else if (section) { params.push(section); rel = `$${params.length} = ANY(rr.sections)`; }
  let og = "";
  if (oked) {
    params.push(oked);
    const p = `$${params.length}`;
    og = ` AND (rr.okeds IS NULL OR cardinality(rr.okeds) = 0
      OR EXISTS (SELECT 1 FROM unnest(rr.okeds) o WHERE o LIKE ${p} || '%' OR ${p} LIKE o || '%'))`;
  }
  const counts = await query(
    `SELECT t AS tag, count(*)::int AS n
     FROM requirement_registry rr
     LEFT JOIN spheres s ON s.code = rr.sphere_code, unnest(rr.triggers) t
     WHERE rr.is_canonical AND NOT COALESCE(rr.excluded, false)
       AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')
       AND COALESCE(rr.review_status,'pending') <> 'rejected'
       AND ((COALESCE(s.is_horizontal,false) AND COALESCE(rr.audience,'any')='any') OR ${rel})${og}
     GROUP BY t`, params);
  const byTag: Record<string, number> = {};
  for (const r of counts.rows) byTag[r.tag] = r.n;

  // слой 3: вопросы из условий карточек — top-8 cond-тегов по влиянию на профиль
  const condCounts = await query(
    `SELECT t AS tag, count(*)::int AS n
     FROM requirement_registry rr
     LEFT JOIN spheres s ON s.code = rr.sphere_code, unnest(rr.cond_tags) t
     WHERE rr.is_canonical AND NOT COALESCE(rr.excluded, false)
       AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')
       AND COALESCE(rr.review_status,'pending') <> 'rejected'
       AND ((COALESCE(s.is_horizontal,false) AND COALESCE(rr.audience,'any')='any') OR ${rel})${og}
     GROUP BY t ORDER BY n DESC LIMIT 8`, params);
  const condTags = condCounts.rows.map((r: { tag: string; n: number }) => r.tag);
  const condQ = condTags.length
    ? await query(`SELECT tag, label, hint FROM condition_questions WHERE tag = ANY($1::text[])`, [condTags])
    : { rows: [] as { tag: string; label: string; hint: string | null }[] };
  const condByTag: Record<string, { label: string; hint: string | null }> = {};
  for (const r of condQ.rows) condByTag[r.tag] = { label: r.label, hint: r.hint };
  const condQuestions = condCounts.rows
    .filter((r: { tag: string }) => condByTag[r.tag])
    .map((r: { tag: string; n: number }) => ({
      tag: r.tag, q: condByTag[r.tag].label, hint: condByTag[r.tag].hint || undefined,
      def: false, pack: false, cond: true, count: r.n,
    }));

  const questions = [
    ...pack.map((q) => ({ ...q, pack: true, count: byTag[q.tag] || 0 })),
    ...condQuestions,
    ...QUESTIONS
      .filter((q) => !autoTags.includes(q.tag) && (byTag[q.tag] || 0) > 0)
      .map((q) => ({ ...q, pack: false, count: byTag[q.tag] })),
  ];
  const auto = autoTags.map((t) => ({ tag: t, label: TAG_LABEL[t] || t }));
  return NextResponse.json({ questions, auto });
}
