import type {
  ResourceProjectionReference,
  OrganizationMembership,
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  OpportunityEvidence,
} from "@adcos/contracts";

// ============================================================================
// Role experience projections — pure view-model assembly over the domain
// state. Tenant isolation: a principal only ever sees rows they own,
// belong to or participate in. Explicit states everywhere: UNKNOWN/STALE/
// DEGRADED surface as themselves, never as silent success (INVARIANTS #5).
// ============================================================================

export interface DomainSnapshot {
  resources: readonly ResourceProjectionReference[];
  memberships: readonly OrganizationMembership[];
  requests: readonly GroupPurchaseRequest[];
  offers: readonly GroupPurchaseOffer[];
  commitments: readonly GroupPurchaseCommitment[];
  opportunities: readonly OpportunityEvidence[];
}

export type ResourceShareState = "NOT_SHARED" | "SHARED" | "PAUSED" | "REVOKED";

export interface ResourceCard {
  resourceId: string;
  type: string;
  capability: string;
  /** Share state derived from revocation + status doctrine. */
  share: ResourceShareState;
  /** Canonical status (UNKNOWN/STALE/DEGRADED/...) surfaced as-is. */
  status: ResourceProjectionReference["status"];
  freshness: number | undefined;
}

export interface GroupPurchaseCard {
  requestId: string;
  organization: string | undefined;
  /** Request state as of now (EXPIRED dominates). */
  state: "OPEN" | "EXPIRED";
  /** Committed distinct participants visible to this member. */
  committedParticipants: number;
  threshold: number;
  /** This principal's own commitment id, when present. */
  myCommitmentId: string | undefined;
}

export interface CustomerView {
  principal: string;
  resources: readonly ResourceCard[];
  organizations: readonly {
    organization: string;
    role: string;
    state: OrganizationMembership["state"];
  }[];
  groupPurchases: readonly GroupPurchaseCard[];
  opportunities: readonly { id: string; recommendation: string | undefined; confidence: number }[];
}

/**
 * Derive a resource's share state: explicit revocation wins, then the
 * status doctrine (TERMINATED/REJECTED/FAILED read as PAUSED-with-cause for
 * the customer's opt-in mental model — the raw status is still surfaced).
 */
export function resourceShareState(resource: ResourceProjectionReference): ResourceShareState {
  if (resource.revoked) {
    return "REVOKED";
  }
  if (
    resource.status === "TERMINATED" ||
    resource.status === "REJECTED" ||
    resource.status === "FAILED"
  ) {
    return "PAUSED";
  }
  return "SHARED";
}

/**
 * Build the customer-role view. Isolation: only this principal's resources,
 * memberships, participations and their organizations' requests/offers.
 * Opportunities are visible to any participant of the owning intent —
 * the caller scopes the snapshot; this function never widens it.
 */
export function buildCustomerView(
  snapshot: DomainSnapshot,
  principal: string,
  now: number,
): CustomerView {
  const myResources = snapshot.resources.filter((r) => r.owner === principal);
  const myMemberships = snapshot.memberships.filter((m) => m.principal === principal);
  const myOrganizations = new Set(myMemberships.map((m) => m.organization));

  const myRequests = snapshot.requests.filter(
    (r) => r.organization !== undefined && myOrganizations.has(r.organization),
  );
  const myCommitments = snapshot.commitments.filter((c) => c.participant === principal);
  const myIntents = new Set(myRequests.map((r) => r.intent));

  return {
    principal,
    resources: myResources.map((r) => ({
      resourceId: r.id,
      type: r.type,
      capability: r.capability,
      share: resourceShareState(r),
      status: r.status,
      freshness: r.freshness,
    })),
    organizations: myMemberships.map((m) => ({
      organization: m.organization,
      role: m.role,
      state: m.state,
    })),
    groupPurchases: myRequests.map((r) => {
      const committed = snapshot.commitments.filter(
        (c) =>
          c.request === r.id && !c.revoked && (c.expiresAt === undefined || now <= c.expiresAt),
      );
      const mine = committed.find((c) => c.participant === principal);
      return {
        requestId: r.id,
        organization: r.organization,
        state: now > r.expiresAt ? "EXPIRED" : "OPEN",
        committedParticipants: new Set(committed.map((c) => c.participant)).size,
        threshold: r.threshold,
        myCommitmentId: mine?.id,
      };
    }),
    opportunities: snapshot.opportunities
      .filter((o) => myIntents.has(o.intent))
      .map((o) => ({ id: o.id, recommendation: o.recommendation, confidence: o.confidence })),
  };
}
