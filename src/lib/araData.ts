import { query } from "@/lib/db";

/**
 * Расчётный слой блока АРА (план 2026-08-20): пять групп сроков по актам
 * (v_npa_ara_status), разрез по корневым органам, список актов с живым циклом.
 * Общий для /api/ara/* и обновлённого блока АРА в /api/dashboard.
 */

export const ORG_ROOT = `
  WITH RECURSIVE org_root AS (
    SELECT id, id AS root_id, code, name_ru, short_name, parent_id
      FROM organizations WHERE parent_id IS NULL
    UNION ALL
    SELECT o.id, r.root_id, o.code, o.name_ru, o.short_name, o.parent_id
      FROM organizations o JOIN org_root r ON o.parent_id = r.id
  )`;

export interface AraKpi {
  total: number; overdue: number; not_due: number; on_time: number; no_deadline: number;
}

/** Пять групп; scopeCodes — коды органов пользователя (модератор/эксперт), null — всё (МНЭ). */
export async function araKpi(scopeCodes: string[] | null): Promise<AraKpi> {
  const params: unknown[] = [];
  let cond = "";
  if (scopeCodes) {
    params.push(scopeCodes);
    cond = `WHERE v.authority_code = ANY($1::text[])`;
  }
  const r = await query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ara_group = 'overdue')::int AS overdue,
           count(*) FILTER (WHERE ara_group = 'not_due')::int AS not_due,
           count(*) FILTER (WHERE ara_group = 'on_time')::int AS on_time,
           count(*) FILTER (WHERE ara_group = 'no_deadline')::int AS no_deadline
    FROM v_npa_ara_status v ${cond}`, params);
  return r.rows[0];
}

/** Разрез по корневым органам (для МНЭ): свёртка комитетов в министерства. */
export async function araByOrg() {
  const r = await query(`${ORG_ROOT}
    SELECT COALESCE(o.code, '—') AS code,
           COALESCE(COALESCE(o.short_name, o.name_ru), 'Орган не сматчен') AS name,
           count(*)::int AS total,
           count(*) FILTER (WHERE v.ara_group = 'overdue')::int AS overdue,
           count(*) FILTER (WHERE v.ara_group = 'not_due')::int AS not_due,
           count(*) FILTER (WHERE v.ara_group = 'on_time')::int AS on_time,
           count(*) FILTER (WHERE v.ara_group = 'no_deadline')::int AS no_deadline
    FROM v_npa_ara_status v
    LEFT JOIN org_root r ON r.code = v.authority_code
    LEFT JOIN organizations o ON o.id = r.root_id
    GROUP BY o.code, COALESCE(o.short_name, o.name_ru)
    ORDER BY count(*) FILTER (WHERE v.ara_group = 'overdue') DESC, count(*) DESC`);
  return r.rows;
}

/** Акты органа (поддеревом) с живым циклом и счётчиками карточек. */
export async function araActs(opts: {
  authority?: string | null; scopeCodes?: string[] | null;
  group?: string | null; q?: string | null; page?: number; limit?: number; lang?: string;
}) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const params: unknown[] = [];
  const conds: string[] = [];

  if (opts.authority) {
    const sub = await query(
      `WITH RECURSIVE s AS (
         SELECT id, code FROM organizations WHERE code = $1
         UNION ALL SELECT c.id, c.code FROM organizations c JOIN s ON c.parent_id = s.id)
       SELECT code FROM s`, [opts.authority]);
    params.push(sub.rows.length ? sub.rows.map((r) => r.code) : [opts.authority]);
    conds.push(`v.authority_code = ANY($${params.length}::text[])`);
  } else if (opts.scopeCodes) {
    params.push(opts.scopeCodes);
    conds.push(`v.authority_code = ANY($${params.length}::text[])`);
  }
  if (opts.group && ["overdue", "not_due", "on_time", "no_deadline"].includes(opts.group)) {
    params.push(opts.group);
    conds.push(`v.ara_group = $${params.length}`);
  }
  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().replace(/[%_\\]/g, "\\$&")}%`);
    const p = `$${params.length}`;
    conds.push(`(v.npa_title ILIKE ${p} OR v.ngr ILIKE ${p})`);
  }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  const cnt = await query(`SELECT count(*)::int AS n FROM v_npa_ara_status v ${where}`, params);
  const total = cnt.rows[0].n;

  params.push(limit, (page - 1) * limit);
  const kkTitle = opts.lang === "kz" ? "COALESCE(nk.title_kk, v.npa_title)" : "v.npa_title";
  const r = await query(`
    SELECT v.id, v.ngr, v.ext_ref, v.authority_code, ${kkTitle} AS npa_title,
           v.npa_kind, v.deadlines, v.deadline, v.deadline_src, v.deadline_calc,
           v.portal_status, v.ara_group,
           o.short_name AS authority_short, ${opts.lang === "kz" ? "COALESCE(NULLIF(o.name_kz,''), o.name_ru)" : "o.name_ru"} AS authority_name,
           rev.id AS review_id, rev.status AS review_status, rev.conclusion AS review_conclusion,
           rev.deadline_snapshot AS review_deadline,
           (SELECT count(*)::int FROM requirement_registry rr
            WHERE rr.ngr = v.ngr AND rr.authority_code = v.authority_code
              AND NOT COALESCE(rr.excluded,false)
              AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')) AS req_count,
           (SELECT string_agg(u.username, ', ')
            FROM ara_assignment aa JOIN users u ON u.id = aa.assignee_id
            WHERE aa.review_id = rev.id AND aa.status IN ('assigned','accepted','done')) AS assignees
    FROM v_npa_ara_status v
    LEFT JOIN organizations o ON o.code = v.authority_code
    LEFT JOIN npa_title_kk nk ON nk.ngr = v.ngr
    LEFT JOIN ara_review rev ON rev.ara_id = v.id AND rev.status NOT IN ('approved','cancelled')
    ${where}
    ORDER BY (v.ara_group = 'overdue') DESC, v.deadline NULLS LAST, v.id
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

  return { items: r.rows, total, page, pages: Math.ceil(total / limit) };
}
