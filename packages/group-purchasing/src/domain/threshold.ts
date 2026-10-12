import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  GroupPurchaseState,
} from "@adcos/contracts";

// ============================================================================
// Commitment aggregation and threshold evaluation — pure, injected clock
// ============================================================================

export interface CommitmentEvaluation {
  /** Resulting group-purchase state. */
  state: GroupPurchaseState;
  /** Distinct participants with accepted commitments. */
  participants: readonly string[];
  /** True when distinct commitments met or exceeded the threshold. */
  thresholdMet: boolean;
  /** Committed allocation total (sum over distinct participants). */
  committedAllocation: number;
  /** Blocking reasons (duplicates skipped, expiry, revoked commitments). */
  notes: readonly string[];
}

/**
 * Evaluate commitments against a request and its offer.
 *
 * Semantics (explicit, per spec/group-organizations-and-purchasing.md):
 * - only non-revoked, unexpired commitments count;
 * - duplicate participants count once (first accepted commitment wins);
 * - request expiry dominates: an expired request can never reach THRESHOLD_MET;
 * - shortfall (below threshold) yields THRESHOLD_NOT_MET, never FAILED;
 * - no offer → the request stays at COMMITMENT_OPEN evaluation (notes say why).
 */
export function evaluateCommitments(
  request: GroupPurchaseRequest,
  offer: GroupPurchaseOffer | undefined,
  commitments: readonly GroupPurchaseCommitment[],
  now: number,
): CommitmentEvaluation {
  const notes: string[] = [];
  const participants: string[] = [];
  let committedAllocation = 0;

  for (const c of commitments) {
    if (c.request !== request.id) {
      notes.push(`commitment ${c.id} references request ${c.request}, not ${request.id} — skipped`);
      continue;
    }
    if (offer && c.offer !== offer.id) {
      notes.push(`commitment ${c.id} references offer ${c.offer}, not ${offer.id} — skipped`);
      continue;
    }
    if (c.revoked) {
      notes.push(`commitment ${c.id} revoked — skipped`);
      continue;
    }
    if (c.expiresAt !== undefined && now > c.expiresAt) {
      notes.push(`commitment ${c.id} expired — skipped`);
      continue;
    }
    if (participants.includes(c.participant)) {
      notes.push(`duplicate commitment for participant ${c.participant} — counted once`);
      continue;
    }
    participants.push(c.participant);
    committedAllocation += allocationTotal(c);
  }

  if (now > request.expiresAt) {
    return {
      state: "EXPIRED",
      participants,
      thresholdMet: false,
      committedAllocation,
      notes: [...notes, "request expired before threshold was met"],
    };
  }

  const thresholdMet = participants.length >= request.threshold;
  const state: GroupPurchaseState = offer
    ? thresholdMet
      ? "THRESHOLD_MET"
      : "THRESHOLD_NOT_MET"
    : "COMMITMENT_OPEN";

  return {
    state,
    participants,
    thresholdMet,
    committedAllocation,
    notes: offer ? notes : [...notes, "no offer bound yet — commitments remain open"],
  };
}

/**
 * Allocation total of a commitment (sum of its numeric allocation entries).
 * Allocation semantics belong to the requesting organization; this only
 * aggregates the explicit numbers.
 */
export function allocationTotal(commitment: GroupPurchaseCommitment): number {
  return Object.values(commitment.allocation).reduce((sum, n) => sum + n, 0);
}
