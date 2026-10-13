import type { ResourceProjectionReference, CapabilityObservation } from "@adcos/contracts";
import { advanceConsent, type ConsentEvent, type ConsentTransition } from "./journeys.js";
import type { CommandResult, ResourceConsentRecord, SurfaceState } from "./state.js";
// ============================================================================
// Resource & consent journey commands (pure). Every refusal is explicit and
// blocking — nothing is inferred, auto-authorized, or silently resumed.
//
// Doctrine:
// - enrollment never opts in: sharing begins only with an explicit OPT_IN
//   (advanceConsent; no silent resume from NOT_SHARED);
// - an unobserved resource is UNKNOWN — health is never fabricated;
// - observations update the resource (observed beats declared);
// - revocation is terminal for the resource: consent events and further
//   observations are refused; REVOKED dominates every surfaced share state.
// ============================================================================

export interface EnrollResourceInput {
  id: string;
  device: string;
  type: string;
  capability: string;
  modes: readonly string[];
  limits: Readonly<Record<string, number>>;
}

export interface ResourceEnrollResult extends CommandResult {
  resource?: ResourceProjectionReference;
  consent?: ResourceConsentRecord;
}

export function enrollResource(
  state: SurfaceState,
  actor: string,
  input: EnrollResourceInput,
  now: number,
): ResourceEnrollResult {
  if (state.resources.some((r) => r.id === input.id)) {
    return { applied: false, state, reason: `resource '${input.id}' is already enrolled` };
  }
  const resource: ResourceProjectionReference = {
    id: input.id,
    owner: actor,
    device: input.device,
    type: input.type,
    capability: input.capability,
    modes: [...input.modes],
    limits: { ...input.limits },
    status: "UNKNOWN",
    revoked: false,
  };
  const consent: ResourceConsentRecord = {
    resourceId: input.id,
    state: "NOT_SHARED",
    updatedAt: now,
  };
  return {
    applied: true,
    state: {
      ...state,
      resources: [...state.resources, resource],
      consents: [...state.consents, consent],
    },
    resource,
    consent,
  };
}

export interface ConsentEventResult extends CommandResult {
  consent?: ResourceConsentRecord;
  transition?: ConsentTransition;
}

export function applyConsentEvent(
  state: SurfaceState,
  actor: string,
  resourceId: string,
  event: ConsentEvent,
  now: number,
): ConsentEventResult {
  const resource = state.resources.find((r) => r.id === resourceId);
  if (resource === undefined) {
    return { applied: false, state, reason: `unknown resource '${resourceId}'` };
  }
  if (resource.owner !== actor) {
    return {
      applied: false,
      state,
      reason: `resource '${resourceId}' is owned by '${resource.owner}' — only the owner controls the consent journey`,
    };
  }
  if (resource.revoked) {
    return {
      applied: false,
      state,
      reason: `resource '${resourceId}' is revoked (terminal) — enroll a new resource to share again`,
    };
  }
  const current = state.consents.find((c) => c.resourceId === resourceId);
  const currentState = current?.state ?? "NOT_SHARED";
  const transition = advanceConsent(currentState, event);
  if (!transition.applied) {
    return { applied: false, state, transition, reason: transition.reason };
  }
  const consent: ResourceConsentRecord = {
    resourceId,
    state: transition.state,
    updatedAt: now,
  };
  const others = state.consents.filter((c) => c.resourceId !== resourceId);
  return {
    applied: true,
    state: { ...state, consents: [...others, consent] },
    consent,
    transition,
  };
}

export function revokeResource(
  state: SurfaceState,
  actor: string,
  resourceId: string,
): CommandResult {
  const resource = state.resources.find((r) => r.id === resourceId);
  if (resource === undefined) {
    return { applied: false, state, reason: `unknown resource '${resourceId}'` };
  }
  if (resource.owner !== actor) {
    return {
      applied: false,
      state,
      reason: `resource '${resourceId}' is owned by '${resource.owner}' — only the owner may revoke`,
    };
  }
  if (resource.revoked) {
    return {
      applied: false,
      state,
      reason: `resource '${resourceId}' is already revoked (terminal)`,
    };
  }
  const resources = state.resources.map((r) => (r.id === resourceId ? { ...r, revoked: true } : r));
  return { applied: true, state: { ...state, resources } };
}

export interface ObservationInput {
  status: CapabilityObservation["observed"]["status"];
  freshness?: number;
  evidence?: readonly string[];
  /** Owner-declared capability version for the observation's declared side. */
  declaredVersion: string;
}

export interface ObservationResult extends CommandResult {
  resource?: ResourceProjectionReference;
  observation?: CapabilityObservation;
}

export function recordObservation(
  state: SurfaceState,
  actor: string,
  resourceId: string,
  input: ObservationInput,
  now: number,
): ObservationResult {
  const resource = state.resources.find((r) => r.id === resourceId);
  if (resource === undefined) {
    return { applied: false, state, reason: `unknown resource '${resourceId}'` };
  }
  if (resource.owner !== actor) {
    return {
      applied: false,
      state,
      reason: `resource '${resourceId}' is owned by '${resource.owner}' — only the owner records observations`,
    };
  }
  if (resource.revoked) {
    return {
      applied: false,
      state,
      reason: `resource '${resourceId}' is revoked — observations are no longer accepted for the sharing surface`,
    };
  }
  const freshness = input.freshness ?? now;
  const observation: CapabilityObservation = {
    declared: {
      capability: resource.capability,
      version: input.declaredVersion,
      schedule: {},
      limits: { ...resource.limits },
    },
    observed: {
      status: input.status,
      freshness,
      evidence: input.evidence !== undefined ? [...input.evidence] : undefined,
    },
    evidenceClass: "OBSERVATION",
  };
  const updated: ResourceProjectionReference = { ...resource, status: input.status, freshness };
  const resources = state.resources.map((r) => (r.id === resourceId ? updated : r));
  // One latest observation per declared capability — the same association
  // semantics the landed coordination discovery uses (declared capability
  // match). Earlier observations for the capability are replaced in place.
  const others = state.observations.filter((o) => o.declared.capability !== resource.capability);
  return {
    applied: true,
    state: {
      ...state,
      resources,
      observations: [...others, observation],
    },
    resource: updated,
    observation,
  };
}
