// Pure statistical functions for inter-rater agreement metrics.
// No DB access — API routes prepare data and pass it here.

export interface VoteRow {
  requirement_id: number;
  user_id: number;
  username: string;
  vote: string; // confirm | reject | uncertain
  category: string;
  sphere: string;
}

export interface GoldLabelConfig {
  majorityThreshold: number; // default 0.75
  minVotes: number;          // default 3
}

export interface GoldLabel {
  requirement_id: number;
  label: string;             // confirm | reject | uncertain | disputed
  gold_confidence: string;   // gold | silver | disputed | insufficient
  majority_vote: string;
  vote_counts: Record<string, number>;
  total_votes: number;
  agreement_ratio: number;
}

export interface ExpertStats {
  username: string;
  full_name: string;
  totalVotes: number;
  distribution: Record<string, number>;
  biasIndicator: Record<string, number>; // rates: confirmRate, rejectRate, uncertainRate
  agreementWithConsensus: number;
}

export interface AgreementMetrics {
  fleissKappa: number;
  fleissKappaInterpretation: string;
  percentAgreement: number;
  itemCount: number;
  raterCount: number;
  byCategory: Record<string, { kappa: number; interpretation: string; itemCount: number }>;
  bySphere: Record<string, { kappa: number; interpretation: string; itemCount: number }>;
  pairwiseKappa: { user1: string; user2: string; kappa: number; itemCount: number }[];
  heatmap: { users: string[]; matrix: number[][] };
}

const CATEGORIES = ["confirm", "reject", "uncertain"];

/**
 * Fleiss' Kappa with variable number of raters per item.
 * Generalized formula: handles items rated by different numbers of raters.
 * Only includes items with >= 2 raters.
 */
export function fleissKappa(votes: VoteRow[]): number {
  // Group votes by requirement_id
  const byReq = groupBy(votes, "requirement_id");
  const items: { n: number; counts: number[] }[] = [];

  for (const reqVotes of Object.values(byReq)) {
    const n = reqVotes.length;
    if (n < 2) continue;
    const counts = CATEGORIES.map(
      (cat) => reqVotes.filter((v) => v.vote === cat).length
    );
    items.push({ n, counts });
  }

  if (items.length === 0) return 0;

  const k = CATEGORIES.length;

  // P_i for each item: (1 / (n_i * (n_i - 1))) * (sum(n_ij^2) - n_i)
  let sumPi = 0;
  let totalRatings = 0;
  const categoryTotals = new Array(k).fill(0);

  for (const item of items) {
    const { n, counts } = item;
    const sumSquares = counts.reduce((s, c) => s + c * c, 0);
    const pi = (sumSquares - n) / (n * (n - 1));
    sumPi += pi;
    totalRatings += n;
    for (let j = 0; j < k; j++) {
      categoryTotals[j] += counts[j];
    }
  }

  const N = items.length;
  const pBar = sumPi / N;

  // P_e: expected agreement by chance
  const pE = categoryTotals.reduce(
    (s, total) => s + (total / totalRatings) ** 2,
    0
  );

  if (pE >= 1) return 1.0;
  return (pBar - pE) / (1 - pE);
}

/**
 * Cohen's Kappa for two raters.
 * rater1 and rater2 are parallel arrays of votes on the same items.
 */
export function cohenKappa(rater1: string[], rater2: string[]): number {
  if (rater1.length === 0) return 0;
  const n = rater1.length;

  // Observed agreement
  let agree = 0;
  for (let i = 0; i < n; i++) {
    if (rater1[i] === rater2[i]) agree++;
  }
  const pO = agree / n;

  // Expected agreement
  let pE = 0;
  for (const cat of CATEGORIES) {
    const p1 = rater1.filter((v) => v === cat).length / n;
    const p2 = rater2.filter((v) => v === cat).length / n;
    pE += p1 * p2;
  }

  if (pE >= 1) return 1.0;
  return (pO - pE) / (1 - pE);
}

/**
 * Percentage of items where ALL raters agree on the same category.
 * Only counts items with >= 2 raters.
 */
export function percentAgreement(votes: VoteRow[]): number {
  const byReq = groupBy(votes, "requirement_id");
  let total = 0;
  let agreed = 0;

  for (const reqVotes of Object.values(byReq)) {
    if (reqVotes.length < 2) continue;
    total++;
    const firstVote = reqVotes[0].vote;
    if (reqVotes.every((v) => v.vote === firstVote)) agreed++;
  }

  return total > 0 ? agreed / total : 0;
}

/**
 * Compute gold label for a single requirement's votes.
 */
export function computeGoldLabel(
  requirementId: number,
  votes: { vote: string }[],
  config: GoldLabelConfig = { majorityThreshold: 0.75, minVotes: 3 }
): GoldLabel {
  const counts: Record<string, number> = { confirm: 0, reject: 0, uncertain: 0 };
  for (const v of votes) {
    counts[v.vote] = (counts[v.vote] || 0) + 1;
  }
  const total = votes.length;

  if (total < config.minVotes) {
    return {
      requirement_id: requirementId,
      label: "insufficient",
      gold_confidence: "insufficient",
      majority_vote: "",
      vote_counts: counts,
      total_votes: total,
      agreement_ratio: 0,
    };
  }

  // Find the majority vote
  const maxCount = Math.max(...Object.values(counts));
  const majorityVote = Object.entries(counts).find(([, c]) => c === maxCount)![0];
  const agreementRatio = maxCount / total;

  // Unanimous
  if (maxCount === total) {
    return {
      requirement_id: requirementId,
      label: majorityVote,
      gold_confidence: "gold",
      majority_vote: majorityVote,
      vote_counts: counts,
      total_votes: total,
      agreement_ratio: 1.0,
    };
  }

  // Majority meets threshold
  if (agreementRatio >= config.majorityThreshold) {
    return {
      requirement_id: requirementId,
      label: majorityVote,
      gold_confidence: "silver",
      majority_vote: majorityVote,
      vote_counts: counts,
      total_votes: total,
      agreement_ratio: agreementRatio,
    };
  }

  // Disputed
  return {
    requirement_id: requirementId,
    label: "disputed",
    gold_confidence: "disputed",
    majority_vote: majorityVote,
    vote_counts: counts,
    total_votes: total,
    agreement_ratio: agreementRatio,
  };
}

/**
 * Interpret Kappa value according to Landis & Koch (1977).
 */
export function interpretKappa(kappa: number): string {
  if (kappa < 0) return "poor";
  if (kappa <= 0.2) return "slight";
  if (kappa <= 0.4) return "fair";
  if (kappa <= 0.6) return "moderate";
  if (kappa <= 0.8) return "substantial";
  return "almost_perfect";
}

/**
 * Compute all agreement metrics from a flat list of votes.
 */
export function computeAllMetrics(votes: VoteRow[]): AgreementMetrics {
  const uniqueUsers = Array.from(new Set(votes.map((v) => v.username)));
  const byReq = groupBy(votes, "requirement_id");
  const itemCount = Object.values(byReq).filter((v) => v.length >= 2).length;

  // Overall Fleiss' Kappa
  const fk = fleissKappa(votes);

  // Percent agreement
  const pa = percentAgreement(votes);

  // By category
  const byCategory: AgreementMetrics["byCategory"] = {};
  const categories = Array.from(new Set(votes.map((v) => v.category)));
  for (const cat of categories) {
    const catVotes = votes.filter((v) => v.category === cat);
    const catItemCount = Object.values(groupBy(catVotes, "requirement_id")).filter(
      (v) => v.length >= 2
    ).length;
    if (catItemCount >= 2) {
      const k = fleissKappa(catVotes);
      byCategory[cat] = { kappa: k, interpretation: interpretKappa(k), itemCount: catItemCount };
    }
  }

  // By sphere
  const bySphere: AgreementMetrics["bySphere"] = {};
  const spheres = Array.from(new Set(votes.map((v) => v.sphere)));
  for (const sp of spheres) {
    const spVotes = votes.filter((v) => v.sphere === sp);
    const spItemCount = Object.values(groupBy(spVotes, "requirement_id")).filter(
      (v) => v.length >= 2
    ).length;
    if (spItemCount >= 2) {
      const k = fleissKappa(spVotes);
      bySphere[sp] = { kappa: k, interpretation: interpretKappa(k), itemCount: spItemCount };
    }
  }

  // Pairwise Cohen's Kappa
  const pairwiseKappa: AgreementMetrics["pairwiseKappa"] = [];
  const userVoteMap = new Map<string, Map<number, string>>(); // username -> (req_id -> vote)
  for (const v of votes) {
    if (!userVoteMap.has(v.username)) userVoteMap.set(v.username, new Map());
    userVoteMap.get(v.username)!.set(v.requirement_id, v.vote);
  }

  for (let i = 0; i < uniqueUsers.length; i++) {
    for (let j = i + 1; j < uniqueUsers.length; j++) {
      const u1 = uniqueUsers[i];
      const u2 = uniqueUsers[j];
      const m1 = userVoteMap.get(u1)!;
      const m2 = userVoteMap.get(u2)!;
      // Find common items
      const r1: string[] = [];
      const r2: string[] = [];
      m1.forEach((vote1, reqId) => {
        const vote2 = m2.get(reqId);
        if (vote2) {
          r1.push(vote1);
          r2.push(vote2);
        }
      });
      if (r1.length >= 2) {
        const k = cohenKappa(r1, r2);
        pairwiseKappa.push({ user1: u1, user2: u2, kappa: k, itemCount: r1.length });
      }
    }
  }

  // Heatmap matrix
  const heatmapMatrix: number[][] = [];
  for (let i = 0; i < uniqueUsers.length; i++) {
    heatmapMatrix.push([]);
    for (let j = 0; j < uniqueUsers.length; j++) {
      if (i === j) {
        heatmapMatrix[i].push(1.0);
      } else {
        const pair = pairwiseKappa.find(
          (p) =>
            (p.user1 === uniqueUsers[i] && p.user2 === uniqueUsers[j]) ||
            (p.user1 === uniqueUsers[j] && p.user2 === uniqueUsers[i])
        );
        heatmapMatrix[i].push(pair ? pair.kappa : 0);
      }
    }
  }

  return {
    fleissKappa: fk,
    fleissKappaInterpretation: interpretKappa(fk),
    percentAgreement: pa,
    itemCount,
    raterCount: uniqueUsers.length,
    byCategory,
    bySphere,
    pairwiseKappa,
    heatmap: { users: uniqueUsers, matrix: heatmapMatrix },
  };
}

// Helper: group array by a key
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const k = String(item[key]);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
