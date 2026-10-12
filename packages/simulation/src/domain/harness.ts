import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  LabComparisonEvidence,
  OpportunityEvidence,
} from "@adcos/contracts";
import { runComparison, type StrategyArm } from "@adcos/lab";
import { evaluateOpportunity, type EvaluationPolicy } from "@adcos/economics";
import { evaluateCommitments } from "@adcos/group-purchasing";

// ============================================================================
// Shadow harness — drives the advisory domains over a fixed scenario.
// Advisory only: produces a report; performs no external side effects.
// ============================================================================

export interface Scenario {
  id: string;
  /** Strategy arms for the Lab comparison (baseline first is NOT assumed:
   *  the arm named `baselineStrategy` is the no-change arm). */
  arms: StrategyArm[];
  baselineStrategy: string;
  selectedStrategy: string;
  confidence: number;
  assumptions: string[];
  /** The group-purchase request under evaluation. */
  request: GroupPurchaseRequest;
  /** The offer bound to the request (optional until received). */
  offer?: GroupPurchaseOffer;
  /** Member commitments (order matters only for duplicate-first-wins). */
  commitments: GroupPurchaseCommitment[];
  /** Evaluation policy for the opportunity verdict. */
  policy?: EvaluationPolicy;
}

export interface ScenarioReport {
  scenarioId: string;
  /** The comparison evidence produced by the Lab (reproducible). */
  evidence: LabComparisonEvidence;
  /** The advisory opportunity derived from the evidence. */
  opportunity: OpportunityEvidence;
  /** Verdict on the opportunity (PURSUE / REJECT / INSUFFICIENT_EVIDENCE). */
  verdict: string;
  /** Group-purchase state after aggregating commitments. */
  purchaseState: string;
  /** Distinct committed participants. */
  participants: readonly string[];
  /** Threshold outcome. */
  thresholdMet: boolean;
  /** Notes from commitment aggregation (duplicates, expiries, skips). */
  notes: readonly string[];
}

/**
 * Run a scenario through the shadow harness. Deterministic for a fixed
 * scenario + fixed `now`: the same inputs always produce the same report
 * (asserted by the reproducibility test).
 */
export function runScenario(scenario: Scenario, now: number): ScenarioReport {
  const baseline = scenario.arms.find((a) => a.strategy === scenario.baselineStrategy);
  if (!baseline) {
    throw new Error(`baselineStrategy '${scenario.baselineStrategy}' not among the arms`);
  }
  const alternatives = scenario.arms.filter((a) => a.strategy !== scenario.baselineStrategy);

  const evidence = runComparison({
    id: `${scenario.id}-evidence`,
    intent: scenario.request.intent,
    baseline,
    alternatives,
    selectedStrategy: scenario.selectedStrategy,
    confidence: scenario.confidence,
    assumptions: scenario.assumptions,
    evaluatedAt: now,
    expiresAt: scenario.request.expiresAt,
  });

  const evaluation = evaluateOpportunity(evidence, scenario.policy);
  const verdict = evaluation.verdict;
  const opportunity: OpportunityEvidence = {
    id: `${scenario.id}-opportunity`,
    intent: scenario.request.intent,
    evidence,
    confidence: evidence.selected.confidence,
    cost: evidence.selected.cost,
    benefit: -evaluation.costDelta > 0 ? -evaluation.costDelta : undefined,
    risk: verdict === "REJECT" ? 1 : undefined,
    recommendation:
      verdict === "PURSUE"
        ? `pursue ${scenario.selectedStrategy}`
        : `do not pursue ${scenario.selectedStrategy} (${evaluation.reasons.join("; ")})`,
    expiresAt: evidence.expiresAt,
  };

  const commitments = evaluateCommitments(
    scenario.request,
    scenario.offer,
    scenario.commitments,
    now,
  );

  return {
    scenarioId: scenario.id,
    evidence,
    opportunity,
    verdict,
    purchaseState: commitments.state,
    participants: commitments.participants,
    thresholdMet: commitments.thresholdMet,
    notes: commitments.notes,
  };
}
