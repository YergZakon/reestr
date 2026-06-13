/**
 * GET /api/cards/quality
 *
 * Метрики согласованности экспертов по требованиям-карточкам:
 *   - Fleiss' kappa (overall + по сферам + по role_fragment)
 *   - Cohen's kappa попарно
 *   - Per-expert: распределение голосов, agreement with consensus, bias indicator
 *
 * Query params: sphere, role_fragment
 *
 * Источник данных: card_votes JOIN requirement_cards (новая модель), а не expert_votes/requirements.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { computeAllMetrics, VoteRow } from "@/lib/agreement";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin")
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const url = new URL(req.url);
    const sphere = url.searchParams.get("sphere");
    const roleFragment = url.searchParams.get("role_fragment");

    let where = "WHERE rc.is_canonical = true";
    const params: unknown[] = [];
    let idx = 1;

    if (sphere) {
      where += ` AND rc.sphere_code = $${idx}`;
      params.push(sphere);
      idx++;
    }
    if (roleFragment) {
      where += ` AND rc.role_fragment = $${idx}`;
      params.push(roleFragment);
      idx++;
    }

    const result = await query(
      `SELECT cv.card_id AS requirement_id,
              cv.user_id,
              u.username,
              cv.vote,
              COALESCE(rc.role_fragment, 'unknown') AS category,
              rc.sphere_code AS sphere
       FROM card_votes cv
       JOIN requirement_cards rc ON rc.id = cv.card_id
       JOIN users u ON u.id = cv.user_id
       ${where}
       ORDER BY cv.card_id, cv.user_id`,
      params,
    );

    const votes: VoteRow[] = result.rows;

    if (votes.length === 0) {
      return NextResponse.json({
        fleissKappa: 0,
        fleissKappaInterpretation: "insufficient_data",
        percentAgreement: 0,
        itemCount: 0,
        raterCount: 0,
        byCategory: {},
        bySphere: {},
        pairwiseKappa: [],
        heatmap: { users: [], matrix: [] },
        expertStats: [],
      });
    }

    const metrics = computeAllMetrics(votes);

    // expert names
    const usersResult = await query(
      "SELECT username, full_name FROM users WHERE role = 'expert' AND is_active = true",
    );
    const nameMap = new Map<string, string>();
    for (const u of usersResult.rows) {
      nameMap.set(u.username, u.full_name || u.username);
    }

    // Per-expert distribution
    const expertMap = new Map<string, { votes: string[]; fullName: string }>();
    for (const v of votes) {
      if (!expertMap.has(v.username)) {
        expertMap.set(v.username, {
          votes: [],
          fullName: nameMap.get(v.username) || v.username,
        });
      }
      expertMap.get(v.username)!.votes.push(v.vote);
    }

    // Consensus per card (majority)
    const byReq = new Map<number, string[]>();
    for (const v of votes) {
      if (!byReq.has(v.requirement_id)) byReq.set(v.requirement_id, []);
      byReq.get(v.requirement_id)!.push(v.vote);
    }
    const consensus = new Map<number, string>();
    byReq.forEach((reqVotes, reqId) => {
      const counts: Record<string, number> = {};
      for (const v of reqVotes) counts[v] = (counts[v] || 0) + 1;
      const maxEntry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      consensus.set(reqId, maxEntry[0]);
    });

    // Per-expert votes by card
    const expertVotesByReq = new Map<string, Map<number, string>>();
    for (const v of votes) {
      if (!expertVotesByReq.has(v.username))
        expertVotesByReq.set(v.username, new Map());
      expertVotesByReq.get(v.username)!.set(v.requirement_id, v.vote);
    }

    const expertStats = [];
    const usernames = Array.from(expertMap.keys());
    for (const username of usernames) {
      const data = expertMap.get(username)!;
      const total = data.votes.length;
      const distribution: Record<string, number> = { confirm: 0, reject: 0, uncertain: 0 };
      for (const v of data.votes) distribution[v] = (distribution[v] || 0) + 1;

      const expertReqVotes = expertVotesByReq.get(username)!;
      let agreeCount = 0;
      let totalCompared = 0;
      expertReqVotes.forEach((vote, reqId) => {
        const cons = consensus.get(reqId);
        if (cons) {
          totalCompared++;
          if (vote === cons) agreeCount++;
        }
      });

      expertStats.push({
        username,
        fullName: data.fullName,
        totalVotes: total,
        distribution,
        biasIndicator: {
          confirmRate: total > 0 ? distribution.confirm / total : 0,
          rejectRate: total > 0 ? distribution.reject / total : 0,
          uncertainRate: total > 0 ? distribution.uncertain / total : 0,
        },
        agreementWithConsensus: totalCompared > 0 ? agreeCount / totalCompared : 0,
      });
    }

    return NextResponse.json({ ...metrics, expertStats });
  } catch (error) {
    console.error("[/api/cards/quality] error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера", details: String(error) },
      { status: 500 },
    );
  }
}
