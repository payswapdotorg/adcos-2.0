import type { GroupPurchaseOffer, PaymentReference } from "@adcos/contracts";
import { summarizeOfferCosts } from "@adcos/economics";

// ============================================================================
// Member allocation core — explicit rounding policy, deterministic exact
// distribution, money as integer minor units.
//
// Money discipline (ADR-0004): this module NEVER moves money. Payment
// references are opaque ids recorded as evidence only; actual settlement is
// BLOCKED-ON-OPERATOR (rail selection) and happens in the authorized
// payment/financial system, never here.
//
// EXACTNESS (INVARIANTS #23/#25): all quantities and money amounts are
// integers (money in minor units). Non-integer money is REJECTED, never
// rounded into an allocation. Sums are always exact; anything that cannot be
// placed is an explicit shortfall.
// ============================================================================

/**
 * Rounding policy for member allocation. Explicit and versioned; every
 * allocation result records the policy that produced it.
 *
 * Rule (largest remainder, integer units only):
 *  1. base_i = min(floor(total * weight_i / totalWeight), cap_i) where
 *     weight_i is the member's committed units and cap_i is the same value
 *     (the CONSENT CAP: a member is never allocated more units than they
 *     committed to — INVARIANTS #23 explicit individual commitments).
 *  2. leftover = total - sum(base_i) is distributed one unit at a time in
 *     descending remainder order r_i = (total * weight_i) mod totalWeight,
 *     ties broken by ascending participant id (code-point order), skipping
 *     members at their cap, cycling until the leftover is exhausted or no
 *     member has headroom.
 *  3. any unit that still cannot be placed is reported as shortfallUnits —
 *     never silently dropped and never allocated beyond consent.
 *
 * Cost shares (integer minor units) follow ALLOCATED units — a member pays
 * only for the units they hold; shortfall units carry no member cost — with
 * the same largest-remainder rule and tie-break; sums are exact.
 */
export interface RoundingPolicy {
  /** Versioned rule id recorded on every allocation result (auditable). */
  ruleVersion: string;
  mode: "LARGEST_REMAINDER";
  tieBreak: "PARTICIPANT_ID_ASC";
  consentCap: "COMMITTED_UNITS";
}

export const ALLOCATION_RULE_VERSION = "group-allocation-largest-remainder-v1";

export const DEFAULT_ROUNDING_POLICY: RoundingPolicy = {
  ruleVersion: ALLOCATION_RULE_VERSION,
  mode: "LARGEST_REMAINDER",
  tieBreak: "PARTICIPANT_ID_ASC",
  consentCap: "COMMITTED_UNITS",
};

export type MemberAllocationStatus =
  | "ALLOCATED"
  | "WITHDRAWN"
  | "UNUSABLE_SHORTFALL"
  | "UNUSABLE_EXPIRED";

/**
 * Per-member allocation record with provenance: which obtained offer it
 * derives from and which commitment it is proportional to.
 */
export interface MemberAllocation {
  /** Deterministic id: `${offerId}-alloc-${participant}`. */
  id: string;
  /** The obtained offer this allocation derives from (provenance). */
  offer: string;
  /** The commitment this allocation is proportional to (provenance). */
  commitment: string;
  participant: string;
  /** Committed units (the weight; also the consent cap). */
  committedUnits: number;
  /** Units of the obtained offer allocated to this member (integer). */
  units: number;
  /** Cost share in integer minor units (evidence only — ADR-0004). */
  costMinorUnits: number;
  status: MemberAllocationStatus;
}

export type AllocationState = "COMPUTED" | "UNUSABLE_SHORTFALL" | "UNUSABLE_EXPIRED" | "REJECTED";

export interface AllocationResult {
  state: AllocationState;
  allocations: readonly MemberAllocation[];
  policy: RoundingPolicy;
  /** Sum of units over records still usable (status ALLOCATED). */
  totalUnits: number;
  /** Sum of cost shares over records still usable (integer minor units). */
  totalCostMinorUnits: number;
  /** Units that could not be placed under consent caps (explicit shortfall). */
  shortfallUnits: number;
  /** Opaque payment reference recorded as evidence ONLY (ADR-0004). */
  paymentReference?: PaymentReference;
  notes: readonly string[];
}

export interface Weighted {
  key: string;
  weight: number;
  cap: number;
  commitmentId: string;
}

/**
 * Distribute `total` integer units across weighted items. Deterministic for a
 * fixed input regardless of input order: remainder desc, key asc. Returns
 * per-key shares plus the leftover that could not be placed under caps (the
 * explicit shortfall).
 */
export function distribute(
  total: number,
  items: readonly Weighted[],
): { shares: Map<string, number>; leftover: number } {
  const shares = new Map<string, number>();
  for (const item of items) shares.set(item.key, 0);
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0 || items.length === 0 || totalWeight <= 0) {
    return { shares, leftover: Math.max(0, total) };
  }
  const remainders = new Map<string, number>();
  for (const item of items) {
    const share = Math.min(Math.floor((total * item.weight) / totalWeight), item.cap);
    shares.set(item.key, share);
    remainders.set(item.key, (total * item.weight) % totalWeight);
  }
  let leftover = total - [...shares.values()].reduce((sum, n) => sum + n, 0);
  const order = [...items].sort(
    (a, b) =>
      (remainders.get(b.key) ?? 0) - (remainders.get(a.key) ?? 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  while (leftover > 0) {
    let progressed = false;
    for (const item of order) {
      const current = shares.get(item.key) ?? 0;
      if (leftover > 0 && current < item.cap) {
        shares.set(item.key, current + 1);
        leftover -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return { shares, leftover };
}

/**
 * Exact cost shares in integer minor units, proportional to ALLOCATED units
 * (a member pays only for the units they hold; shortfall units carry no
 * member cost). The chargeable total is floor(totalCost * allocatedUnits /
 * quantity); the remainder of the offer total is reported as unallocated
 * cost. Same largest-remainder rule and tie-break; sum(shares) is exact.
 */
export function distributeCost(
  totalCostMinor: number,
  quantity: number,
  allocated: readonly MemberAllocation[],
): { costShares: Map<string, number>; unallocatedCostMinorUnits: number } {
  const totalUnits = allocated.reduce((sum, a) => sum + a.units, 0);
  if (quantity <= 0 || totalUnits <= 0) {
    return {
      costShares: new Map(allocated.map((a) => [a.participant, 0])),
      unallocatedCostMinorUnits: totalCostMinor,
    };
  }
  const chargeable = Math.floor((totalCostMinor * totalUnits) / quantity);
  const items: Weighted[] = allocated.map((a) => ({
    key: a.participant,
    weight: a.units,
    cap: chargeable,
    commitmentId: a.commitment,
  }));
  const { shares } = distribute(chargeable, items);
  const placed = [...shares.values()].reduce((sum, n) => sum + n, 0);
  return { costShares: shares, unallocatedCostMinorUnits: totalCostMinor - placed };
}

export interface OfferMinorUnits {
  totalCostMinor: number;
  perMemberCostMinor: number;
}

/**
 * Convert the offer's money into integer minor units. Fails closed: money not
 * representable exactly in minor units, or an offer whose stated totals are
 * inconsistent (verified via the merged summarizeOfferCosts), is REJECTED —
 * never silently repaired.
 */
export function offerMinorUnits(
  offer: GroupPurchaseOffer,
  notes: string[],
): OfferMinorUnits | undefined {
  const totalCostMinor = offer.totalCost * 100;
  const perMemberCostMinor = offer.perMemberCost * 100;
  if (!Number.isInteger(totalCostMinor) || !Number.isInteger(perMemberCostMinor)) {
    notes.push(
      `offer ${offer.id} money is not exactly representable in integer minor units — allocation requires exact money (INVARIANTS #25)`,
    );
    return undefined;
  }
  const summary = summarizeOfferCosts(offer);
  if (!summary.totalsConsistent) {
    notes.push(
      `offer ${offer.id} stated perMemberCost/totalCost inconsistent — never silently repaired`,
    );
    return undefined;
  }
  return { totalCostMinor, perMemberCostMinor };
}

export function allocationRecord(
  offerId: string,
  commitment: { id: string; participant: string },
  committedUnits: number,
  units: number,
  status: MemberAllocationStatus,
): MemberAllocation {
  return {
    id: `${offerId}-alloc-${commitment.participant}`,
    offer: offerId,
    commitment: commitment.id,
    participant: commitment.participant,
    committedUnits,
    units,
    costMinorUnits: 0,
    status,
  };
}

export function byParticipant(a: MemberAllocation, b: MemberAllocation): number {
  return a.participant < b.participant ? -1 : a.participant > b.participant ? 1 : 0;
}

export function rejectedResult(
  base: { policy: RoundingPolicy; paymentReference?: PaymentReference; notes: string[] },
  reason: string,
): AllocationResult {
  return {
    state: "REJECTED",
    allocations: [],
    policy: base.policy,
    totalUnits: 0,
    totalCostMinorUnits: 0,
    shortfallUnits: 0,
    paymentReference: base.paymentReference,
    notes: [...base.notes, reason],
  };
}
