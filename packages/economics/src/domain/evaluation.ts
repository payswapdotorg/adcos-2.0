import {
  LabComparisonEvidenceSchema,
  GroupPurchaseOfferSchema,
  type LabComparisonEvidence,
  type GroupPurchaseOffer,
} from "@adcos/contracts";

// ============================================================================
// Opportunity evaluation — pure, reproducible for a fixed evidence snapshot
// ============================================================================

/**
 * Policy for opportunity evaluation. All thresholds explicit; no defaults
 * hidden inside the calculation. Unknown/missing evidence yields
 * INSUFFICIENT_EVIDENCE, never a silently optimistic verdict.
 */
export interface EvaluationPolicy {
  /** Minimum acceptable confidence (0-1) for a PURSUE verdict. */
  minConfidence: number;
  /** Minimum absolute saving required (selected cheaper than no-change). */
  minSaving: number;
  /** Maximum number of assumptions a PURSUE verdict may rest on. */
  maxAssumptions: number;
  /** When true, reliability numbers are required on both arms. */
  requireReliability: boolean;
  /** Allowed reliability regression (selected vs no-change) when both present. */
  maxReliabilityRegression: number;
}

export const DEFAULT_EVALUATION_POLICY: EvaluationPolicy = {
  minConfidence: 0.6,
  minSaving: 0.01,
  maxAssumptions: 8,
  requireReliability: false,
  maxReliabilityRegression: 0,
};

export type EvaluationVerdict = "PURSUE" | "REJECT" | "INSUFFICIENT_EVIDENCE";

export interface OpportunityEvaluation {
  verdict: EvaluationVerdict;
  /** selected.cost - noChange.cost (negative = saving). */
  costDelta: number;
  /** Confidence used for the decision (from the evidence; never inflated). */
  confidence: number;
  /** Assumptions the evidence rests on (verbatim; never synthesized). */
  assumptions: readonly string[];
  /** Blocking reasons when the verdict is REJECT or INSUFFICIENT_EVIDENCE. */
  reasons: readonly string[];
  /** The evidence identity this evaluation was computed from. */
  evidenceId: string;
}

/**
 * Evaluate a Lab comparison evidence snapshot against an explicit policy.
 * Deterministic: same evidence + same policy → identical evaluation.
 */
export function evaluateOpportunity(
  evidenceInput: LabComparisonEvidence,
  policy: EvaluationPolicy = DEFAULT_EVALUATION_POLICY,
): OpportunityEvaluation {
  const evidence = LabComparisonEvidenceSchema.parse(evidenceInput);
  const reasons: string[] = [];
  const assumptions = evidence.selected.assumptions;

  const costDelta = round2(evidence.selected.cost - evidence.noChange.cost);
  const confidence = evidence.selected.confidence;

  if (evidence.noChange.reliability === undefined || evidence.selected.reliability === undefined) {
    if (policy.requireReliability) {
      reasons.push("reliability missing on one or both arms (policy requires it)");
    }
  } else if (
    evidence.selected.reliability <
    evidence.noChange.reliability - policy.maxReliabilityRegression
  ) {
    reasons.push(
      `reliability regression beyond tolerance: selected ${evidence.selected.reliability} < no-change ${evidence.noChange.reliability} - ${policy.maxReliabilityRegression}`,
    );
  }

  if (confidence < policy.minConfidence) {
    reasons.push(`confidence ${confidence} below minimum ${policy.minConfidence}`);
  }
  if (costDelta > -policy.minSaving) {
    reasons.push(`saving ${-costDelta} below minimum ${policy.minSaving}`);
  }
  if (assumptions.length > policy.maxAssumptions) {
    reasons.push(`assumptions ${assumptions.length} above maximum ${policy.maxAssumptions}`);
  }

  const insufficient = reasons.some((r) => r.includes("reliability missing"));
  const verdict: EvaluationVerdict = insufficient
    ? "INSUFFICIENT_EVIDENCE"
    : reasons.length === 0
      ? "PURSUE"
      : "REJECT";

  return {
    verdict,
    costDelta,
    confidence,
    assumptions,
    reasons,
    evidenceId: evidence.id,
  };
}

// ============================================================================
// Offer cost summary — explicit, no hidden fees
// ============================================================================

export interface OfferCostSummary {
  /** One-time charges total. */
  oneTimeTotal: number;
  /** First-period recurring total. */
  recurringFirstPeriod: number;
  /** perMemberCost as stated by the offer (verified against quantity). */
  perMemberCost: number;
  /** Per-member all-in first-period cost. */
  perMemberFirstPeriod: number;
  /** Total first-period cost across the quantity. */
  totalFirstPeriod: number;
  /** The stated totalCost (verified: it must equal the computed one). */
  statedTotal: number;
  /** True when stated totalCost matches the computed per-member roll-up. */
  totalsConsistent: boolean;
}

/**
 * Summarize a group-purchase offer's explicit costs. Verifies the stated
 * perMemberCost/totalCost against the charge line items; inconsistencies are
 * reported, never silently repaired.
 */
export function summarizeOfferCosts(offerInput: GroupPurchaseOffer): OfferCostSummary {
  const offer = GroupPurchaseOfferSchema.parse(offerInput);
  const oneTimeTotal = round2(offer.oneTimeCharges.reduce((sum, c) => sum + c.amount, 0));
  const recurringFirstPeriod = round2(offer.recurringCharges.reduce((sum, c) => sum + c.amount, 0));
  const computedPerMember = round2(offer.totalCost / offer.quantity);
  const totalsConsistent = computedPerMember === round2(offer.perMemberCost);
  return {
    oneTimeTotal,
    recurringFirstPeriod,
    perMemberCost: offer.perMemberCost,
    perMemberFirstPeriod: round2(
      offer.perMemberCost + (oneTimeTotal + recurringFirstPeriod) / offer.quantity,
    ),
    totalFirstPeriod: round2(offer.totalCost + oneTimeTotal + recurringFirstPeriod),
    statedTotal: offer.totalCost,
    totalsConsistent,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
