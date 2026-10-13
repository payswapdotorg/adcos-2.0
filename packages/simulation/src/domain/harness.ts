import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  GroupPurchaseState,
  PaymentReference,
  OrganizationMembership,
  LabComparisonEvidence,
  OpportunityEvidence,
} from "@adcos/contracts";
import {
  runComparison,
  rankCandidates,
  type StrategyArm,
  type RecommendationOptions,
  type RecommendationReport,
} from "@adcos/lab";
import { evaluateOpportunity, type EvaluationPolicy } from "@adcos/economics";
import {
  evaluateCommitments,
  computeMemberAllocations,
  reallocateOnWithdrawal,
  type RoundingPolicy,
  type AllocationResult,
} from "@adcos/group-purchasing";
import {
  foundOrganization,
  dissolveOrganization,
  type FounderCandidate,
  type InitialMandateInput,
  type FoundingResult,
  type ConsentRecord,
  type DissolutionResult,
} from "@adcos/organizations";

// ============================================================================
// Shadow harness — drives the advisory domains over a fixed scenario.
// Advisory only: produces a report; performs no external side effects.
//
// Extended (P2-W3 round 2) to exercise the new flows on fixed snapshots:
// - multi-candidate recommendation breadth (rankCandidates),
// - founding an organization from the Lab PURSUE verdict (foundOrganization),
// - member allocation + pre-fulfilment withdrawal reallocation
//   (computeMemberAllocations / reallocateOnWithdrawal),
// - dissolution with explicit commitment dispositions (dissolveOrganization).
// Everything remains deterministic for a fixed scenario + fixed `now`.
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
  /** Multi-candidate recommendation case (subscription/SIM/equipment). */
  recommendation?: Omit<RecommendationOptions, "evaluatedAt">;
  /** Founding case: an organization is formed from the PURSUE verdict. */
  founding?: FoundingCase;
  /** Allocation case: the obtained offer is distributed across members. */
  allocation?: AllocationCase;
  /** Dissolution case: winds the formed organization down explicitly. */
  dissolution?: DissolutionCase;
}

export interface FoundingCase {
  organization: string;
  /** Founder candidates gathered for the formation. */
  candidates: readonly FounderCandidate[];
  /** Minimum viable founding membership (explicit, no default). */
  minFounders: number;
  /** The organization's authority scope; initial mandates stay within it. */
  authorityScope: string;
  /** Initial mandates to issue at formation (one per consenting founder). */
  initialMandates: readonly InitialMandateInput[];
}

export interface AllocationCase {
  /** Order state the allocation is computed at (a placed-order state). */
  orderState: GroupPurchaseState;
  /** Optional pre-fulfilment withdrawal reallocation. */
  withdrawal?: {
    participant: string;
    /** Commitments AFTER the withdrawal (withdrawn member's removed/revoked). */
    commitments: readonly GroupPurchaseCommitment[];
    /** Order state at withdrawal time (pre-fulfilment only). */
    orderState: GroupPurchaseState;
  };
  policy?: RoundingPolicy;
  /** Opaque payment reference, evidence only (ADR-0004). */
  paymentReference?: PaymentReference;
}

export interface DissolutionCase {
  /** Consent records for the dissolution decision. */
  consents: readonly ConsentRecord[];
  /** Maximum age of a usable consent record (ms; explicit). */
  maxConsentAgeMs: number;
  /** Memberships at dissolution time (defaults to the founding memberships). */
  memberships?: readonly OrganizationMembership[];
  /** Commitments to wind down with explicit dispositions. */
  commitments: readonly GroupPurchaseCommitment[];
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
  /** Multi-candidate recommendation report (when a recommendation case ran). */
  recommendation?: RecommendationReport;
  /** Founding outcome from the PURSUE verdict (when a founding case ran). */
  founding?: FoundingResult;
  /** Member allocation result (when an allocation case ran). */
  allocation?: AllocationResult;
  /** Dissolution outcome (when a dissolution case ran). */
  dissolution?: DissolutionResult;
}

/**
 * Run a scenario through the shadow harness. Deterministic for a fixed
 * scenario + fixed `now`: the same inputs always produce the same report
 * (asserted by the reproducibility test). Advisory only — no external side
 * effects are possible from any driven module.
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

  const notes = [...commitments.notes];
  const recommendation = scenario.recommendation
    ? rankCandidates({ ...scenario.recommendation, evaluatedAt: now })
    : undefined;

  // Founding runs from the PURSUE verdict; a non-PURSUE verdict exercises the
  // fail-closed FORMATION_FAILED path inside foundOrganization itself.
  const founding = scenario.founding
    ? foundOrganization({
        organization: scenario.founding.organization,
        pursuitEvidenceId: opportunity.id,
        pursuitVerdict: verdict,
        pursuitExpiresAt: evidence.expiresAt,
        candidates: scenario.founding.candidates,
        minFounders: scenario.founding.minFounders,
        authorityScope: scenario.founding.authorityScope,
        initialMandates: scenario.founding.initialMandates,
        now,
      })
    : undefined;

  // Allocation of the obtained offer (only meaningful with a bound offer).
  let allocation: AllocationResult | undefined;
  if (scenario.allocation && scenario.offer) {
    allocation = computeMemberAllocations({
      request: scenario.request,
      offer: scenario.offer,
      commitments: scenario.commitments,
      orderState: scenario.allocation.orderState,
      now,
      policy: scenario.allocation.policy,
      paymentReference: scenario.allocation.paymentReference,
    });
    const withdrawal = scenario.allocation.withdrawal;
    if (withdrawal && allocation) {
      allocation = reallocateOnWithdrawal(allocation, {
        request: scenario.request,
        offer: scenario.offer,
        commitments: withdrawal.commitments,
        withdrawParticipant: withdrawal.participant,
        orderState: withdrawal.orderState,
        now,
      });
    }
  } else if (scenario.allocation) {
    notes.push("allocation case skipped — no offer bound to the request");
  }

  // Dissolution winds the formed organization down; when founding did not
  // produce FORMED, dissolveOrganization fails closed and the scenario
  // records that outcome (it is the honest result, not an error).
  let dissolution: DissolutionResult | undefined;
  if (scenario.dissolution) {
    if (founding) {
      dissolution = dissolveOrganization({
        organization: founding.organization,
        formation: founding,
        memberships: scenario.dissolution.memberships ?? founding.memberships,
        commitments: scenario.dissolution.commitments,
        consents: scenario.dissolution.consents,
        maxConsentAgeMs: scenario.dissolution.maxConsentAgeMs,
        now,
      });
    } else {
      notes.push("dissolution case skipped — no founding case in the scenario");
    }
  }

  return {
    scenarioId: scenario.id,
    evidence,
    opportunity,
    verdict,
    purchaseState: commitments.state,
    participants: commitments.participants,
    thresholdMet: commitments.thresholdMet,
    notes,
    recommendation,
    founding,
    allocation,
    dissolution,
  };
}
