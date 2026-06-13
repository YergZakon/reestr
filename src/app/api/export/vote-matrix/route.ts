import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, initDB } from "@/lib/db";
import { computeGoldLabel } from "@/lib/agreement";

export const dynamic = "force-dynamic";

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(req: NextRequest) {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    const sphere = url.searchParams.get("sphere");
    const category = url.searchParams.get("category");
    const minVotes = parseInt(url.searchParams.get("min_votes") || "0");
    const iterationId = url.searchParams.get("iteration_id");

    // Get active experts
    const expertsResult = await query(
      "SELECT id, username FROM users WHERE role = 'expert' AND is_active = true ORDER BY id"
    );
    const experts = expertsResult.rows as { id: number; username: string }[];

    // Build filters
    let where = "WHERE r.admin_status = 'active'";
    const params: unknown[] = [];
    let idx = 1;

    if (sphere) {
      where += ` AND r.sphere = $${idx}`;
      params.push(sphere);
      idx++;
    }
    if (category) {
      where += ` AND r.category = $${idx}`;
      params.push(category);
      idx++;
    }
    if (iterationId) {
      where += ` AND r.iteration_id = $${idx}`;
      params.push(parseInt(iterationId));
      idx++;
    }

    // Fetch requirements
    const reqResult = await query(
      `SELECT r.id, r.external_id, r.category, r.text_original, r.text_summary,
              r.article_ref, r.subject, COALESCE(r.sphere, 'land') as sphere,
              n.title as npa_title
       FROM requirements r
       LEFT JOIN npa_documents n ON n.id = r.npa_document_id
       ${where}
       ORDER BY r.id`,
      params
    );

    // Fetch all votes
    let voteWhere = "WHERE r.admin_status = 'active'";
    const voteParams: unknown[] = [];
    let vIdx = 1;
    if (sphere) {
      voteWhere += ` AND r.sphere = $${vIdx}`;
      voteParams.push(sphere);
      vIdx++;
    }
    if (category) {
      voteWhere += ` AND r.category = $${vIdx}`;
      voteParams.push(category);
      vIdx++;
    }
    if (iterationId) {
      voteWhere += ` AND ev.iteration_id = $${vIdx}`;
      voteParams.push(parseInt(iterationId));
      vIdx++;
    }

    // Only count votes from active experts for consistency
    const activeExpertIds = experts.map((e) => e.id);
    if (activeExpertIds.length > 0) {
      voteWhere += ` AND ev.user_id IN (${activeExpertIds.join(",")})`;
    }

    const votesResult = await query(
      `SELECT ev.requirement_id, ev.user_id, ev.vote
       FROM expert_votes ev
       JOIN requirements r ON r.id = ev.requirement_id
       ${voteWhere}
       ORDER BY ev.requirement_id, ev.user_id`,
      voteParams
    );

    // Build vote lookup: req_id -> { user_id -> vote }
    const voteLookup = new Map<number, Map<number, string>>();
    for (const v of votesResult.rows) {
      if (!voteLookup.has(v.requirement_id)) voteLookup.set(v.requirement_id, new Map());
      voteLookup.get(v.requirement_id)!.set(v.user_id, v.vote);
    }

    // Build matrix rows
    const rows = [];
    for (const r of reqResult.rows) {
      const reqVotes = voteLookup.get(r.id);
      const votesList = reqVotes ? Array.from(reqVotes.values()).map((v) => ({ vote: v })) : [];
      const totalVotes = votesList.length;

      if (minVotes > 0 && totalVotes < minVotes) continue;

      const gl = computeGoldLabel(r.id, votesList, { majorityThreshold: 0.75, minVotes: 3 });

      const row: Record<string, unknown> = {
        requirement_id: r.id,
        external_id: r.external_id,
        category: r.category,
        text: r.text_original,
        summary: r.text_summary,
        article_ref: r.article_ref,
        subject: r.subject,
        sphere: r.sphere,
        npa_title: r.npa_title,
      };

      for (const expert of experts) {
        row[expert.username] = reqVotes?.get(expert.id) || "";
      }

      row.gold_label = gl.label;
      row.gold_confidence = gl.gold_confidence;
      row.agreement_ratio = gl.agreement_ratio;
      row.total_votes = totalVotes;

      rows.push(row);
    }

    const date = new Date().toISOString().split("T")[0];

    if (format === "json") {
      return new NextResponse(
        JSON.stringify({
          metadata: {
            exportedAt: new Date().toISOString(),
            totalRequirements: rows.length,
            experts: experts.map((e) => e.username),
            filters: { sphere, category, minVotes, iterationId },
          },
          data: rows,
        }, null, 2),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename=vote_matrix_${date}.json`,
          },
        }
      );
    }

    // CSV
    const headers = [
      "requirement_id", "external_id", "category", "text", "summary",
      "article_ref", "subject", "sphere", "npa_title",
      ...experts.map((e) => e.username),
      "gold_label", "gold_confidence", "agreement_ratio", "total_votes",
    ];

    let csv = "\uFEFF" + headers.join(";") + "\n";
    for (const row of rows) {
      csv += headers.map((h) => escapeCSV(String(row[h] ?? ""))).join(";") + "\n";
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=vote_matrix_${date}.csv`,
      },
    });
  } catch (error) {
    console.error("Vote matrix error:", error);
    return NextResponse.json({ error: "Ошибка сервера", details: String(error) }, { status: 500 });
  }
}
