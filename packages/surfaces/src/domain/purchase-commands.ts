import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  GroupPurchaseState,
  PaymentReference,
} from "@adcos/contracts";
import { summarizeOfferCosts } from "@adcos/economics";
import {
  evaluateCommitments,
  advanceOrder,
  type CommitmentEvaluation,
  type OrderEvent,
  type OrderTransition,
} from "@adcos/group-purchasing";
import type { CommandResult, OrderRecord, SurfaceState } from "./state.js";
import { activeMembership, holdsMandate } from "./org-commands.js";

// ============================================================================
// Group-purchase and order-lifecycle commands (pure, injected clock).
//
// Money discipline (ADR-0004): the order engine moves STATUS only. Payment
// references are opaque evidence attached at PLACE_ORDER — never executed
// here. Authorization for AUTHORIZE is COMPUTED from the persisted mandates
// of every committed participant (fail-closed when any is missing).
//
// Commitment doctrine: only org members with an active purchase mandate may
// commit; expired requests and missing offers block commitments; duplicate
// commitments are refused (withdraw first); individual withdrawal is only
// legal in the open phase, afterwards the collective path applies.
// ============================================================================

/** Mandate scope that authorizes group-purchase actions. */
export const PURCHASE_SCOPE = "group.purchase";

/** Order-machine states that still admit individual commitment withdrawal. */
const OPEN_PHASE_STATES: readonly GroupPurchaseState[] = ["COMMITMENT_OPEN", "OFFER_RECEIVED"];

export interface OpenPurchaseInput {
  id: string;
  intent: string;
  organization: string;
  requirements: Readonly<Record<string, unknown>>;
  threshold: number;
  expiresAt: number;
}

export interface OpenPurchaseResult extends CommandResult {
  request?: GroupPurchaseRequest;
}

export function openGroupPurchase(
  state: SurfaceState,
  actor: string,
  input: OpenPurchaseInput,
  now: number,
): OpenPurchaseResult {
  if (state.requests.some((r) => r.id === input.id)) {
    return { applied: false, state, reason: `request '${input.id}' already exists` };
  }
  if (activeMembership(state, actor, input.organization) === undefined) {
    return {
      applied: false,
      state,
      reason: `actor '${actor}' is not a MEMBER of '${input.organization}'`,
    };
  }
  if (!holdsMandate(state, actor, input.organization, PURCHASE_SCOPE, now)) {
    return {
      applied: false,
      state,
      reason: `opening a group purchase requires an active '${PURCHASE_SCOPE}' mandate in '${input.organization}' held by '${actor}'`,
    };
  }
  if (input.threshold < 1) {
    return { applied: false, state, reason: "threshold must be at least 1" };
  }
  if (input.expiresAt <= now) {
    return { applied: false, state, reason: "request expires in the past" };
  }
  const request: GroupPurchaseRequest = {
    id: input.id,
    intent: input.intent,
    organization: input.organization,
    requirements: { ...input.requirements },
    participants: [actor],
    threshold: input.threshold,
    expiresAt: input.expiresAt,
  };
  const order: OrderRecord = {
    request: input.id,
    state: "COMMITMENT_OPEN",
    updatedAt: now,
  };
  return {
    applied: true,
    state: {
      ...state,
      requests: [...state.requests, request],
      orders: [...state.orders, order],
    },
    request,
  };
}

export interface ReceiveOfferResult extends CommandResult {
  offer?: GroupPurchaseOffer;
}

/** Record an attributable offer for a request (fail-closed on bad totals). */
export function receiveOffer(
  state: SurfaceState,
  actor: string,
  offer: GroupPurchaseOffer,
  now: number,
): ReceiveOfferResult {
  const request = state.requests.find((r) => r.id === offer.request);
  if (request === undefined) {
    return { applied: false, state, reason: `unknown request '${offer.request}'` };
  }
  if (
    request.organization === undefined ||
    activeMembership(state, actor, request.organization) === undefined
  ) {
    return {
      applied: false,
      state,
      reason: `actor '${actor}' is not a MEMBER of '${request.organization ?? "«unowned»"}' — offers are received through the owning organization`,
    };
  }
  if (state.offers.some((o) => o.id === offer.id)) {
    return { applied: false, state, reason: `offer '${offer.id}' already exists` };
  }
  if (offer.expiry <= now) {
    return { applied: false, state, reason: `offer '${offer.id}' is already expired` };
  }
  const summary = summarizeOfferCosts(offer);
  if (!summary.totalsConsistent) {
    return {
      applied: false,
      state,
      reason: `offer '${offer.id}' totals inconsistent: stated totalCost ${summary.statedTotal} does not match the per-member roll-up ${summary.perMemberCost} × ${offer.quantity}`,
    };
  }
  const orders = state.orders.map((o) =>
    o.request === offer.request && o.state === "COMMITMENT_OPEN"
      ? { ...o, state: "OFFER_RECEIVED" as GroupPurchaseState, updatedAt: now }
      : o,
  );
  return {
    applied: true,
    state: { ...state, offers: [...state.offers, offer], orders },
    offer,
  };
}

export interface CommitInput {
  requestId: string;
  allocation: Readonly<Record<string, number>>;
}

export interface CommitResult extends CommandResult {
  commitment?: GroupPurchaseCommitment;
  evaluation?: CommitmentEvaluation;
}

export function commitToPurchase(
  state: SurfaceState,
  actor: string,
  input: CommitInput,
  now: number,
): CommitResult {
  const request = state.requests.find((r) => r.id === input.requestId);
  if (request === undefined) {
    return { applied: false, state, reason: `unknown request '${input.requestId}'` };
  }
  if (
    request.organization === undefined ||
    activeMembership(state, actor, request.organization) === undefined
  ) {
    return {
      applied: false,
      state,
      reason: `actor '${actor}' is not a MEMBER of '${request.organization ?? "«unowned»"}'`,
    };
  }
  if (!holdsMandate(state, actor, request.organization, PURCHASE_SCOPE, now)) {
    return {
      applied: false,
      state,
      reason: `committing requires an active '${PURCHASE_SCOPE}' mandate in '${request.organization}' held by '${actor}'`,
    };
  }
  if (now > request.expiresAt) {
    return {
      applied: false,
      state,
      reason: `request '${request.id}' expired — commitments are no longer accepted (re-open a new request)`,
    };
  }
  const offer = state.offers.find((o) => o.request === request.id);
  if (offer === undefined) {
    return {
      applied: false,
      state,
      reason: `no offer bound to request '${request.id}' — commitments wait for an attributable offer`,
    };
  }
  const existing = state.commitments.find(
    (c) => c.request === request.id && c.participant === actor && !c.revoked,
  );
  if (existing !== undefined) {
    return {
      applied: false,
      state,
      reason: `'${actor}' already holds commitment '${existing.id}' on request '${request.id}' — withdraw it first`,
    };
  }
  const sequence = state.commitments.filter(
    (c) => c.request === request.id && c.participant === actor,
  ).length;
  const commitment: GroupPurchaseCommitment = {
    id: `${request.id}-commit-${actor}-${sequence}`,
    request: request.id,
    offer: offer.id,
    participant: actor,
    allocation: { ...input.allocation },
    acceptedAt: now,
    revoked: false,
  };
  const commitments = [...state.commitments, commitment];
  const evaluation = evaluateCommitments(request, offer, commitments, now);
  const orders = advanceOpenOrderToThreshold(state, request.id, evaluation, now);
  return {
    applied: true,
    state: { ...state, commitments, orders },
    commitment,
    evaluation,
  };
}

export interface WithdrawCommitmentResult extends CommandResult {
  evaluation?: CommitmentEvaluation;
}

export function withdrawCommitment(
  state: SurfaceState,
  actor: string,
  commitmentId: string,
  now: number,
): WithdrawCommitmentResult {
  const commitment = state.commitments.find((c) => c.id === commitmentId);
  if (commitment === undefined) {
    return { applied: false, state, reason: `unknown commitment '${commitmentId}'` };
  }
  if (commitment.participant !== actor) {
    return {
      applied: false,
      state,
      reason: `commitment '${commitmentId}' belongs to '${commitment.participant}' — only the participant may withdraw it`,
    };
  }
  if (commitment.revoked) {
    return { applied: false, state, reason: `commitment '${commitmentId}' is already withdrawn` };
  }
  const order = state.orders.find((o) => o.request === commitment.request);
  if (order === undefined) {
    return { applied: false, state, reason: `no order record for request '${commitment.request}'` };
  }
  if (!OPEN_PHASE_STATES.includes(order.state)) {
    return {
      applied: false,
      state,
      reason: `order for request '${commitment.request}' is in state ${order.state} — individual withdrawal is only possible in the open phase; use the order lifecycle (WITHDRAW/CANCEL) for the collective exit`,
    };
  }
  const commitments = state.commitments.map((c) =>
    c.id === commitmentId ? { ...c, revoked: true } : c,
  );
  const request = state.requests.find((r) => r.id === commitment.request);
  const offer = state.offers.find((o) => o.request === commitment.request);
  const evaluation =
    request !== undefined ? evaluateCommitments(request, offer, commitments, now) : undefined;
  return {
    applied: true,
    state: { ...state, commitments },
    evaluation,
  };
}

export interface AdvanceOrderInput {
  requestId: string;
  event: OrderEvent;
  paymentReference?: PaymentReference;
  usageEvidenceComplete?: boolean;
}

export interface AdvanceOrderResult extends CommandResult {
  transition?: OrderTransition;
  order?: OrderRecord;
}

export function advancePurchaseOrder(
  state: SurfaceState,
  actor: string,
  input: AdvanceOrderInput,
  now: number,
): AdvanceOrderResult {
  const request = state.requests.find((r) => r.id === input.requestId);
  if (request === undefined) {
    return { applied: false, state, reason: `unknown request '${input.requestId}'` };
  }
  if (
    request.organization === undefined ||
    activeMembership(state, actor, request.organization) === undefined
  ) {
    return {
      applied: false,
      state,
      reason: `actor '${actor}' is not a MEMBER of '${request.organization ?? "«unowned»"}'`,
    };
  }
  if (!holdsMandate(state, actor, request.organization, PURCHASE_SCOPE, now)) {
    return {
      applied: false,
      state,
      reason: `order events require an active '${PURCHASE_SCOPE}' mandate in '${request.organization}' held by '${actor}'`,
    };
  }
  const order = state.orders.find((o) => o.request === input.requestId);
  if (order === undefined) {
    return { applied: false, state, reason: `no order record for request '${input.requestId}'` };
  }

  // Service-computed guards: authorization is only granted when EVERY
  // committed participant holds an active purchase mandate (fail-closed).
  let authorizationGranted = false;
  if (input.event === "AUTHORIZE") {
    const offer = state.offers.find((o) => o.request === request.id);
    const evaluation = evaluateCommitments(request, offer, state.commitments, now);
    const organization = request.organization;
    const missing = evaluation.participants.filter(
      (participant) => !holdsMandate(state, participant, organization, PURCHASE_SCOPE, now),
    );
    if (missing.length > 0) {
      return {
        applied: false,
        state,
        reason: `authorization not grantable: committed participants without an active '${PURCHASE_SCOPE}' mandate: ${missing.join(", ")}`,
      };
    }
    authorizationGranted = evaluation.thresholdMet;
    if (!authorizationGranted) {
      return {
        applied: false,
        state,
        reason: `authorization not grantable: threshold not met (${evaluation.participants.length}/${request.threshold})`,
      };
    }
  }

  const transition = advanceOrder(order.state, input.event, {
    authorizationGranted,
    paymentReference: input.paymentReference,
    usageEvidenceComplete: input.usageEvidenceComplete === true,
  });
  if (!transition.applied) {
    return { applied: false, state, transition, reason: transition.reason };
  }
  const updated: OrderRecord = {
    ...order,
    state: transition.state,
    updatedAt: now,
    paymentReference:
      input.event === "PLACE_ORDER" && input.paymentReference !== undefined
        ? input.paymentReference
        : order.paymentReference,
  };
  const orders = state.orders.map((o) => (o.request === order.request ? updated : o));
  return { applied: true, state: { ...state, orders }, transition, order: updated };
}

/** Move an open-phase order record to THRESHOLD_MET when the threshold is met. */
function advanceOpenOrderToThreshold(
  state: SurfaceState,
  requestId: string,
  evaluation: CommitmentEvaluation,
  now: number,
): readonly OrderRecord[] {
  if (!evaluation.thresholdMet) {
    return state.orders;
  }
  return state.orders.map((o) =>
    o.request === requestId && OPEN_PHASE_STATES.includes(o.state)
      ? { ...o, state: "THRESHOLD_MET" as GroupPurchaseState, updatedAt: now }
      : o,
  );
}
