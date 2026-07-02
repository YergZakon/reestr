import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query } from "./db";

/** Ленивый fail-fast: секрет обязателен при ПЕРВОМ использовании (подпись/проверка токена),
 *  но не при сборке — `next build` импортирует модули на «Collecting page data», а Railway
 *  не передаёт Variables в build-стадию Dockerfile. Fallback на общеизвестный ключ запрещён. */
function requireJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error(
      "JWT_SECRET не задан. Установите переменную окружения JWT_SECRET (Railway → Variables)."
    );
  }
  return s;
}

export interface UserPayload {
  id: number;
  username: string;
  role: "admin" | "moderator" | "expert";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: UserPayload): string {
  return jwt.sign(user, requireJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): UserPayload | null {
  const secret = requireJwtSecret(); // до try: отсутствие секрета — конфигурационная ошибка, не «невалидный токен»
  try {
    return jwt.verify(token, secret) as UserPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export interface UserPayloadWithSpheres extends UserPayload {
  /** Назначенные сферы. Для admin всегда [] (= нет ограничений). */
  assigned_spheres: string[];
}

export interface UserPayloadWithAccess extends UserPayload {
  /** Назначенные сферы. Для admin всегда [] (= нет ограничений). */
  assigned_spheres: string[];
  /** Назначенные органы. Для admin всегда [] (= нет ограничений). */
  assigned_authorities: string[];
}

/**
 * @deprecated используй getCurrentUserWithAccess() — она отдаёт обе оси (сферы + органы).
 * Оставлена для обратной совместимости.
 */
export async function getCurrentUserWithSpheres(): Promise<UserPayloadWithSpheres | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin") {
    return { ...user, assigned_spheres: [] };
  }
  const result = await query(
    "SELECT sphere_code FROM user_spheres WHERE user_id = $1",
    [user.id],
  );
  return {
    ...user,
    assigned_spheres: result.rows.map((r) => r.sphere_code as string),
  };
}

/**
 * Полный access-context: пользователь + назначенные сферы + назначенные органы.
 *
 * Логика доступа эксперта к карточке:
 *   sphere_code ∈ assigned_spheres  AND  controller_authority ∈ assigned_authorities
 *
 * Для admin обе оси пусты ([]) — означает нет ограничений.
 *
 * Используется в:
 *   - /api/cards/list (двойной фильтр)
 *   - /api/cards/vote (двойная проверка перед UPSERT)
 *   - /api/auth/me (отдать клиенту для UI)
 *
 * JWT не содержит сферы/органы намеренно — иначе при смене админом юзер
 * должен перелогиниться чтобы изменения вступили в силу.
 */
export async function getCurrentUserWithAccess(): Promise<UserPayloadWithAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin") {
    return { ...user, assigned_spheres: [], assigned_authorities: [] };
  }
  const [s, a, o] = await Promise.all([
    query("SELECT sphere_code FROM user_spheres WHERE user_id = $1", [user.id]),
    query("SELECT authority_code FROM user_authorities WHERE user_id = $1", [user.id]),
    // орг-скоуп: узлы органа пользователя + все потомки (рекурсивный CTE) → их коды.
    // Коды министерств = requirement_registry.authority_code, поэтому объединяем с legacy user_authorities.
    query(
      `WITH RECURSIVE sub AS (
         SELECT o.id, o.code FROM organizations o JOIN user_orgs uo ON uo.org_id = o.id WHERE uo.user_id = $1
         UNION
         SELECT c.id, c.code FROM organizations c JOIN sub ON c.parent_id = sub.id
       ) SELECT code FROM sub`,
      [user.id],
    ).catch(() => ({ rows: [] as { code: string }[] })),
  ]);
  const authorities = new Set<string>([
    ...a.rows.map((r) => r.authority_code as string),
    ...o.rows.map((r) => r.code as string),
  ]);
  return {
    ...user,
    assigned_spheres: s.rows.map((r) => r.sphere_code as string),
    assigned_authorities: Array.from(authorities),
  };
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<UserPayload | null> {
  const result = await query(
    "SELECT id, username, password_hash, role FROM users WHERE username = $1 AND is_active = true",
    [username]
  );
  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  // Log activity
  await query(
    "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
    [user.id, "login", JSON.stringify({ ip: "server" })]
  );

  return { id: user.id, username: user.username, role: user.role };
}
