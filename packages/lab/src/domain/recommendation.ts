import type { PriceCapacityTradeOff } from "@adcos/economics";
import { comparePriceCapacity } from "@adcos/economics";

// ============================================================================
// Recommendation breadth — multi-candidate comparison for subscription/SIM/
// equipment cases, beyond the merged baseline comparison (runComparison).
//
// Advisory only (INVARIANTS #21): this engine ranks and reports; deterministic
// policy, eligibility and consent decide. Eligibility preconditions are
// hard gates — a candidate that fails feasibility is REJECTED with reasons
// and appears in the report, never silently dropped.
//
// Determinism: for a fixed evidence snapshot + injected clock the report is
// byte-stable; ranking is lexicographic over declared criteria with an
// id-ascending tie-break, and price-vs-capacity ordering uses EXACT integer
// cross-multiplication (never the rounded milli display).
//
// No invented provider data: candidate numbers and provenance come from the
// caller's pinned snapshot and are carried verbatim; synthetic fixtures must
// be clearly labeled as such (INVARIANTS #6).
// ============================================================================

export type RecommendationKind = "SUBSCRIPTION" | "SIM" | "EQUIPMENT";

export interface RecommendationCandidate {
  id: string;
  kind: RecommendationKind;
  /** Price in integer minor units (money exactness — INVARIANTS #25). */
  priceMinorUnits: number;
  /** Capacity in integer units (e.g. GB, lines, ports). */
  capacityUnits: number;
  /** Confidence in the candidate's measurements (0-1, caller-supplied). */
  confidence: number;
  /** Provenance carried verbatim — never invented or rewritten here. */
  provenance: string;
  /** Caller-supplied feasibility verdict with reasons (preconditions). */
  eligibility: { feasible: boolean; reasons: string[] };
  /** Assumptions carried verbatim. */
  assumptions: string[];
}

export type RankingCriterion =
  | "PRICE_ASC"
  | "CAPACITY_DESC"
  | "PRICE_PER_CAPACITY_ASC"
  | "CONFIDENCE_DESC";

/**
 * Ranking policy. Criteria are applied lexicographically in the declared
 * order — there are deliberately NO weights (INVARIANTS #22: hard constraints
 * cannot be traded away by a weighted reward function). The final tie-break
 * is ascending candidate id, so ranking is deterministic for a fixed
 * snapshot regardless of input order.
 */
export interface RankingPolicy {
  /** Versioned rule id recorded on every report (auditable). */
  ruleVersion: string;
  criteria: RankingCriterion[];
  tieBreak: "CANDIDATE_ID_ASC";
}

export const RECOMMENDATION_RULE_VERSION = "recommendation-lexicographic-v1";

export const DEFAULT_RANKING_POLICY: RankingPolicy = {
  ruleVersion: RECOMMENDATION_RULE_VERSION,
  criteria: ["PRICE_PER_CAPACITY_ASC", "PRICE_ASC", "CAPACITY_DESC"],
  tieBreak: "CANDIDATE_ID_ASC",
};

/** Hard eligibility preconditions (violations are ineligibility, not score). */
export interface RecommendationConstraints {
  /** Minimum acceptable capacity. */
  minCapacityUnits?: number;
  /** Budget cap in minor units. */
  maxPriceMinorUnits?: number;
  /** Required candidate kind for this case. */
  requiredKind?: RecommendationKind;
}

export interface RankedCandidate {
  rank: number;
  candidate: string;
  kind: RecommendationKind;
  provenance: string;
  priceMinorUnits: number;
  capacityUnits: number;
  confidence: number;
  assumptions: readonly string[];
  /** Structured price-vs-capacity trade-off evidence. */
  tradeOff: PriceCapacityTradeOff;
  /** Deltas against the baseline candidate (structured evidence). */
  vsBaseline: {
    priceDeltaMinorUnits: number;
    capacityDeltaUnits: number;
    pricePerCapacityDeltaMilli: number;
  };
}

/** A candidate that failed feasibility preconditions — kept with reasons. */
export interface RejectedCandidate {
  candidate: string;
  kind: RecommendationKind;
  provenance: string;
  reasons: readonly string[];
}

export interface RecommendationReport {
  id: string;
  intent: string;
  kind: RecommendationKind;
  /** Snapshot label — provenance of the pinned evidence set. */
  snapshot: string;
  baseline: string;
  ranked: readonly RankedCandidate[];
  rejected: readonly RejectedCandidate[];
  policy: RankingPolicy;
  constraints: RecommendationConstraints;
  evaluatedAt: number;
  expiresAt?: number;
}

export interface RecommendationOptions {
  id: string;
  intent: string;
  /** The recommendation case under evaluation. */
  kind: RecommendationKind;
  /** Label identifying the pinned evidence snapshot (fixtures must say so). */
  snapshot: string;
  /** Baseline candidate id (the no-change arm; must be among candidates). */
  baseline: string;
  candidates: readonly RecommendationCandidate[];
  constraints?: RecommendationConstraints;
  policy?: RankingPolicy;
  /** Injected evaluation timestamp (epoch ms) — reproducibility. */
  evaluatedAt: number;
  expiresAt?: number;
}

/**
 * Rank N candidates with explicit criteria + confidence for a fixed
 * evidence snapshot. Every input candidate appears in the output exactly
 * once — either ranked or REJECTED with reasons. Eligibility preconditions
 * are evaluated BEFORE ranking (a constraint-violating candidate is
 * ineligible, never lower-scored). Deterministic: same options → same report.
 */
export function rankCandidates(options: RecommendationOptions): RecommendationReport {
  const policy = options.policy ?? DEFAULT_RANKING_POLICY;
  const constraints = options.constraints ?? {};
  const baseline = options.candidates.find((c) => c.id === options.baseline);
  if (!baseline) {
    throw new Error(`baseline candidate '${options.baseline}' is not among the candidates`);
  }
  const seenIds = new Set<string>();
  for (const c of options.candidates) {
    if (seenIds.has(c.id)) {
      throw new Error(`duplicate candidate id '${c.id}' — ranking would be ambiguous`);
    }
    seenIds.add(c.id);
  }

  const eligible: RecommendationCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const c of options.candidates) {
    const reasons = eligibilityReasons(c, constraints, options.kind);
    if (reasons.length > 0) {
      rejected.push({ candidate: c.id, kind: c.kind, provenance: c.provenance, reasons });
    } else {
      eligible.push(c);
    }
  }

  // Trade-off evidence from the economics engine (fail-closed on malformed
  // numbers — which the eligibility precheck above already REJECTED, so a
  // throw here can only be a baseline integrity error).
  const tradeOffs = comparePriceCapacity(
    toTradeOffInput(baseline),
    eligible.filter((c) => c.id !== baseline.id).map(toTradeOffInput),
  );
  const tradeOffById = new Map(tradeOffs.map((t) => [t.candidate, t]));
  const baselineTradeOff = tradeOffById.get(baseline.id);
  if (baselineTradeOff === undefined) {
    throw new Error("internal: baseline trade-off missing after computation");
  }

  const rankedCandidates = [...eligible].sort((a, b) => compareCandidates(a, b, policy));
  const ranked: RankedCandidate[] = rankedCandidates.map((c, index) => {
    const tradeOff = tradeOffById.get(c.id);
    if (tradeOff === undefined) {
      throw new Error(`internal: trade-off missing for candidate ${c.id}`);
    }
    return {
      rank: index + 1,
      candidate: c.id,
      kind: c.kind,
      provenance: c.provenance,
      priceMinorUnits: c.priceMinorUnits,
      capacityUnits: c.capacityUnits,
      confidence: c.confidence,
      assumptions: c.assumptions,
      tradeOff,
      vsBaseline: {
        priceDeltaMinorUnits: c.priceMinorUnits - baseline.priceMinorUnits,
        capacityDeltaUnits: c.capacityUnits - baseline.capacityUnits,
        pricePerCapacityDeltaMilli:
          tradeOff.pricePerCapacityMilli - baselineTradeOff.pricePerCapacityMilli,
      },
    };
  });

  return {
    id: options.id,
    intent: options.intent,
    kind: options.kind,
    snapshot: options.snapshot,
    baseline: options.baseline,
    ranked,
    rejected: rejected.sort((a, b) =>
      a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : 0,
    ),
    policy,
    constraints,
    evaluatedAt: options.evaluatedAt,
    expiresAt: options.expiresAt,
  };
}

// ----------------------------------------------------------------------------
// Eligibility preconditions (fail-closed)
// ----------------------------------------------------------------------------

function eligibilityReasons(
  c: RecommendationCandidate,
  constraints: RecommendationConstraints,
  caseKind: RecommendationKind,
): string[] {
  const reasons: string[] = [];
  if (!c.eligibility.feasible) {
    reasons.push(...c.eligibility.reasons.map((r) => `caller-supplied eligibility failed: ${r}`));
    if (c.eligibility.reasons.length === 0) {
      reasons.push("caller-supplied eligibility failed (no reasons given)");
    }
  }
  if (!Number.isInteger(c.priceMinorUnits) || c.priceMinorUnits < 0) {
    reasons.push(`price must be an integer >= 0 in minor units (got ${c.priceMinorUnits})`);
  }
  if (!Number.isInteger(c.capacityUnits) || c.capacityUnits < 1) {
    reasons.push(`capacity must be an integer >= 1 (got ${c.capacityUnits})`);
  }
  if (c.confidence < 0 || c.confidence > 1) {
    reasons.push(`confidence ${c.confidence} outside [0,1]`);
  }
  if (
    constraints.minCapacityUnits !== undefined &&
    c.capacityUnits < constraints.minCapacityUnits
  ) {
    reasons.push(
      `capacity ${c.capacityUnits} below minimum ${constraints.minCapacityUnits} (hard constraint)`,
    );
  }
  if (
    constraints.maxPriceMinorUnits !== undefined &&
    c.priceMinorUnits > constraints.maxPriceMinorUnits
  ) {
    reasons.push(
      `price ${c.priceMinorUnits} above budget cap ${constraints.maxPriceMinorUnits} (hard constraint)`,
    );
  }
  if (constraints.requiredKind !== undefined && c.kind !== constraints.requiredKind) {
    reasons.push(`kind ${c.kind} does not match required ${constraints.requiredKind}`);
  }
  if (c.kind !== caseKind) {
    reasons.push(`kind ${c.kind} does not match the recommendation case ${caseKind}`);
  }
  return reasons;
}

function toTradeOffInput(c: RecommendationCandidate) {
  return { id: c.id, priceMinorUnits: c.priceMinorUnits, capacityUnits: c.capacityUnits };
}

// ----------------------------------------------------------------------------
// Deterministic lexicographic comparison (exact, no weights)
// ----------------------------------------------------------------------------

function compareCandidates(
  a: RecommendationCandidate,
  b: RecommendationCandidate,
  policy: RankingPolicy,
): number {
  for (const criterion of policy.criteria) {
    const result = compareBy(criterion, a, b);
    if (result !== 0) return result;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareBy(
  criterion: RankingCriterion,
  a: RecommendationCandidate,
  b: RecommendationCandidate,
): number {
  switch (criterion) {
    case "PRICE_ASC":
      return a.priceMinorUnits - b.priceMinorUnits;
    case "CAPACITY_DESC":
      return b.capacityUnits - a.capacityUnits;
    case "CONFIDENCE_DESC":
      return b.confidence - a.confidence;
    case "PRICE_PER_CAPACITY_ASC": {
      // EXACT rational comparison via cross-multiplication — never the
      // rounded pricePerCapacityMilli display value.
      return a.priceMinorUnits * b.capacityUnits - b.priceMinorUnits * a.capacityUnits;
    }
  }
}
