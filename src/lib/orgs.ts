import { query } from "./db";

/**
 * Узлы органов, которыми модератор вправе управлять: его moderator-узлы + все потомки
 * (рекурсивный CTE по organizations.parent_id). Admin — без ограничений (проверять отдельно).
 */
export async function moderatorScopeOrgIds(userId: number): Promise<number[]> {
  const r = await query(
    `WITH RECURSIVE sub AS (
       SELECT o.id FROM organizations o
         JOIN user_orgs uo ON uo.org_id = o.id
        WHERE uo.user_id = $1 AND uo.org_role = 'moderator'
       UNION
       SELECT c.id FROM organizations c JOIN sub ON c.parent_id = sub.id
     ) SELECT id FROM sub`,
    [userId],
  );
  return r.rows.map((x) => x.id as number);
}
