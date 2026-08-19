import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { escapeLike } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET /api/registry/list — каталог действующих требований.
 * Фасеты (мультивыбор): sphere[], ministry[], stage[]. Плюс q, oked (префикс), sort.
 * Доступ: любой авторизованный. Возвращает items + total + pages + counts (для фасетов).
 */
const SORTS: Record<string, string> = {
  ministry: "rr.ministry NULLS LAST, rr.id",
  sphere: "rr.sphere_code NULLS LAST, rr.id",
  ngr: "rr.ngr NULLS LAST, rr.id",
  id: "rr.id",
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "12", 10)));
  const offset = (page - 1) * limit;

  const conds: string[] = ["NOT COALESCE(rr.excluded, false)", "(rr.npa_status IS NULL OR rr.npa_status <> 'утратил силу')"];
  const params: unknown[] = [];

  const multi = (key: string, col: string) => {
    const vals = sp.getAll(key).filter(Boolean);
    if (vals.length) {
      params.push(vals);
      conds.push(`rr.${col} = ANY($${params.length}::text[])`);
    }
  };
  multi("sphere", "sphere_code");
  multi("ministry", "ministry");

  const stages = sp.getAll("stage").filter(Boolean);
  if (stages.length) {
    params.push(stages);
    conds.push(`rr.stages && $${params.length}::text[]`);
  }

  // ОКЭД-префикс (бизнес-режим): "45.20" → коды, начинающиеся на "4520"
  const oked = sp.get("oked");
  if (oked) {
    const pref = oked.replace(/\./g, "").slice(0, 4);
    params.push(pref + "%");
    conds.push(`EXISTS (SELECT 1 FROM unnest(rr.okeds) o WHERE o LIKE $${params.length})`);
  }

  const q = sp.get("q");
  if (q && q.trim()) {
    params.push(`%${escapeLike(q.trim())}%`);
    const p = `$${params.length}`;
    conds.push(`(rr.title ILIKE ${p} OR rr.canon_text ILIKE ${p} OR rr.legal_text ILIKE ${p} OR rr.action ILIKE ${p} OR rr.ngr ILIKE ${p})`);
  }

  const where = "WHERE " + conds.join(" AND ");

  const countRes = await query(`SELECT COUNT(*) AS cnt FROM requirement_registry rr ${where}`, params);
  const total = parseInt(countRes.rows[0].cnt, 10);

  const order = SORTS[sp.get("sort") || "ministry"] || SORTS.ministry;
  // казахская выдача каталога: переводы requirement_i18n с фолбэком на русский
  const kk = sp.get("lang") === "kz" || sp.get("lang") === "kk";
  const F = kk
    ? `COALESCE(i18.title, rr.title) AS title,
       COALESCE(i18.legal_text, rr.legal_text) AS legal_text,
       COALESCE(i18.canon_text, rr.canon_text) AS canon_text,
       COALESCE(i18.subject, rr.subject) AS subject,
       COALESCE(i18.condition, rr.condition) AS condition,
       COALESCE(s.name_kk, s.name_ru) AS sphere_name`
    : `rr.title, rr.legal_text, rr.canon_text, rr.subject, rr.condition,
       s.name_ru AS sphere_name`;
  const IJ = kk
    ? " LEFT JOIN requirement_i18n i18 ON i18.registry_id = rr.id AND i18.lang = 'kk'" +
      " LEFT JOIN npa_title_kk nk ON nk.ngr = rr.ngr"
    : "";
  params.push(limit, offset);
  const dataSql = `
    SELECT rr.id, rr.ngr, ${kk ? "COALESCE(nk.title_kk, rr.npa_title)" : "rr.npa_title"} AS npa_title, rr.article, rr.ministry, rr.sphere_code,
      rr.okeds, rr.stages, rr.action, rr.object, rr.source, rr.ersop_confirmed,
      rr.norm_url, rr.review_status, rr.ara_status, rr.is_canonical, rr.dup_group_id,
      ${F}
    FROM requirement_registry rr
    LEFT JOIN spheres s ON s.code = rr.sphere_code${IJ}
    ${where}
    ORDER BY ${order}
    LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const result = await query(dataSql, params);

  return NextResponse.json({
    items: result.rows,
    total, page, pages: Math.ceil(total / limit), limit,
  });
}
