// Валидация входных данных API (zod) + экранирование LIKE-шаблонов. Б7 (docs/architecture/09).
import { z } from "zod";
import { NextResponse } from "next/server";

/** Экранирует %, _ и \ в пользовательском вводе для ILIKE/LIKE-шаблонов
 *  (иначе «%» от пользователя = full-scan всей таблицы). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

/** Читает и валидирует JSON-тело запроса. При ошибке — готовый 400-ответ. */
export async function zbody<S extends z.ZodType>(
  req: Request, schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: NextResponse }> {
  const raw = await req.json().catch(() => null);
  const p = schema.safeParse(raw);
  if (!p.success) {
    const msg = p.error.issues.slice(0, 3)
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    // диагностика в серверные логи: форма полей (типы, не значения) — ловим
    // «invalid input» случаи, невоспроизводимые статикой (кейс P030000993_)
    const shape = raw && typeof raw === "object"
      ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(
          ([k, v]) => [k, v === null ? "null" : Array.isArray(v) ? "array" : typeof v]))
      : typeof raw;
    console.warn(`[zbody] 400 ${new URL(req.url).pathname}: ${msg} | shape=${JSON.stringify(shape)}`);
    return { ok: false, res: NextResponse.json({ error: `Некорректный запрос — ${msg}` }, { status: 400 }) };
  }
  return { ok: true, data: p.data };
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "формат YYYY-MM-DD");
/** Формат госрегномера НПА (после нормализации ссылки adilet). */
export const NGR_RE = /^[A-Za-z][0-9A-Za-z_-]{4,24}$/;

/* ——— Аутентификация ——— */
export const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

/* ——— Ревью реестра ——— */
export const ReviewBody = z.object({
  action: z.enum(["confirm", "reject", "edit", "include"]),
  id: z.coerce.number().int().positive().optional(),
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500).optional(),
  comment: z.string().max(2000).nullish(),
  ara_deadline: dateStr.optional(),
  fields: z.record(z.string().max(40), z.union([z.string().max(8000), z.null()])).optional(),
}).refine((b) => b.id != null || (b.ids && b.ids.length), { message: "id или ids обязательны" });

/* ——— Админ-управление НПА (перенос/исключение, в т.ч. по статьям) ——— */
export const NpaAdminBody = z.object({
  action: z.enum(["transfer", "exclude", "restore"]),
  ngr: z.string().min(3).max(24),
  // null/отсутствует = весь НПА; массив = выбранные метки статей (rr.article)
  articles: z.array(z.string().min(1).max(160)).min(1).max(200).nullish(),
  target_org_id: z.coerce.number().int().positive().optional(),
  reason: z.string().max(500).nullish(),
}).refine((b) => b.action !== "transfer" || b.target_org_id != null,
  { message: "target_org_id обязателен для transfer" })
  .refine((b) => b.action !== "exclude" || (b.reason && b.reason.trim().length >= 5),
  { message: "причина обязательна для исключения (≥5 символов)" });

/* ——— Подача НПА ——— */
export const SubmissionBody = z.object({
  // coerce: терпим число/иные скаляры от нестандартных клиентов — дальше всё
  // равно нормализация ссылки и проверка NGR_RE в роуте
  ngr: z.coerce.string().min(3).max(250),
  npa_title: z.string().max(300).nullish(),
  org_id: z.coerce.number().int().positive(),
  sphere_code: z.string().max(40).nullish(),
  ara_deadline: dateStr.nullish(),
  preview_json: z.unknown().optional(),
});
export const PreviewBody = z.object({ ngr: z.coerce.string().min(3).max(250) });

/* ——— Справочник организаций ——— */
export const OrgCreateBody = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,30}$/, "код: латиница строчная/цифры/_ (2-30)"),
  parent_id: z.coerce.number().int().positive().nullish(),
  type: z.enum(["ministry", "committee", "department", "agency", "akimat", "akimat_dept"]),
  name_ru: z.string().min(2).max(300),
  short_name: z.string().max(100).nullish(),
  region_code: z.string().max(10).nullish(),
  sphere_codes: z.array(z.string().max(40)).max(20).nullish(),
});
/** Правка узла: переименование и включение/отключение (модератор — в своём поддереве). */
export const OrgUpdateBody = z.object({
  id: z.coerce.number().int().positive(),
  name_ru: z.string().min(2).max(300).optional(),
  short_name: z.string().max(100).nullish(),
  active: z.boolean().optional(),
}).refine((b) => b.name_ru !== undefined || b.short_name !== undefined || b.active !== undefined,
  { message: "нужно передать name_ru, short_name и/или active" });

/* ——— Пользователи ——— */
export const UserCreateBody = z.object({
  username: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/, "3-64 символа: латиница/цифры/._-"),
  password: z.string().min(8, "минимум 8 символов").max(128),
  email: z.string().email("некорректный email").max(160).nullish()
    .or(z.literal("").transform(() => null)),
  fullName: z.string().max(150).nullish(),
  role: z.enum(["admin", "mne", "moderator", "expert"]).default("expert"),
  assigned_spheres: z.array(z.string().max(40)).max(50).default([]),
  assigned_authorities: z.array(z.string().max(40)).max(50).default([]),
  assigned_orgs: z.array(z.coerce.number().int().positive()).max(50).default([]),
});
export const UserToggleBody = z.object({
  userId: z.coerce.number().int().positive(),
  isActive: z.boolean().optional(),
  email: z.string().email("некорректный email").max(160).nullable()
    .or(z.literal("").transform(() => null)).optional(),
  password: z.string().min(8, "минимум 8 символов").max(128).optional(),
}).refine((b) => b.isActive !== undefined || b.email !== undefined || b.password !== undefined,
  { message: "нужно передать isActive, email и/или password" });
export const SpheresAssignBody = z.object({ assigned_spheres: z.array(z.string().max(40)).max(100) });
export const AuthoritiesAssignBody = z.object({ assigned_authorities: z.array(z.string().max(40)).max(100) });
export const OrgsAssignBody = z.object({ assigned_orgs: z.array(z.coerce.number().int().positive()).max(100) });

/* ——— Голосование (легаси-контур) ——— */
export const VoteBody = z.object({
  cardId: z.coerce.number().int().positive(),
  vote: z.enum(["confirm", "reject", "uncertain"]),
  comment: z.string().max(2000).nullish(),
});
export const BulkVotesBody = z.object({
  votes: z.array(VoteBody).min(1).max(200),
});

/* ——— Параметры SCM (только admin; ключи — фиксированный whitelist) ——— */
export const CostParamsBody = z.object({
  hours_per_month: z.coerce.number().finite().positive().optional(),
  on_costs: z.coerce.number().finite().nonnegative().max(5).optional(),
  overhead: z.coerce.number().finite().nonnegative().max(5).optional(),
  mult_clerical: z.coerce.number().finite().positive().max(10).optional(),
  mult_specialist: z.coerce.number().finite().positive().max(10).optional(),
  mult_manager: z.coerce.number().finite().positive().max(10).optional(),
  inspector_rate_kzt: z.coerce.number().finite().nonnegative().optional(),
  avg_wage_month: z.coerce.number().finite().nonnegative().optional(),
});
