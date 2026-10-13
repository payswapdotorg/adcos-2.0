import type { OrganizationMembership } from "@adcos/contracts";
import {
  evaluateOpportunity,
  type EvaluationPolicy,
  type EvaluationVerdict,
} from "@adcos/economics";
import { runComparison, asOpportunityEvidence, type StrategyArm } from "@adcos/lab";
import {
  foundOrganization,
  advanceMembership,
  mandateCovers,
  type FounderCandidate,
  type InitialMandateInput,
  type FoundingResult,
  type MembershipEvent,
  type MembershipTransition,
} from "@adcos/organizations";
import type { CommandResult, SurfaceState } from "./state.js";

// ============================================================================
// Lab evaluation, organization formation and membership commands (pure).
//
// INVARIANTS #21/#24: the Lab proposes (runComparison + evaluateOpportunity,
// advisory only); founding requires the persisted PURSUE evidence AND
// explicit founder consent (foundOrganization); membership transitions run
// through the merged advanceMembership machine with service-level authority
// checks (invitee-own response, mandate-gated management events).
// ============================================================================

export interface LabEvaluationInput {
  id: string;
  intent: string;
  baseline: StrategyArm;
  alternatives: readonly StrategyArm[];
  selectedStrategy: string;
  confidence: number;
  assumptions: readonly string[];
  expiresAt?: number;
  policy?: EvaluationPolicy;
}

export interface LabEvaluationResult extends CommandResult {
  verdict?: EvaluationVerdict;
  reasons?: readonly string[];
  opportunityId?: string;
}

/** Run a Lab baseline/no-change comparison and persist the opportunity. */
export function runLabEvaluation(
  state: SurfaceState,
  input: LabEvaluationInput,
  now: number,
): LabEvaluationResult {
  if (state.opportunities.some((o) => o.id === `${input.id}-opportunity`)) {
    return {
      applied: false,
      state,
      reason: `opportunity id '${input.id}-opportunity' already exists`,
    };
  }
  const evidence = runComparison({
    id: input.id,
    intent: input.intent,
    baseline: input.baseline,
    alternatives: [...input.alternatives],
    selectedStrategy: input.selectedStrategy,
    confidence: input.confidence,
    assumptions: [...input.assumptions],
    evaluatedAt: now,
    expiresAt: input.expiresAt,
  });
  const evaluation = evaluateOpportunity(evidence, input.policy);
  const recommendation =
    evaluation.verdict === "PURSUE"
      ? `pursue ${input.selectedStrategy}`
      : `do not pursue ${input.selectedStrategy} (${evaluation.reasons.join("; ")})`;
  const opportunity = asOpportunityEvidence(evidence, recommendation, {
    id: `${input.id}-opportunity`,
  });
  return {
    applied: true,
    state: { ...state, opportunities: [...state.opportunities, opportunity] },
    verdict: evaluation.verdict,
    reasons: evaluation.reasons,
    opportunityId: opportunity.id,
  };
}

export interface FormationInput {
  organization: string;
  /** Persisted Lab opportunity id this founding derives from. */
  pursuitEvidenceId: string;
  candidates: readonly FounderCandidate[];
  minFounders: number;
  authorityScope: string;
  initialMandates: readonly InitialMandateInput[];
}

export interface FormationResult extends CommandResult {
  founding?: FoundingResult;
}

/**
 * Found an organization from a persisted PURSUE verdict. The verdict is
 * RECOMPUTED from the persisted evidence at formation time (never trusted
 * from a cached decision), and stale evidence fails closed.
 */
export function formOrganization(
  state: SurfaceState,
  actor: string,
  input: FormationInput,
  now: number,
): FormationResult {
  if (state.memberships.some((m) => m.organization === input.organization)) {
    return {
      applied: false,
      state,
      reason: `organization '${input.organization}' already exists in state`,
    };
  }
  if (!input.candidates.some((c) => c.principal === actor)) {
    return {
      applied: false,
      state,
      reason: `actor '${actor}' is not among the founder candidates of '${input.organization}'`,
    };
  }
  const opportunity = state.opportunities.find((o) => o.id === input.pursuitEvidenceId);
  if (opportunity === undefined) {
    return {
      applied: false,
      state,
      reason: `no persisted Lab evidence '${input.pursuitEvidenceId}' — the Lab proposes; evidence must exist before founding`,
    };
  }
  // Recompute the verdict from the persisted evidence at formation time.
  const evaluation = evaluateOpportunity(opportunity.evidence);
  const founding = foundOrganization({
    organization: input.organization,
    pursuitEvidenceId: input.pursuitEvidenceId,
    pursuitVerdict: evaluation.verdict,
    pursuitExpiresAt: opportunity.evidence.expiresAt,
    candidates: input.candidates,
    minFounders: input.minFounders,
    authorityScope: input.authorityScope,
    initialMandates: input.initialMandates,
    now,
  });
  if (founding.state !== "FORMED") {
    return {
      applied: false,
      state,
      founding,
      reason: `formation not completed: ${founding.state} — ${founding.notes.join("; ")}`,
    };
  }
  return {
    applied: true,
    state: {
      ...state,
      memberships: [...state.memberships, ...founding.memberships],
      mandates: [...state.mandates, ...founding.mandates],
    },
    founding,
  };
}

export interface MembershipEventInput {
  organization: string;
  principal: string;
  event: MembershipEvent;
}

export interface MembershipEventResult extends CommandResult {
  transition?: MembershipTransition;
  membership?: OrganizationMembership;
}

/** Mandate scope that authorizes membership management events. */
export const MEMBERSHIP_MANAGE_SCOPE = "group.membership";

export interface InviteMemberInput {
  organization: string;
  principal: string;
}

export interface InviteMemberResult extends CommandResult {
  transition?: MembershipTransition;
  membership?: OrganizationMembership;
}

/**
 * Invite a principal into an organization. When no membership row exists,
 * the invite CREATES the candidate row and advances it to INVITED (the
 * membership machine's entry); when a row exists, the INVITE event runs
 * through the machine (legality is the machine's call). Requires an active
 * membership-management mandate held by the inviting actor.
 */
export function inviteMember(
  state: SurfaceState,
  actor: string,
  input: InviteMemberInput,
  now: number,
): InviteMemberResult {
  const existing = state.memberships.find(
    (m) => m.organization === input.organization && m.principal === input.principal,
  );
  if (existing !== undefined) {
    return applyMembershipEvent(state, actor, { ...input, event: "INVITE" }, now);
  }
  const authorized = state.memberships.some(
    (m) =>
      m.organization === input.organization &&
      m.principal === actor &&
      m.state === "MEMBER" &&
      state.mandates.some(
        (mandate) =>
          mandate.organization === input.organization &&
          mandate.principal === actor &&
          mandateCovers(mandate, MEMBERSHIP_MANAGE_SCOPE, now),
      ),
  );
  if (!authorized) {
    return {
      applied: false,
      state,
      reason: `inviting requires an active membership-management mandate ('${MEMBERSHIP_MANAGE_SCOPE}') in '${input.organization}' held by '${actor}'`,
    };
  }
  if (input.principal === actor) {
    return {
      applied: false,
      state,
      reason: "a principal cannot invite themselves (self-invitation is not a consent path)",
    };
  }
  const candidate: OrganizationMembership = {
    id: `${input.organization}-mem-${input.principal}`,
    organization: input.organization,
    principal: input.principal,
    state: "CANDIDATE",
    role: "member",
    joinedAt: now,
    revoked: false,
  };
  const withCandidate: SurfaceState = {
    ...state,
    memberships: [...state.memberships, candidate],
  };
  return applyMembershipEvent(withCandidate, actor, { ...input, event: "INVITE" }, now);
}

/**
 * Apply a membership event with service-level authority checks:
 * - INVITE / SUSPEND / RESUME / REVOKE require the actor to be a MEMBER of
 *   the organization holding an active mandate covering membership scope;
 * - ACCEPT_INVITE / DECLINE_INVITE can only be performed by the invitee.
 */
export function applyMembershipEvent(
  state: SurfaceState,
  actor: string,
  input: MembershipEventInput,
  now: number,
): MembershipEventResult {
  const membership = state.memberships.find(
    (m) => m.organization === input.organization && m.principal === input.principal,
  );
  if (membership === undefined) {
    return {
      applied: false,
      state,
      reason: `no membership record for '${input.principal}' in '${input.organization}'`,
    };
  }
  const selfService = input.event === "ACCEPT_INVITE" || input.event === "DECLINE_INVITE";
  if (selfService) {
    if (actor !== input.principal) {
      return {
        applied: false,
        state,
        reason: `event ${input.event} can only be performed by the invited principal '${input.principal}'`,
      };
    }
  } else {
    const authorized = state.memberships.some(
      (m) =>
        m.organization === input.organization &&
        m.principal === actor &&
        m.state === "MEMBER" &&
        state.mandates.some(
          (mandate) =>
            mandate.organization === input.organization &&
            mandate.principal === actor &&
            mandateCovers(mandate, MEMBERSHIP_MANAGE_SCOPE, now),
        ),
    );
    if (!authorized) {
      return {
        applied: false,
        state,
        reason: `event ${input.event} requires an active membership-management mandate ('${MEMBERSHIP_MANAGE_SCOPE}') in '${input.organization}' held by '${actor}'`,
      };
    }
  }
  const transition = advanceMembership(membership, input.event, now);
  if (!transition.applied) {
    return { applied: false, state, transition, reason: transition.reason };
  }
  const updated: OrganizationMembership = {
    ...membership,
    state: transition.state,
    revoked: transition.state === "REVOKED" ? true : membership.revoked,
    revocationReason:
      transition.state === "REVOKED"
        ? `revoked by '${actor}' at ${now}`
        : membership.revocationReason,
  };
  const memberships = state.memberships.map((m) => (m.id === membership.id ? updated : m));
  return {
    applied: true,
    state: { ...state, memberships },
    transition,
    membership: updated,
  };
}

/** Active (MEMBER-state) memberships of a principal in an organization. */
export function activeMembership(
  state: SurfaceState,
  principal: string,
  organization: string,
): OrganizationMembership | undefined {
  return state.memberships.find(
    (m) => m.organization === organization && m.principal === principal && m.state === "MEMBER",
  );
}

/** True when the principal holds an active mandate covering the scope. */
export function holdsMandate(
  state: SurfaceState,
  principal: string,
  organization: string,
  scope: string,
  now: number,
): boolean {
  return state.mandates.some(
    (mandate) =>
      mandate.organization === organization &&
      mandate.principal === principal &&
      mandateCovers(mandate, scope, now),
  );
}
