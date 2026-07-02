// Часовой notif-тик воркера: генерация уведомлений органам + email-рассылка.
// Генерация идемпотентна (dedup_key UNIQUE), ключи СОВМЕСТИМЫ с резервным
// python-генератором (scripts/registry/generate_notifications.py):
//   new_pending:{authority}:{ISO-неделя} · ara_soon:{authority}:{YYYY-MM}
// Письма — активным пользователям с email, чей скоуп покрывает орган
// (user_authorities ∪ поддеревья user_orgs); отметка email_sent_at ставится
// всегда (нет получателей/SMTP выключен — чтобы очередь не копилась).
import { query } from "@/lib/db";
import { sendMail, mailEnabled } from "./mailer";

const APP_URL = "https://reestr-web-production.up.railway.app/registry";

function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function generate(): Promise<number> {
  const week = isoWeek();
  // новые pending за 7 дней — сводкой по органу
  const np = await query(`
    SELECT authority_code, count(*)::int AS n, min(created_at)::date AS since
    FROM requirement_registry
    WHERE review_status='pending' AND is_canonical AND NOT COALESCE(excluded,false)
      AND authority_code IS NOT NULL AND created_at >= now() - interval '7 days'
    GROUP BY authority_code`);
  // приближение сроков АРА (6 мес) — по органу и месяцу дедлайна
  const ara = await query(`
    SELECT authority_code, to_char(ara_deadline,'YYYY-MM') AS ym, count(*)::int AS n, min(ara_deadline) AS nearest
    FROM requirement_registry
    WHERE review_status='confirmed' AND ara_deadline IS NOT NULL
      AND is_canonical AND NOT COALESCE(excluded,false) AND authority_code IS NOT NULL
      AND ara_deadline BETWEEN current_date AND current_date + interval '6 months'
    GROUP BY 1, 2`);

  let inserted = 0;
  for (const r of np.rows) {
    const res = await query(
      `INSERT INTO notifications (authority_code, type, dedup_key, title, payload)
       VALUES ($1,'new_pending',$2,$3,$4::jsonb) ON CONFLICT (dedup_key) DO NOTHING`,
      [r.authority_code, `new_pending:${r.authority_code}:${week}`,
       `Новые требования на подтверждение: ${r.n}`,
       JSON.stringify({ count: r.n, since: String(r.since), window_days: 7 })]);
    inserted += res.rowCount || 0;
  }
  for (const r of ara.rows) {
    const res = await query(
      `INSERT INTO notifications (authority_code, type, dedup_key, title, payload)
       VALUES ($1,'ara_soon',$2,$3,$4::jsonb) ON CONFLICT (dedup_key) DO NOTHING`,
      [r.authority_code, `ara_soon:${r.authority_code}:${r.ym}`,
       `Срок АРА в ${r.ym}: ${r.n} требований (ближайший ${r.nearest})`,
       JSON.stringify({ count: r.n, month: r.ym, nearest: String(r.nearest), horizon_months: 6 })]);
    inserted += res.rowCount || 0;
  }
  return inserted;
}

/** Email активных пользователей, чей скоуп покрывает орган. */
async function recipientsFor(authority: string): Promise<string[]> {
  const r = await query(`
    WITH RECURSIVE org_users AS (
      SELECT uo.user_id, o.id, o.code FROM user_orgs uo JOIN organizations o ON o.id = uo.org_id
      UNION
      SELECT ou.user_id, c.id, c.code FROM organizations c JOIN org_users ou ON c.parent_id = ou.id)
    SELECT DISTINCT u.email FROM users u
    WHERE u.is_active AND u.email IS NOT NULL AND (
      EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = u.id AND ua.authority_code = $1)
      OR EXISTS (SELECT 1 FROM org_users ou WHERE ou.user_id = u.id AND ou.code = $1))`,
    [authority]);
  return r.rows.map((x) => x.email as string);
}

async function sendPending(): Promise<void> {
  const unsent = await query(
    `SELECT id, authority_code, type, title, payload FROM notifications
     WHERE email_sent_at IS NULL ORDER BY created_at LIMIT 50`);
  for (const n of unsent.rows) {
    let ok = false;
    if (mailEnabled()) {
      const to = await recipientsFor(n.authority_code);
      if (to.length) {
        const body =
          `${n.title}\n\nОрган: ${n.authority_code}\n` +
          `Откройте очередь ревью: ${APP_URL} (режим «Ревью»)\n\n` +
          `Письмо сформировано автоматически Реестром обязательных требований.`;
        ok = await sendMail(to, `[Реестр требований] ${n.title}`, body);
        if (ok) console.log(`[mail] ${n.type} → ${n.authority_code}: отправлено ${to.length} адресатам`);
      }
    }
    // отметка ставится всегда — канал кабинета остаётся основным, очередь не копится
    await query("UPDATE notifications SET email_sent_at = now() WHERE id = $1", [n.id]);
    void ok;
  }
}

let busy = false;
export async function notifyTick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const n = await generate();
    if (n) console.log(`[notify] новых уведомлений: ${n}`);
    await sendPending();
  } catch (e) {
    console.error("[notify] тик упал:", (e as Error).message);
  } finally {
    busy = false;
  }
}
