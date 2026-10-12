import type { GroupPurchaseState, PaymentReference } from "@adcos/contracts";

// ============================================================================
// Order lifecycle — the post-threshold state machine for group purchases.
//
// Money discipline (ADR-0004): this engine moves STATUS only. It never
// touches a payment system; payment references are opaque ids attached to
// transitions as evidence. Actual settlement/finality is BLOCKED-ON-OPERATOR
// and happens in the authorized payment system — never here.
// ============================================================================

export type OrderEvent =
  | "AUTHORIZE"
  | "PLACE_ORDER"
  | "CONFIRM_CONTRACT"
  | "MARK_FULFILLED"
  | "RECONCILE"
  | "REPORT_FULFILLMENT_FAILURE"
  | "OPEN_DISPUTE"
  | "CANCEL"
  | "WITHDRAW";

export interface OrderGuards {
  /** True when member consents are complete and the operator authorized. */
  authorizationGranted: boolean;
  /** Opaque payment reference for the placed order (evidence, never executed). */
  paymentReference?: PaymentReference;
  /** True when usage evidence is complete and balanced (for RECONCILE). */
  usageEvidenceComplete: boolean;
}

export interface OrderTransition {
  state: GroupPurchaseState;
  applied: boolean;
  reason?: string;
}

/**
 * Legal transitions (work order P2-W3/P2-W2 semantics):
 *   THRESHOLD_MET --AUTHORIZE(authorizationGranted)--> AUTHORIZED
 *   AUTHORIZED --PLACE_ORDER(paymentReference)--> ORDERED
 *   ORDERED --CONFIRM_CONTRACT--> CONTRACTED
 *   CONTRACTED --MARK_FULFILLED--> FULFILLED
 *   FULFILLED --RECONCILE(usageEvidenceComplete)--> RECONCILED
 *   CONTRACTED|FULFILLED --OPEN_DISPUTE--> DISPUTED
 *   ORDERED|CONTRACTED|FULFILLED --REPORT_FULFILLMENT_FAILURE--> FULFILLMENT_FAILED
 *   FULFILLMENT_FAILED --PLACE_ORDER(paymentReference)--> ORDERED (re-order)
 *   DISPUTED --RECONCILE--> RECONCILED (dispute resolved by reconciliation)
 *   COMMITMENT_OPEN|OFFER_RECEIVED|VALIDATED|THRESHOLD_MET --WITHDRAW--> WITHDRAWN
 *   DISCOVERED..THRESHOLD_MET --CANCEL--> CANCELLED (pre-order only)
 * Terminal: RECONCILED, WITHDRAWN, CANCELLED.
 */
const TRANSITIONS: Partial<
  Record<GroupPurchaseState, Partial<Record<OrderEvent, GroupPurchaseState>>>
> = {
  COMMITMENT_OPEN: { WITHDRAW: "WITHDRAWN", CANCEL: "CANCELLED" },
  OFFER_RECEIVED: { WITHDRAW: "WITHDRAWN", CANCEL: "CANCELLED" },
  VALIDATED: { WITHDRAW: "WITHDRAWN", CANCEL: "CANCELLED" },
  THRESHOLD_MET: { AUTHORIZE: "AUTHORIZED", WITHDRAW: "WITHDRAWN", CANCEL: "CANCELLED" },
  AUTHORIZED: { PLACE_ORDER: "ORDERED", CANCEL: "CANCELLED" },
  ORDERED: {
    CONFIRM_CONTRACT: "CONTRACTED",
    REPORT_FULFILLMENT_FAILURE: "FULFILLMENT_FAILED",
    CANCEL: "CANCELLED",
  },
  CONTRACTED: {
    MARK_FULFILLED: "FULFILLED",
    OPEN_DISPUTE: "DISPUTED",
    REPORT_FULFILLMENT_FAILURE: "FULFILLMENT_FAILED",
  },
  FULFILLED: {
    RECONCILE: "RECONCILED",
    OPEN_DISPUTE: "DISPUTED",
    REPORT_FULFILLMENT_FAILURE: "FULFILLMENT_FAILED",
  },
  FULFILLMENT_FAILED: { PLACE_ORDER: "ORDERED" },
  DISPUTED: { RECONCILE: "RECONCILED" },
};

/**
 * Apply an order event with its guards. All guard failures are explicit and
 * blocking; nothing is inferred or auto-authorized.
 */
export function advanceOrder(
  state: GroupPurchaseState,
  event: OrderEvent,
  guards: OrderGuards,
): OrderTransition {
  if (state === "RECONCILED" || state === "WITHDRAWN" || state === "CANCELLED") {
    return { state, applied: false, reason: `state ${state} is terminal` };
  }
  const target = TRANSITIONS[state]?.[event];
  if (target === undefined) {
    return { state, applied: false, reason: `event ${event} is not legal in state ${state}` };
  }
  if (event === "AUTHORIZE" && !guards.authorizationGranted) {
    return {
      state,
      applied: false,
      reason: "authorization not granted (member consent and operator authorization required)",
    };
  }
  if (event === "PLACE_ORDER" && guards.paymentReference === undefined) {
    return {
      state,
      applied: false,
      reason: "opaque payment reference required as order evidence (ADR-0004; never executed here)",
    };
  }
  if (event === "RECONCILE" && !guards.usageEvidenceComplete) {
    return {
      state,
      applied: false,
      reason: "usage evidence incomplete — reconciliation requires balanced usage evidence",
    };
  }
  return { state: target, applied: true };
}

/**
 * Shortfall/cancel/refund semantic helpers for callers assembling reports.
 * Refund tracking is a PaymentReference concern; this only states whether a
 * state admits one.
 */
export function refundAdmissible(state: GroupPurchaseState): boolean {
  return state === "FULFILLMENT_FAILED" || state === "DISPUTED" || state === "CANCELLED";
}
