import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  GroupPurchaseState,
  PaymentReference,
} from "@adcos/contracts";
import { evaluateCommitments, allocationTotal } from "./threshold.js";
import {
  DEFAULT_ROUNDING_POLICY,
  distribute,
  distributeCost,
  offerMinorUnits,
  allocationRecord,
  byParticipant,
  rejectedResult,
  type MemberAllocation,
  type RoundingPolicy,
  type AllocationResult,
} from "./allocation-core.js";

// ============================================================================
// Member allocation detail workflows — distribute the obtained offer across
// members after threshold crossing and order placement; reallocation on
// pre-fulfilment withdrawal; explicit shortfall/expiry handling per the
// merged evaluateCommitments semantics. Rounding policy, exactness and money
// discipline are defined in allocation-core.ts (ADR-0004: opaque payment
// references as evidence only — never executed here).
// ============================================================================

/** Order states in which the obtained offer may be distributed across members. */
const ORDER_PLACED_STATES: readonly GroupPurchaseState[] = [
  "AUTHORIZED",
  "ORDERED",
  "CONTRACTED",
  "FULFILLED",
];

/** Withdrawal with reallocation is legal strictly before fulfilment. */
const WITHDRAWAL_STATES: readonly GroupPurchaseState[] = ["AUTHORIZED", "ORDERED", "CONTRACTED"];

export interface AllocationInput {
  request: GroupPurchaseRequest;
  offer: GroupPurchaseOffer;
  /** Accepted commitments; skip semantics mirror the merged evaluateCommitments. */
  commitments: readonly GroupPurchaseCommitment[];
  /** Order state at distribution time (allocation requires a placed order). */
  orderState: GroupPurchaseState;
  now: number;
  policy?: RoundingPolicy;
  /** Opaque payment reference, evidence only — never executed here. */
  paymentReference?: PaymentReference;
}

/**
 * Compute the member allocation for an obtained offer. Fail-closed: any
 * precondition failure (malformed money, inconsistent offer totals, missing
 * threshold, expiry) yields UNUSABLE_SHORTFALL / UNUSABLE_EXPIRED / REJECTED with reasons — never a
 * silently repaired or partially invented allocation. Deterministic for a
 * fixed input regardless of commitment input order.
 */
export function computeMemberAllocations(input: AllocationInput): AllocationResult {
  const policy = input.policy ?? DEFAULT_ROUNDING_POLICY;
  const notes: string[] = [];
  const base = { policy, paymentReference: input.paymentReference, notes };

  if (input.offer.request !== input.request.id) {
    return rejectedResult(
      base,
      `offer ${input.offer.id} does not reference request ${input.request.id}`,
    );
  }
  if (!ORDER_PLACED_STATES.includes(input.orderState)) {
    return rejectedResult(
      base,
      `allocation requires a placed order; order state ${input.orderState} is not admissible`,
    );
  }
  const minorUnits = offerMinorUnits(input.offer, notes);
  if (minorUnits === undefined) {
    return rejectedResult(base, "offer money is not exact in integer minor units");
  }

  // First accepted commitment per participant wins (merged duplicate rule).
  const chosen = new Map<string, GroupPurchaseCommitment>();
  for (const c of input.commitments) {
    if (c.request !== input.request.id) continue;
    if (c.offer !== input.offer.id) continue;
    if (c.revoked) continue;
    if (c.expiresAt !== undefined && input.now > c.expiresAt) continue;
    if (chosen.has(c.participant)) {
      notes.push(`duplicate commitment for participant ${c.participant} — first accepted wins`);
      continue;
    }
    chosen.set(c.participant, c);
  }

  // Threshold/expiry semantics per the merged evaluateCommitments.
  const evaluation = evaluateCommitments(input.request, input.offer, input.commitments, input.now);
  notes.push(...evaluation.notes);
  if (input.now > input.offer.expiry) {
    return unusable(
      input,
      base,
      chosen,
      "UNUSABLE_EXPIRED",
      0,
      "offer expired — allocations unusable, never silently transferred",
    );
  }
  if (evaluation.state === "EXPIRED") {
    return unusable(
      input,
      base,
      chosen,
      "UNUSABLE_EXPIRED",
      0,
      "request expired — allocations unusable, never silently transferred",
    );
  }
  if (evaluation.state !== "THRESHOLD_MET") {
    return unusable(
      input,
      base,
      chosen,
      "UNUSABLE_SHORTFALL",
      input.offer.quantity,
      "threshold not met — allocations unusable (merged evaluateCommitments semantics)",
    );
  }

  const weights = [];
  for (const [participant, commitment] of chosen) {
    const committed = allocationTotal(commitment);
    if (!Number.isInteger(committed) || committed < 0) {
      return rejectedResult(
        base,
        `commitment ${commitment.id} has non-integer/negative committed units ${committed}`,
      );
    }
    if (committed === 0) {
      notes.push(`commitment ${commitment.id} has zero committed units — nothing allocated`);
    }
    weights.push({
      key: participant,
      weight: committed,
      cap: committed,
      commitmentId: commitment.id,
    });
  }

  const unitShares = distribute(input.offer.quantity, weights);
  const allocations = weights
    .map((w) => {
      const units = unitShares.shares.get(w.key) ?? 0;
      return allocationRecord(
        input.offer.id,
        { id: w.commitmentId, participant: w.key },
        w.weight,
        units,
        "ALLOCATED",
      );
    })
    .sort(byParticipant);

  return finish(
    input.offer.quantity,
    minorUnits.totalCostMinor,
    base,
    allocations,
    unitShares.leftover,
    notes,
  );
}

export interface WithdrawalInput {
  request: GroupPurchaseRequest;
  offer: GroupPurchaseOffer;
  /** Commitments AFTER the withdrawal (withdrawn member's removed/revoked). */
  commitments: readonly GroupPurchaseCommitment[];
  withdrawParticipant: string;
  /** Order state at withdrawal time (reallocation is pre-fulfilment only). */
  orderState: GroupPurchaseState;
  now: number;
}

/**
 * Reallocate on member withdrawal BEFORE fulfilment. The withdrawn member's
 * records become WITHDRAWN; their units are redistributed among remaining
 * members under the same rounding policy and consent caps; units that cannot
 * be placed are an explicit shortfall. Threshold semantics per the merged
 * evaluateCommitments: a withdrawal that drops the group below threshold
 * makes every remaining allocation UNUSABLE_SHORTFALL. Expiry (offer or
 * request) makes everything UNUSABLE_EXPIRED. Nothing is ever silently
 * transferred.
 */
export function reallocateOnWithdrawal(
  previous: AllocationResult,
  input: WithdrawalInput,
): AllocationResult {
  const notes = [...previous.notes];
  const base = { policy: previous.policy, paymentReference: previous.paymentReference, notes };

  if (previous.state !== "COMPUTED") {
    return {
      ...previous,
      notes: [...notes, `allocation set is ${previous.state} — withdrawal does not apply`],
    };
  }
  if (!WITHDRAWAL_STATES.includes(input.orderState)) {
    return rejectedResult(
      base,
      `withdrawal reallocation is legal only before fulfilment; order state ${input.orderState} must use the dispute/refund terms instead`,
    );
  }
  const withdrawn = previous.allocations.filter((a) => a.participant === input.withdrawParticipant);
  if (withdrawn.length === 0) {
    return {
      ...previous,
      notes: [
        ...notes,
        `participant ${input.withdrawParticipant} holds no allocation — nothing withdrawn`,
      ],
    };
  }
  const stillCommitted = input.commitments.some(
    (c) =>
      c.participant === input.withdrawParticipant &&
      c.request === input.request.id &&
      c.offer === input.offer.id &&
      !c.revoked &&
      (c.expiresAt === undefined || input.now <= c.expiresAt),
  );
  if (stillCommitted) {
    return rejectedResult(
      base,
      `participant ${input.withdrawParticipant} still holds a live commitment — revoke or remove it before withdrawal`,
    );
  }

  // Post-withdrawal threshold semantics (merged evaluateCommitments).
  const evaluation = evaluateCommitments(input.request, input.offer, input.commitments, input.now);
  notes.push(...evaluation.notes);
  if (input.now > input.offer.expiry || evaluation.state === "EXPIRED") {
    return {
      ...base,
      state: "UNUSABLE_EXPIRED",
      allocations: previous.allocations.map((a) => ({
        ...a,
        status: a.participant === input.withdrawParticipant ? "WITHDRAWN" : "UNUSABLE_EXPIRED",
      })),
      totalUnits: 0,
      totalCostMinorUnits: 0,
      shortfallUnits: 0,
    };
  }
  if (evaluation.state !== "THRESHOLD_MET") {
    return {
      ...base,
      state: "UNUSABLE_SHORTFALL",
      allocations: previous.allocations.map((a) => ({
        ...a,
        status: a.participant === input.withdrawParticipant ? "WITHDRAWN" : "UNUSABLE_SHORTFALL",
      })),
      totalUnits: 0,
      totalCostMinorUnits: 0,
      shortfallUnits: withdrawn.reduce((sum, a) => sum + a.units, 0),
    };
  }

  const withdrawnUnits = withdrawn.reduce((sum, a) => sum + a.units, 0);
  const remaining = previous.allocations.filter((a) => a.participant !== input.withdrawParticipant);
  const headroom = remaining.map((a) => ({
    key: a.participant,
    weight: a.committedUnits,
    cap: a.committedUnits - a.units,
    commitmentId: a.commitment,
  }));
  const redist = distribute(withdrawnUnits, headroom);
  const reallocated = remaining.map((a) => ({
    ...a,
    units: a.units + (redist.shares.get(a.participant) ?? 0),
  }));

  const minorNotes: string[] = [];
  const minorUnits = offerMinorUnits(input.offer, minorNotes);
  if (minorUnits === undefined) {
    return rejectedResult(base, "offer money is not exact in integer minor units");
  }
  notes.push(...minorNotes);
  const withCost = attachCost(minorUnits.totalCostMinor, input.offer.quantity, reallocated, notes);

  const allocations: MemberAllocation[] = [
    ...withCost,
    ...withdrawn.map((a) => ({ ...a, status: "WITHDRAWN" as const })),
  ];
  if (redist.leftover > 0) {
    notes.push(
      `${redist.leftover} withdrawn units could not be reallocated under consent caps — explicit shortfall, never silently transferred`,
    );
  }
  notes.push(
    `participant ${input.withdrawParticipant} withdrawn before fulfilment: ${withdrawnUnits} units returned for reallocation`,
  );

  const usable = allocations.filter((a) => a.status === "ALLOCATED");
  return {
    ...base,
    state: "COMPUTED",
    allocations,
    totalUnits: usable.reduce((sum, a) => sum + a.units, 0),
    totalCostMinorUnits: usable.reduce((sum, a) => sum + a.costMinorUnits, 0),
    shortfallUnits: previous.shortfallUnits + redist.leftover,
  };
}

// ----------------------------------------------------------------------------
// Shared outcome assembly
// ----------------------------------------------------------------------------

function unusable(
  input: AllocationInput,
  base: { policy: RoundingPolicy; paymentReference?: PaymentReference; notes: string[] },
  chosen: Map<string, GroupPurchaseCommitment>,
  status: "UNUSABLE_EXPIRED" | "UNUSABLE_SHORTFALL",
  shortfallUnits: number,
  reason: string,
): AllocationResult {
  return {
    state: status,
    allocations: [...chosen.values()].map((c) =>
      allocationRecord(input.offer.id, c, allocationTotal(c), 0, status),
    ),
    policy: base.policy,
    totalUnits: 0,
    totalCostMinorUnits: 0,
    shortfallUnits,
    paymentReference: base.paymentReference,
    notes: [...base.notes, reason],
  };
}

function attachCost(
  totalCostMinor: number,
  quantity: number,
  allocated: readonly MemberAllocation[],
  notes: string[],
): MemberAllocation[] {
  const { costShares, unallocatedCostMinorUnits } = distributeCost(
    totalCostMinor,
    quantity,
    allocated,
  );
  if (unallocatedCostMinorUnits > 0) {
    notes.push(
      `${unallocatedCostMinorUnits} minor units of cost are unallocated (shortfall units carry no member cost) — never charged silently`,
    );
  }
  return allocated.map((a) => ({ ...a, costMinorUnits: costShares.get(a.participant) ?? 0 }));
}

function finish(
  quantity: number,
  totalCostMinor: number,
  base: { policy: RoundingPolicy; paymentReference?: PaymentReference; notes: string[] },
  allocations: readonly MemberAllocation[],
  shortfallUnits: number,
  notes: string[],
): AllocationResult {
  if (shortfallUnits > 0) {
    notes.push(
      `${shortfallUnits} units could not be placed under consent caps — explicit shortfall, never over-allocated`,
    );
  }
  const withCost = attachCost(totalCostMinor, quantity, allocations, notes);
  return {
    state: "COMPUTED",
    allocations: withCost,
    policy: base.policy,
    totalUnits: withCost.reduce((sum, a) => sum + a.units, 0),
    totalCostMinorUnits: withCost.reduce((sum, a) => sum + a.costMinorUnits, 0),
    shortfallUnits,
    paymentReference: base.paymentReference,
    notes,
  };
}
