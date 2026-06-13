import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, initDB } from "@/lib/db";

export const dynamic = "force-dynamic";

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r") || str.includes(";")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(req: NextRequest) {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    const sphere = url.searchParams.get("sphere");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status") || "active";

    let where = "WHERE r.admin_status = $1";
    const params: unknown[] = [status];
    let paramIdx = 2;

    if (sphere) {
      where += ` AND r.sphere = $${paramIdx}`;
      params.push(sphere);
      paramIdx++;
    }
    if (category) {
      where += ` AND r.category = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }

    const result = await query(
      `SELECT r.id, r.external_id, r.category, r.text_original, r.text_summary,
              r.article_ref, r.subject, r.admin_status,
              n.title as npa_title, COALESCE(r.sphere, 'land') as sphere,
              COUNT(v.id) FILTER (WHERE v.vote = 'confirm') as confirms,
              COUNT(v.id) FILTER (WHERE v.vote = 'reject') as rejects,
              COUNT(v.id) FILTER (WHERE v.vote = 'uncertain') as uncertain,
              COUNT(v.id) as total_votes
       FROM requirements r
       LEFT JOIN npa_documents n ON n.id = r.npa_document_id
       LEFT JOIN expert_votes v ON v.requirement_id = r.id
       ${where}
       GROUP BY r.id, r.external_id, r.category, r.text_original, r.text_summary,
                r.article_ref, r.subject, r.admin_status, n.title, r.sphere
       ORDER BY r.id`,
      params
    );

    const rows = result.rows;
    const date = new Date().toISOString().split("T")[0];

    if (format === "json") {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename=export_requirements_${date}.json`,
        },
      });
    }

    const headers = [
      "ID", "External_ID", "Категория", "Текст", "Резюме",
      "Статья", "Субъект", "НПА", "Сфера", "Статус",
      "Подтверждено", "Отклонено", "Не уверен", "Всего голосов",
    ];

    let csv = "\uFEFF" + headers.join(";") + "\n";

    for (const row of rows) {
      csv += [
        row.id,
        escapeCSV(row.external_id),
        escapeCSV(row.category),
        escapeCSV(row.text_original),
        escapeCSV(row.text_summary),
        escapeCSV(row.article_ref),
        escapeCSV(row.subject),
        escapeCSV(row.npa_title),
        escapeCSV(row.sphere),
        escapeCSV(row.admin_status),
        row.confirms,
        row.rejects,
        row.uncertain,
        row.total_votes,
      ].join(";") + "\n";
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=export_requirements_${date}.csv`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 }
    );
  }
}
