import type {
  OrganizationMembership,
  OrganizationMandate,
  MembershipState,
} from "@adcos/contracts";

// ============================================================================
// Membership lifecycle — explicit state machine, invalid transitions rejected
// ============================================================================

/**
 * Lifecycle events the membership state machine understands. Anything else is
 * rejected — unknown events fail closed (INVARIANTS: unknown before FAILED).
 */
export type MembershipEvent =
  | "INVITE"
  | "ACCEPT_INVITE"
  | "DECLINE_INVITE"
  | "SUSPEND"
  | "RESUME"
  | "REVOKE";

/**
 * Legal state transitions:
 *   CANDIDATE --INVITE--> INVITED
 *   INVITED   --ACCEPT_INVITE--> MEMBER
 *   INVITED   --DECLINE_INVITE--> CANDIDATE (returns to pool, never silently MEMBER)
 *   MEMBER    --SUSPEND--> SUSPENDED
 *   SUSPENDED --RESUME--> MEMBER
 *   CANDIDATE | INVITED | MEMBER | SUSPENDED --REVOKE--> REVOKED (terminal)
 * REVOKED is terminal: no transitions out.
 */
const TRANSITIONS: Record<MembershipState, Partial<Record<MembershipEvent, MembershipState>>> = {
  CANDIDATE: { INVITE: "INVITED", REVOKE: "REVOKED" },
  INVITED: { ACCEPT_INVITE: "MEMBER", DECLINE_INVITE: "CANDIDATE", REVOKE: "REVOKED" },
  MEMBER: { SUSPEND: "SUSPENDED", REVOKE: "REVOKED" },
  SUSPENDED: { RESUME: "MEMBER", REVOKE: "REVOKED" },
  REVOKED: {},
};

export interface MembershipTransition {
  /** New membership state after applying the event (unchanged when rejected). */
  state: MembershipState;
  /** True when the event was applied; false when it was rejected. */
  applied: boolean;
  /** Rejection reason when applied is false. */
  reason?: string;
}

/**
 * Apply a lifecycle event to a membership. Pure: returns the transition
 * result without mutating the input; the caller owns persistence.
 */
export function advanceMembership(
  membership: OrganizationMembership,
  event: MembershipEvent,
  now: number,
): MembershipTransition {
  const target = TRANSITIONS[membership.state][event];
  if (membership.revoked || membership.state === "REVOKED") {
    return {
      state: membership.state,
      applied: false,
      reason: "membership is revoked (terminal state)",
    };
  }
  if (target === undefined) {
    return {
      state: membership.state,
      applied: false,
      reason: `event ${event} is not legal in state ${membership.state}`,
    };
  }
  if (membership.expiresAt !== undefined && now > membership.expiresAt) {
    return {
      state: membership.state,
      applied: false,
      reason: "membership expired; renewal flow required, not a lifecycle event",
    };
  }
  return { state: target, applied: true };
}

// ============================================================================
// Mandate scope checks — no authority without an unrevoked, unexpired mandate
// ============================================================================

/**
 * Check whether a mandate authorizes an action scope. Scope semantics are
 * prefix-based on dot-separated segments: 'group.purchase' authorizes
 * 'group.purchase.offers' but NOT 'group' or 'group.purchasing'. The literal
 * scope and its descendants are covered; siblings are not.
 */
export function mandateCovers(mandate: OrganizationMandate, scope: string, now: number): boolean {
  if (mandate.revoked) {
    return false;
  }
  if (mandate.expiresAt !== undefined && now > mandate.expiresAt) {
    return false;
  }
  if (mandate.scope === scope) {
    return true;
  }
  return (
    mandate.scope.split(".").length < scope.split(".").length &&
    scope.startsWith(`${mandate.scope}.`)
  );
}
