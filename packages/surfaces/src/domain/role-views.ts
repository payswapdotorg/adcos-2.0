import type {
  MembershipState,
  ResourceProjectionReference,
  GroupPurchaseState,
} from "@adcos/contracts";
import { Schemas, VERSION_COMPATIBILITY_MATRIX, versionKey } from "@adcos/contracts";
import * as contractsNs from "@adcos/contracts";
import * as economicsNs from "@adcos/economics";
import * as labNs from "@adcos/lab";
import * as organizationsNs from "@adcos/organizations";
import * as groupPurchasingNs from "@adcos/group-purchasing";
import type { SurfaceState } from "./state.js";

// ============================================================================
// Operator and developer role projections (P2-W1 round 2).
//
// Operator: aggregate/cross-tenant OBSERVATION with explicit authority
// boundaries — counts and request-level progress only. No per-owner consent
// state, no per-member allocation amounts, no commitment identities, and no
// command authority: the operator role cannot act under a customer identity.
//
// Developer: integration/contract surface state — runtime-derived from the
// composed public contracts (never a hand-written catalog), plus the version
// compatibility matrix and the persisted state shape. No tenant-private
// rows. Both views are pure functions over injected inputs.
// ============================================================================

const MEMBERSHIP_STATES: readonly MembershipState[] = [
  "CANDIDATE",
  "INVITED",
  "MEMBER",
  "SUSPENDED",
  "REVOKED",
];

const RESOURCE_STATUSES: readonly ResourceProjectionReference["status"][] = [
  "UNKNOWN",
  "STALE",
  "DEGRADED",
  "FAILED",
  "REJECTED",
  "TERMINATED",
];

/** Explicit authority boundaries carried by every operator view. */
export const OPERATOR_AUTHORITY_BOUNDARIES: readonly string[] = [
  "observation only — the operator role carries no command authority over customer, member or organization state",
  "per-owner consent journeys, per-member allocation amounts and commitment identities are not exposed to operators",
  "operators cannot act under a customer identity; all writes remain behind customer/member commands",
  "resource rows appear as fleet aggregates by status, never as per-principal listings",
];

export interface OperatorRequestProgress {
  requestId: string;
  threshold: number;
  committedParticipants: number;
  evaluation: "OPEN" | "THRESHOLD_MET" | "THRESHOLD_NOT_MET" | "EXPIRED";
  orderState: GroupPurchaseState | undefined;
}

export interface OperatorOrganizationSummary {
  organization: string;
  membersByState: Readonly<Record<MembershipState, number>>;
  totalMemberships: number;
  requests: readonly OperatorRequestProgress[];
}

export interface OperatorFleetSummary {
  total: number;
  revoked: number;
  byStatus: Readonly<Record<ResourceProjectionReference["status"], number>>;
}

export interface OperatorView {
  principal: string;
  role: "operator";
  organizations: readonly OperatorOrganizationSummary[];
  fleet: OperatorFleetSummary;
  authorityBoundaries: readonly string[];
}

/**
 * Build the operator cross-tenant aggregate view. Pure; aggregates only —
 * this function never emits per-principal rows (tenant data stays behind
 * the customer/member views) and never widens a customer view.
 */
interface OrganizationAccumulator {
  organization: string;
  membersByState: Record<MembershipState, number>;
  totalMemberships: number;
  requests: OperatorRequestProgress[];
}

const emptyMembersByState = (): Record<MembershipState, number> => {
  const counts = {} as Record<MembershipState, number>;
  for (const s of MEMBERSHIP_STATES) {
    counts[s] = 0;
  }
  return counts;
};

export function buildOperatorView(
  state: SurfaceState,
  principal: string,
  now: number,
): OperatorView {
  const organizations = new Map<string, OrganizationAccumulator>();
  for (const membership of state.memberships) {
    const entry = organizations.get(membership.organization) ?? {
      organization: membership.organization,
      membersByState: emptyMembersByState(),
      totalMemberships: 0,
      requests: [],
    };
    entry.membersByState[membership.state] += 1;
    entry.totalMemberships += 1;
    organizations.set(membership.organization, entry);
  }

  const committedByRequest = new Map<string, Set<string>>();
  for (const commitment of state.commitments) {
    if (commitment.revoked || (commitment.expiresAt !== undefined && now > commitment.expiresAt)) {
      continue;
    }
    const set = committedByRequest.get(commitment.request) ?? new Set<string>();
    set.add(commitment.participant);
    committedByRequest.set(commitment.request, set);
  }

  const orderStates = new Map(state.orders.map((o) => [o.request, o.state] as const));
  for (const request of state.requests) {
    const organization = request.organization;
    if (organization === undefined) {
      continue;
    }
    const entry = organizations.get(organization);
    if (entry === undefined) {
      continue;
    }
    const committed = committedByRequest.get(request.id)?.size ?? 0;
    const expired = now > request.expiresAt;
    const hasOffer = state.offers.some((o) => o.request === request.id);
    entry.requests.push({
      requestId: request.id,
      threshold: request.threshold,
      committedParticipants: committed,
      evaluation: expired
        ? "EXPIRED"
        : hasOffer
          ? committed >= request.threshold
            ? "THRESHOLD_MET"
            : "THRESHOLD_NOT_MET"
          : "OPEN",
      orderState: orderStates.get(request.id),
    });
  }

  const fleetCounts = {} as Record<ResourceProjectionReference["status"], number>;
  for (const s of RESOURCE_STATUSES) {
    fleetCounts[s] = 0;
  }
  for (const resource of state.resources) {
    fleetCounts[resource.status] += 1;
  }
  const fleet: OperatorFleetSummary = {
    total: state.resources.length,
    revoked: state.resources.filter((r) => r.revoked).length,
    byStatus: fleetCounts,
  };

  return {
    principal,
    role: "operator",
    organizations: [...organizations.values()].map((entry) => ({
      organization: entry.organization,
      membersByState: entry.membersByState,
      totalMemberships: entry.totalMemberships,
      requests: entry.requests,
    })),
    fleet,
    authorityBoundaries: OPERATOR_AUTHORITY_BOUNDARIES,
  };
}

// ============================================================================
// Developer view — integration/contract surface state
// ============================================================================

export interface DeveloperContractFamily {
  schema: string;
}

export interface DeveloperVersionCompatibility {
  version: string;
  compatibleWith: readonly string[];
}

export interface DeveloperPackageSurface {
  package: string;
  entrypoint: string;
  /** Runtime-derived export list of the composed public contract. */
  exports: readonly string[];
}

export interface DeveloperStateRowKind {
  kind: string;
  rows: number;
}

export interface DeveloperView {
  principal: string;
  role: "developer";
  contractFamilies: readonly DeveloperContractFamily[];
  versionCompatibility: readonly DeveloperVersionCompatibility[];
  composedSurfaces: readonly DeveloperPackageSurface[];
  stateShape: readonly DeveloperStateRowKind[];
  boundaries: readonly string[];
}

/**
 * Explicit boundaries carried by every developer view.
 */
export const DEVELOPER_VIEW_BOUNDARIES: readonly string[] = [
  "integration surface only — no customer, consent or allocation data is exposed",
  "coordination (envelope validation, ShareNet seam, TCP transports) is owned by the P2-W2 lane and is not a declared surfaces dependency (architecture-policy.yaml); compose it at the app/journey level, not through this package",
  "export lists are runtime-derived from the composed public contracts — they reflect the actual surface, never a hand-maintained catalog",
];

const COMPOSED_SURFACES: readonly DeveloperPackageSurface[] = [
  {
    package: "@adcos/contracts",
    entrypoint: "src/index.ts",
    exports: Object.keys(contractsNs).sort(),
  },
  {
    package: "@adcos/economics",
    entrypoint: "src/contract.ts",
    exports: Object.keys(economicsNs).sort(),
  },
  {
    package: "@adcos/lab",
    entrypoint: "src/contract.ts",
    exports: Object.keys(labNs).sort(),
  },
  {
    package: "@adcos/organizations",
    entrypoint: "src/contract.ts",
    exports: Object.keys(organizationsNs).sort(),
  },
  {
    package: "@adcos/group-purchasing",
    entrypoint: "src/contract.ts",
    exports: Object.keys(groupPurchasingNs).sort(),
  },
];

/**
 * Build the developer integration/contract surface view. Pure; every field
 * is runtime-derived (schema registry keys, compatibility matrix, live
 * export lists, persisted row counts) — nothing is hand-declared.
 */
export function buildDeveloperView(state: SurfaceState, principal: string): DeveloperView {
  return {
    principal,
    role: "developer",
    contractFamilies: Object.keys(Schemas)
      .sort()
      .map((schema) => ({ schema })),
    versionCompatibility: Object.entries(VERSION_COMPATIBILITY_MATRIX).map(([version, priors]) => ({
      version,
      compatibleWith: priors.map((p) => versionKey(p)),
    })),
    composedSurfaces: COMPOSED_SURFACES,
    stateShape: [
      { kind: "consents", rows: state.consents.length },
      { kind: "resources", rows: state.resources.length },
      { kind: "observations", rows: state.observations.length },
      { kind: "memberships", rows: state.memberships.length },
      { kind: "mandates", rows: state.mandates.length },
      { kind: "requests", rows: state.requests.length },
      { kind: "offers", rows: state.offers.length },
      { kind: "commitments", rows: state.commitments.length },
      { kind: "opportunities", rows: state.opportunities.length },
      { kind: "orders", rows: state.orders.length },
    ],
    boundaries: DEVELOPER_VIEW_BOUNDARIES,
  };
}
