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

/* ——— Подача НПА ——— */
export const SubmissionBody = z.object({
  ngr: z.string().min(3).max(250),
  npa_title: z.string().max(300).nullish(),
  org_id: z.coerce.number().int().positive(),
  sphere_code: z.string().max(40).nullish(),
  ara_deadline: dateStr.nullish(),
  preview_json: z.unknown().optional(),
});
export const PreviewBody = z.object({ ngr: z.string().min(3).max(250) });

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

/* ——— Пользователи ——— */
export const UserCreateBody = z.object({
  username: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/, "3-64 символа: латиница/цифры/._-"),
  password: z.string().min(8, "минимум 8 символов").max(128),
  email: z.string().email("некорректный email").max(160).nullish()
    .or(z.literal("").transform(() => null)),
  fullName: z.string().max(150).nullish(),
  role: z.enum(["admin", "moderator", "expert"]).default("expert"),
  assigned_spheres: z.array(z.string().max(40)).max(50).default([]),
  assigned_authorities: z.array(z.string().max(40)).max(50).default([]),
  assigned_orgs: z.array(z.coerce.number().int().positive()).max(50).default([]),
});
export const UserToggleBody = z.object({
  userId: z.coerce.number().int().positive(),
  isActive: z.boolean().optional(),
  email: z.string().email("некорректный email").max(160).nullable()
    .or(z.literal("").transform(() => null)).optional(),
}).refine((b) => b.isActive !== undefined || b.email !== undefined,
  { message: "нужно передать isActive и/или email" });
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
