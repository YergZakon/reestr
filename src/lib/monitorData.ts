import { query } from "@/lib/db";

/**
 * Сбор данных панели мониторинга МНЭ. Общий для JSON-панели (/api/admin/monitor)
 * и Excel-выгрузки (/api/admin/monitor/export) — числа в файле и на экране
 * обязаны совпадать, поэтому запросы живут в одном месте.
 *
 * База отбора действующих — как в очереди ревью (дубли входят, исключённые
 * и утратившие силу — нет); агрегация по корневому органу (org_root CTE).
 */

const ACTIVE = `NOT COALESCE(rr.excluded,false)
  AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`;

const ORG_ROOT = `
  WITH RECURSIVE org_root AS (
    SELECT id, id AS root_id, code, name_ru, short_name, parent_id
      FROM organizations WHERE parent_id IS NULL
    UNION ALL
    SELECT o.id, r.root_id, o.code, o.name_ru, o.short_name, o.parent_id
      FROM organizations o JOIN org_root r ON o.parent_id = r.id
  )`;

export async function buildMonitorData() {
  const kpi = (await query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE COALESCE(rr.review_status,'pending')='pending')::int AS pending,
      count(*) FILTER (WHERE rr.review_status='confirmed')::int AS confirmed,
      count(*) FILTER (WHERE rr.review_status='rejected')::int AS rejected,
      count(*) FILTER (WHERE rr.review_status='edited')::int AS edited,
      count(*) FILTER (WHERE rr.ara_status='в реестре')::int AS in_registry,
      count(*) FILTER (WHERE NOT rr.is_canonical)::int AS dupes,
      count(DISTINCT rr.ngr)::int AS npa_count
    FROM requirement_registry rr WHERE ${ACTIVE}`)).rows[0];

  const users = (await query(`
    SELECT
      count(*) FILTER (WHERE role='moderator')::int AS moderators,
      count(*) FILTER (WHERE role='expert')::int AS analysts,
      count(*) FILTER (WHERE role='expert' AND is_active)::int AS analysts_active,
      count(*) FILTER (WHERE role='moderator' AND is_active)::int AS moderators_active
    FROM users`)).rows[0];

  const subs = (await query(`
    SELECT count(*) FILTER (WHERE submitted_by IS NOT NULL)::int AS by_users,
           count(*) FILTER (WHERE submitted_by IS NULL)::int AS by_system,
           count(*) FILTER (WHERE submitted_by IS NOT NULL AND status='parsed')::int AS parsed,
           count(*) FILTER (WHERE submitted_by IS NOT NULL AND status='error')::int AS failed,
           COALESCE(sum(cards_created) FILTER (WHERE submitted_by IS NOT NULL),0)::int AS cards,
           count(DISTINCT submitted_by)::int AS submitters,
           count(*) FILTER (WHERE submitted_by IS NOT NULL
                              AND created_at > now() - interval '7 days')::int AS last7
    FROM npa_submission`)).rows[0];

  const byOrg = (await query(`${ORG_ROOT},
    req AS (
      SELECT r.root_id,
             count(*)::int AS total,
             count(*) FILTER (WHERE COALESCE(rr.review_status,'pending')='pending')::int AS pending,
             count(*) FILTER (WHERE rr.review_status='confirmed')::int AS confirmed,
             count(*) FILTER (WHERE rr.review_status='rejected')::int AS rejected,
             count(*) FILTER (WHERE rr.review_status='edited')::int AS edited,
             count(*) FILTER (WHERE NOT rr.is_canonical)::int AS dupes,
             count(DISTINCT rr.ngr)::int AS npa
        FROM requirement_registry rr JOIN org_root r ON r.code = rr.authority_code
       WHERE ${ACTIVE}
       GROUP BY r.root_id
    ),
    usr AS (
      SELECT r.root_id,
             count(DISTINCT u.id) FILTER (WHERE u.role='moderator' AND u.is_active)::int AS moderators,
             count(DISTINCT u.id) FILTER (WHERE u.role='expert' AND u.is_active)::int AS analysts
        FROM user_orgs uo
        JOIN org_root r ON r.id = uo.org_id
        JOIN users u ON u.id = uo.user_id
       GROUP BY r.root_id
    ),
    sub AS (
      SELECT r.root_id, count(*)::int AS submissions
        FROM npa_submission s JOIN org_root r ON r.id = s.org_id
       WHERE s.submitted_by IS NOT NULL
       GROUP BY r.root_id
    )
    SELECT o.id AS org_id, o.code, COALESCE(o.short_name, o.name_ru) AS name,
           COALESCE(u.moderators,0) AS moderators, COALESCE(u.analysts,0) AS analysts,
           COALESCE(rq.total,0) AS total, COALESCE(rq.pending,0) AS pending,
           COALESCE(rq.confirmed,0) AS confirmed, COALESCE(rq.rejected,0) AS rejected,
           COALESCE(rq.edited,0) AS edited, COALESCE(rq.dupes,0) AS dupes, COALESCE(rq.npa,0) AS npa,
           COALESCE(sb.submissions,0) AS submissions
      FROM organizations o
      LEFT JOIN req rq ON rq.root_id = o.id
      LEFT JOIN usr u ON u.root_id = o.id
      LEFT JOIN sub sb ON sb.root_id = o.id
     WHERE o.parent_id IS NULL
       AND (COALESCE(rq.total,0) > 0 OR COALESCE(u.moderators,0) + COALESCE(u.analysts,0) > 0)
     ORDER BY COALESCE(rq.total,0) DESC`)).rows;

  const reviewers = (await query(`${ORG_ROOT}
    SELECT u.id, u.username, COALESCE(u.full_name,'') AS full_name, u.role, u.is_active,
           (SELECT COALESCE(r.short_name, r.name_ru) FROM user_orgs uo
              JOIN org_root ro ON ro.id = uo.org_id
              JOIN organizations r ON r.id = ro.root_id
             WHERE uo.user_id = u.id LIMIT 1) AS org,
           count(*) FILTER (WHERE rr.review_status='confirmed')::int AS confirmed,
           count(*) FILTER (WHERE rr.review_status='rejected')::int AS rejected,
           count(*) FILTER (WHERE rr.review_status='edited')::int AS edited,
           count(*)::int AS total,
           max(rr.reviewed_at) AS last_at
      FROM requirement_registry rr JOIN users u ON u.id = rr.reviewed_by
     WHERE rr.reviewed_by IS NOT NULL
     GROUP BY u.id, u.username, u.full_name, u.role, u.is_active
     ORDER BY total DESC`)).rows;

  const submissions = (await query(`${ORG_ROOT}
    SELECT s.id, s.ngr, s.npa_title, s.status, s.cards_created, s.created_at,
           u.username AS submitted_by,
           COALESCE(o.short_name, o.name_ru) AS org_name,
           COALESCE(ro.short_name, ro.name_ru) AS root_name
      FROM npa_submission s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      LEFT JOIN org_root r ON r.id = s.org_id
      LEFT JOIN organizations ro ON ro.id = r.root_id
     WHERE s.submitted_by IS NOT NULL
     ORDER BY s.created_at DESC
     LIMIT 300`)).rows;

  const submitters = (await query(`${ORG_ROOT}
    SELECT u.username, COALESCE(u.full_name,'') AS full_name,
           COALESCE(ro.short_name, ro.name_ru) AS org,
           count(*)::int AS submissions,
           COALESCE(sum(s.cards_created),0)::int AS cards,
           max(s.created_at) AS last_at
      FROM npa_submission s
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN org_root r ON r.id = s.org_id
      LEFT JOIN organizations ro ON ro.id = r.root_id
     GROUP BY u.username, u.full_name, ro.short_name, ro.name_ru
     ORDER BY submissions DESC`)).rows;

  return { kpi, users, subs, byOrg, reviewers, submissions, submitters };
}
