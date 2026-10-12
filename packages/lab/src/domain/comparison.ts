import type { LabComparisonEvidence, OpportunityEvidence } from "@adcos/contracts";

// ============================================================================
// Reality Lab comparison — deterministic over a fixed snapshot + injected clock
// ============================================================================

/**
 * A measured strategy arm from a fixed evidence snapshot. Numbers are inputs;
 * the Lab never invents or extrapolates beyond the explicit formula below.
 */
export interface StrategyArm {
  /** Strategy reference (e.g. 'baseline-status-quo'). */
  strategy: string;
  /** Measured cost for the comparison window. */
  cost: number;
  /** Measured reliability (0-1) when available. */
  reliability?: number;
  /** Measured utilization (0-1) when available. */
  utilization?: number;
}

/**
 * Reproducibility inputs: the clock is injected (evaluatedAt), so identical
 * snapshots + identical options yield identical evidence objects.
 */
export interface ComparisonOptions {
  /** Evidence id (caller-owned identity). */
  id: string;
  /** Intent reference this comparison serves. */
  intent: string;
  /** The no-change arm (mandatory). */
  baseline: StrategyArm;
  /** The candidate arms under consideration. */
  alternatives: StrategyArm[];
  /** Arm the Lab is asked to select (validated to be one of the arms). */
  selectedStrategy: string;
  /** Confidence in the selected arm's measurements (0-1, caller-supplied). */
  confidence: number;
  /** Assumptions carried into the result verbatim. */
  assumptions: string[];
  /** Injected evaluation timestamp (epoch ms). */
  evaluatedAt: number;
  /** Optional expiry (epoch ms). */
  expiresAt?: number;
}

/**
 * Confidence adjustment applied per missing secondary metric on the selected
 * arm: confidence_out = confidence_in - 0.1 * (missing metrics), floored at 0.
 * Explicit and deterministic; documented in the evidence via assumptions.
 */
export const MISSING_METRIC_CONFIDENCE_PENALTY = 0.1;

/**
 * Run a baseline/no-change comparison and produce the canonical
 * LabComparisonEvidence. Deterministic: the same options yield the same
 * evidence (all randomness excluded; timestamp injected).
 */
export function runComparison(options: ComparisonOptions): LabComparisonEvidence {
  const arms = [options.baseline, ...options.alternatives];
  const selected = arms.find((a) => a.strategy === options.selectedStrategy);
  if (!selected) {
    throw new Error(
      `selectedStrategy '${options.selectedStrategy}' is not among the compared arms`,
    );
  }

  let confidence = options.confidence;
  const assumptions = [...options.assumptions];
  if (selected.reliability === undefined) {
    confidence -= MISSING_METRIC_CONFIDENCE_PENALTY;
    assumptions.push("selected arm reliability missing: confidence penalized");
  }
  if (selected.utilization === undefined) {
    confidence -= MISSING_METRIC_CONFIDENCE_PENALTY;
    assumptions.push("selected arm utilization missing: confidence penalized");
  }
  confidence = Math.max(0, round2(confidence));

  return {
    id: options.id,
    intent: options.intent,
    baseline: options.baseline.strategy,
    alternatives: options.alternatives.map((a) => a.strategy),
    noChange: {
      cost: options.baseline.cost,
      reliability: options.baseline.reliability,
      utilization: options.baseline.utilization,
    },
    selected: {
      strategy: selected.strategy,
      cost: selected.cost,
      reliability: selected.reliability,
      utilization: selected.utilization,
      confidence,
      assumptions,
    },
    comparison: {
      costDelta: round2(selected.cost - options.baseline.cost),
      savingsRatio:
        options.baseline.cost === 0
          ? null
          : round2((options.baseline.cost - selected.cost) / options.baseline.cost),
    },
    evaluatedAt: options.evaluatedAt,
    expiresAt: options.expiresAt,
  };
}

/**
 * Wrap comparison evidence into OpportunityEvidence with an explicit
 * recommendation computed from a caller-supplied evaluation verdict.
 * The Lab NEVER acts: this is advisory output only.
 */
export function asOpportunityEvidence(
  evidence: LabComparisonEvidence,
  recommendation: string,
  options: { id: string; benefit?: number; risk?: number },
): OpportunityEvidence {
  return {
    id: options.id,
    intent: evidence.intent,
    evidence,
    confidence: evidence.selected.confidence,
    cost: evidence.selected.cost,
    benefit: options.benefit,
    risk: options.risk,
    recommendation,
    expiresAt: evidence.expiresAt,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
