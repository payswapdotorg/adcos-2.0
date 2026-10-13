import type {
  ResourceProjectionReference,
  CapabilityObservation,
  OrganizationMembership,
  OrganizationMandate,
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  OpportunityEvidence,
  GroupPurchaseState,
  PaymentReference,
} from "@adcos/contracts";
import type { DomainSnapshot } from "./projections.js";

// ============================================================================
// Surfaces service state — the persisted document behind the role views.
//
// Every row is a contracts-typed projection (JSON-serializable, no provider
// secrets, no canonical-state writes). The domain never performs I/O: it
// describes state and commands; persistence is an injected port implemented
// by the adapters layer (JsonlSurfaceStateStore follows the landed
// JsonlInboxStore pattern from packages/coordination).
// ============================================================================

/**
 * The owner's sharing-consent journey for one resource (advanceConsent
 * machine). NOT_SHARED requires a fresh OPT_IN — consent never silently
 * re-enables; a missing record means the resource was never opted in.
 */
export interface ResourceConsentRecord {
  resourceId: string;
  state: "NOT_SHARED" | "SHARED" | "PAUSED";
  updatedAt: number;
}

/**
 * Order-lifecycle tracking per group-purchase request. `state` lives in the
 * order machine's vocabulary only (COMMITMENT_OPEN → THRESHOLD_MET → …);
 * threshold EVALUATION states (THRESHOLD_NOT_MET etc.) are computed on
 * demand, never persisted as order state.
 */
export interface OrderRecord {
  request: string;
  state: GroupPurchaseState;
  updatedAt: number;
  /** Opaque payment reference attached at PLACE_ORDER (evidence, ADR-0004). */
  paymentReference?: PaymentReference;
}

/** The full persisted surface state (one JSON document per service). */
export interface SurfaceState {
  consents: readonly ResourceConsentRecord[];
  resources: readonly ResourceProjectionReference[];
  observations: readonly CapabilityObservation[];
  memberships: readonly OrganizationMembership[];
  mandates: readonly OrganizationMandate[];
  requests: readonly GroupPurchaseRequest[];
  offers: readonly GroupPurchaseOffer[];
  commitments: readonly GroupPurchaseCommitment[];
  opportunities: readonly OpportunityEvidence[];
  orders: readonly OrderRecord[];
}

export const EMPTY_SURFACE_STATE: SurfaceState = {
  consents: [],
  resources: [],
  observations: [],
  memberships: [],
  mandates: [],
  requests: [],
  offers: [],
  commitments: [],
  opportunities: [],
  orders: [],
};

/** Durability stats for a surface state store (reported, never faked). */
export interface SurfaceStoreStats {
  /** State snapshots successfully loaded on the last restore. */
  snapshots: number;
  /** Torn/corrupt tail lines detected and skipped (reported, not trusted). */
  tornLines: number;
}

/**
 * Persistence port (implemented by the adapters layer). Durability model:
 * `persist` appends durably BEFORE the command is acknowledged
 * (write-before-ack); `restore` folds the durable log into the current
 * state across restarts.
 */
export interface SurfaceStatePersistence {
  /** Fold the durable log into the current state (empty when no log exists). */
  restore(): SurfaceState;
  /** Durably append a full state snapshot (write-before-ack of a command). */
  persist(state: SurfaceState): void;
  /** Current durability stats without reloading. */
  stats(): SurfaceStoreStats;
}

/** Shallow shape guard used by the adapters layer on reload: a parseable
 * line that is not shaped like a SurfaceState is corrupt, not trusted. */
export function isSurfaceStateLike(value: unknown): value is SurfaceState {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.consents) &&
    Array.isArray(candidate.resources) &&
    Array.isArray(candidate.observations) &&
    Array.isArray(candidate.memberships) &&
    Array.isArray(candidate.mandates) &&
    Array.isArray(candidate.requests) &&
    Array.isArray(candidate.offers) &&
    Array.isArray(candidate.commitments) &&
    Array.isArray(candidate.opportunities) &&
    Array.isArray(candidate.orders)
  );
}

/**
 * Bridge the persisted state into the projection snapshot consumed by
 * buildCustomerView. Read-only: projections never widen scope.
 */
export function snapshotFromState(state: SurfaceState): DomainSnapshot {
  return {
    resources: [...state.resources],
    memberships: [...state.memberships],
    requests: [...state.requests],
    offers: [...state.offers],
    commitments: [...state.commitments],
    opportunities: [...state.opportunities],
    consents: [...state.consents],
    orderStates: Object.fromEntries(state.orders.map((o) => [o.request, o.state] as const)),
  };
}

/** Result shape shared by every service command (fail-closed, explicit). */
export interface CommandResult {
  applied: boolean;
  /** Next state — the SAME reference when the command was refused. */
  state: SurfaceState;
  reason?: string;
}
