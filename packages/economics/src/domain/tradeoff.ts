// ============================================================================
// Price-vs-capacity trade-off — explicit, exact, deterministic cost math for
// multi-candidate recommendation breadth (subscription/SIM/equipment cases).
//
// EXACTNESS (INVARIANTS #25): money is integer minor units; capacity is
// integer units. Malformed inputs fail closed (throw) — never coerced.
//
// This module computes structured evidence only. It is NOT provider data:
// candidates and their numbers come from a pinned evidence snapshot supplied
// by the caller (synthetic fixtures must be clearly labeled as such);
// nothing here invents or extrapolates provider pricing.
// ============================================================================

export interface TradeOffInput {
  /** Candidate id. */
  id: string;
  /** Price in integer minor units (>= 0). */
  priceMinorUnits: number;
  /** Capacity in integer units (>= 1), e.g. GB, lines, or ports. */
  capacityUnits: number;
}

/**
 * Structured price-vs-capacity trade-off evidence for one candidate.
 *
 * `pricePerCapacityMilli` is floor(price * 1000 / capacity) — milli-minor
 * units per capacity unit, rounded DOWN. The rounding rule is stated here
 * and locked by tests: it is a display/evidence value only. Exact ordering
 * between candidates must use cross-multiplication
 * (a.price * b.capacity vs b.price * a.capacity), never this rounded value.
 */
export interface PriceCapacityTradeOff {
  candidate: string;
  priceMinorUnits: number;
  capacityUnits: number;
  /** floor(price * 1000 / capacity) — rounded down, evidence display only. */
  pricePerCapacityMilli: number;
}

/**
 * Compute the trade-off evidence for a baseline plus candidate set. The
 * baseline is included in the output (first element). Deterministic for a
 * fixed input; candidate order is preserved.
 *
 * Fail-closed: non-integer or negative price, non-integer or sub-unit
 * capacity, or a price×capacity cross product beyond the safe integer range
 * throws — the caller's snapshot is malformed and no evidence is invented.
 */
export function comparePriceCapacity(
  baseline: TradeOffInput,
  candidates: readonly TradeOffInput[],
): PriceCapacityTradeOff[] {
  const all = [baseline, ...candidates];
  for (const c of all) {
    if (!Number.isInteger(c.priceMinorUnits) || c.priceMinorUnits < 0) {
      throw new Error(
        `candidate ${c.id}: price must be an integer >= 0 in minor units (got ${c.priceMinorUnits})`,
      );
    }
    if (!Number.isInteger(c.capacityUnits) || c.capacityUnits < 1) {
      throw new Error(
        `candidate ${c.id}: capacity must be an integer >= 1 (got ${c.capacityUnits})`,
      );
    }
  }
  let maxPrice = 0;
  let maxCapacity = 0;
  for (const c of all) {
    maxPrice = Math.max(maxPrice, c.priceMinorUnits);
    maxCapacity = Math.max(maxCapacity, c.capacityUnits);
  }
  if (!Number.isSafeInteger(maxPrice * maxCapacity)) {
    throw new Error(
      "price×capacity cross products exceed the safe integer range — refine the candidate snapshot",
    );
  }
  return all.map((c) => ({
    candidate: c.id,
    priceMinorUnits: c.priceMinorUnits,
    capacityUnits: c.capacityUnits,
    pricePerCapacityMilli: Math.floor((c.priceMinorUnits * 1000) / c.capacityUnits),
  }));
}
