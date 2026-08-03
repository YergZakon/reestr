import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — снапшот демонстрационной витрины (только admin).
 * Все агрегаты считаются одним заходом и кэшируются в памяти процесса на 10 минут:
 * страница-витрина не выполняет тяжёлых запросов в момент показа (ТЗ ФТ-3).
 * Денежные оценки (SCM, % ВВП) на витрину сознательно НЕ отдаются (решение 2026-08-03).
 */

const ACTIVE = `NOT COALESCE(rr.excluded,false) AND (rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')`;
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: unknown } | null = null;

// профили экрана «Цена входа»: ОКЭД-префиксы адресных требований
const PROFILES: [string, string[]][] = [
  ["Кафе", ["56"]], ["Аптека", ["4773"]], ["Грузоперевозки", ["4941"]],
  ["Стройподряд", ["41", "42", "43"]], ["Ферма (КРС)", ["014"]], ["СТО", ["452"]],
  ["Детский сад", ["8891"]], ["Салон красоты", ["96"]], ["Мини-пекарня", ["107"]],
  ["АЗС", ["473"]],
];

async function buildSnapshot() {
  const one = async (sql: string) => (await query(sql)).rows;

  const totals = (await one(`
    SELECT count(*)::int AS req,
           count(*) FILTER (WHERE rr.dup_group_id IS NULL)::int AS uniq,
           count(DISTINCT rr.ngr)::int AS npa,
           count(*) FILTER (WHERE rr.is_permit)::int AS permits
    FROM requirement_registry rr WHERE ${ACTIVE}`))[0];

  const cleanup = (await one(`
    SELECT count(*) FILTER (WHERE COALESCE(excluded,false))::int AS excluded,
           count(*) FILTER (WHERE npa_status = 'утратил силу')::int AS repealed
    FROM requirement_registry`))[0];

  const dups = (await one(`
    SELECT count(DISTINCT dup_group_id)::int AS groups, count(*)::int AS reqs
    FROM requirement_registry rr WHERE ${ACTIVE} AND dup_group_id IS NOT NULL`))[0];

  const ara = (await one(`
    SELECT count(*) FILTER (WHERE ara_deadline <= now() + interval '90 days')::int AS d90,
           count(*) FILTER (WHERE ara_deadline <= now() + interval '12 months')::int AS m12,
           count(*)::int AS total
    FROM requirement_registry rr WHERE ${ACTIVE} AND ara_deadline IS NOT NULL`))[0];

  const counts = (await one(`
    SELECT count(*)::int AS spheres,
           (SELECT count(*)::int FROM organizations WHERE active AND parent_id IS NULL) AS organs
    FROM spheres`))[0];

  const topInd = await one(`
    SELECT COALESCE(s.name_ru, rr.sphere_code, '—') AS name, count(*)::int AS v
    FROM requirement_registry rr LEFT JOIN spheres s ON s.code = rr.sphere_code
    WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);

  const topAuth = await one(`
    WITH RECURSIVE roots AS (
      SELECT id, code, name_ru AS root_name FROM organizations WHERE parent_id IS NULL
      UNION ALL
      SELECT c.id, c.code, r.root_name FROM organizations c JOIN roots r ON c.parent_id = r.id)
    SELECT r.root_name AS name, count(*)::int AS v
    FROM requirement_registry rr JOIN roots r ON r.code = rr.authority_code
    WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);

  const regions = await one(`
    SELECT replace(o.name_ru, 'Акимат ', '') AS name, count(*)::int AS v
    FROM requirement_registry rr
    JOIN organizations o ON o.code = rr.authority_code AND o.type IN ('akimat','akimat_dept')
    WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);

  const audience = await one(`
    SELECT CASE COALESCE(subject_category, '—')
             WHEN 'business' THEN 'Бизнес в целом'
             WHEN 'specialist' THEN 'Специалисты'
             WHEN 'government' THEN 'Госсектор'
             WHEN 'citizen' THEN 'Граждане-услугополучатели'
             WHEN 'other' THEN 'Отдельные категории'
             ELSE 'Без категории' END AS name, count(*)::int AS v
    FROM requirement_registry rr WHERE ${ACTIVE}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 4`);

  // весы: включено в реестр / исключено — по месяцам (последние 8)
  const months = await one(`
    WITH m AS (SELECT generate_series(date_trunc('month', now()) - interval '7 months',
                                      date_trunc('month', now()), interval '1 month') AS mo)
    SELECT to_char(m.mo, 'MM.YY') AS name,
           (SELECT count(*)::int FROM requirement_registry rr
             WHERE date_trunc('month', rr.created_at) = m.mo AND ${ACTIVE}) AS added,
           (SELECT count(*)::int FROM requirement_registry rr
             WHERE date_trunc('month', rr.excluded_at) = m.mo) AS removed
    FROM m ORDER BY m.mo`);

  const profiles = [];
  for (const [name, prefixes] of PROFILES) {
    const r = (await query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE rr.is_permit)::int AS permits,
             count(*) FILTER (WHERE rr.stages && ARRAY['planning','registration','pre_launch','launch'])::int AS start,
             count(*) FILTER (WHERE rr.stages && ARRAY['operation','reporting'])::int AS annual,
             count(*) FILTER (WHERE rr.stages && ARRAY['planning'])::int AS s_plan,
             count(*) FILTER (WHERE rr.stages && ARRAY['registration'])::int AS s_reg,
             count(*) FILTER (WHERE rr.stages && ARRAY['pre_launch','launch'])::int AS s_launch,
             count(*) FILTER (WHERE rr.stages && ARRAY['operation'])::int AS s_work,
             count(*) FILTER (WHERE rr.stages && ARRAY['reporting'])::int AS s_report,
             count(*) FILTER (WHERE rr.stages && ARRAY['closure','suspension'])::int AS s_close
      FROM requirement_registry rr
      WHERE ${ACTIVE} AND EXISTS (
        SELECT 1 FROM unnest(rr.okeds) o WHERE ${prefixes.map((_, i) => `o LIKE $${i + 1} || '%'`).join(" OR ")})`,
      prefixes)).rows[0];
    profiles.push({ name, ...r });
  }

  const ai = (await one(`SELECT count(*)::int AS n FROM business_conclusion_cache`))[0];

  return {
    at: new Date().toISOString().slice(0, 10),
    totals, cleanup, dups, ara, counts, topInd, topAuth, regions, audience, months, profiles,
    service: { ai: ai.n, profilesTotal: 34 },
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Витрина доступна только администратору" }, { status: 403 });

  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.data);
  const data = await buildSnapshot();
  cache = { at: Date.now(), data };
  return NextResponse.json(data);
}
