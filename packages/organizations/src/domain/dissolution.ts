import type { OrganizationMembership, GroupPurchaseCommitment } from "@adcos/contracts";
import { advanceMembership } from "./lifecycle.js";
import { evaluateConsents, type ConsentRecord } from "./consent.js";
import type { FoundingResult } from "./formation.js";

// ============================================================================
// Organization dissolution / termination.
//
// What happens to open commitments at dissolution: every commitment bound to
// a member of this organization receives an EXPLICIT disposition — already
// expired commitments are EXPIRED, revoked ones ALREADY_CLOSED, open ones
// MARKED_UNUSABLE. There is NO transfer: this module exposes no path that
// could move a commitment to another organization or member, and commitments
// belonging to non-members are OUT_OF_AUTHORITY (not wound down here).
//
// Memberships are closed through the merged membership machine (REVOKE —
// terminal), with a recorded revocation reason.
// ============================================================================

export type CommitmentDispositionKind =
  | "EXPIRED"
  | "MARKED_UNUSABLE"
  | "ALREADY_CLOSED"
  | "OUT_OF_AUTHORITY";

export interface CommitmentDisposition {
  commitment: string;
  participant: string;
  disposition: CommitmentDispositionKind;
  reason: string;
}

export interface DissolutionInput {
  organization: string;
  /** The current formation record of the organization. */
  formation: FoundingResult;
  /** Current memberships of the organization. */
  memberships: readonly OrganizationMembership[];
  /** Open group-purchase commitments to wind down. */
  commitments: readonly GroupPurchaseCommitment[];
  /** Consent records for the dissolution decision. */
  consents: readonly ConsentRecord[];
  /** Maximum age of a usable consent record (ms; explicit, no default). */
  maxConsentAgeMs: number;
  now: number;
}

export interface DissolutionResult {
  applied: boolean;
  /** FORMED → DISSOLVED on success; unchanged when rejected. */
  state: FoundingResult["state"];
  /** Post-dissolution membership records (REVOKED via the merged machine). */
  memberships: readonly OrganizationMembership[];
  /** Explicit disposition for every input commitment — none is transferred. */
  commitmentDispositions: readonly CommitmentDisposition[];
  reason?: string;
  notes: readonly string[];
}

/**
 * Dissolve a formed organization. Fail-closed: dissolution requires unanimous
 * consent of all active (MEMBER-state) members; anything else is rejected
 * with reasons. On success every input commitment receives an explicit
 * disposition (expired / marked-unusable / already closed / out of authority)
 * and every membership is closed through the merged lifecycle machine.
 */
export function dissolveOrganization(input: DissolutionInput): DissolutionResult {
  const notes: string[] = [];
  const base = {
    memberships: [] as OrganizationMembership[],
    commitmentDispositions: [] as CommitmentDisposition[],
    notes,
  };

  if (input.formation.state === "DISSOLVED") {
    return reject(
      base,
      input.formation.state,
      `organization ${input.organization} is already dissolved (terminal)`,
    );
  }
  if (input.formation.state !== "FORMED") {
    return reject(
      base,
      input.formation.state,
      `organization ${input.organization} is ${input.formation.state} — only a formed organization can dissolve`,
    );
  }

  const ownMemberships = input.memberships.filter((m) => {
    if (m.organization !== input.organization) {
      notes.push(`membership ${m.id} belongs to ${m.organization} — not touched`);
      return false;
    }
    return true;
  });
  const memberPrincipals = new Set(ownMemberships.map((m) => m.principal));
  const active = ownMemberships.filter((m) => m.state === "MEMBER");
  const suspended = ownMemberships.filter((m) => m.state === "SUSPENDED");
  if (suspended.length > 0) {
    notes.push(
      `suspended members (${suspended.map((m) => m.principal).join(", ")}) do not vote on dissolution per stated terms`,
    );
  }

  const evaluation = evaluateConsents(input.consents, input.now, input.maxConsentAgeMs);
  notes.push(...evaluation.notes);
  const consentedSet = new Set(evaluation.counted);
  const missing = active.map((m) => m.principal).filter((p) => !consentedSet.has(p));
  if (missing.length > 0) {
    return reject(
      { ...base, notes },
      input.formation.state,
      `dissolution requires unanimous active-member consent; missing: ${missing.join(", ")}`,
    );
  }

  // Wind down every commitment explicitly — nothing is ever transferred.
  const commitmentDispositions: CommitmentDisposition[] = input.commitments.map((c) => {
    if (!memberPrincipals.has(c.participant)) {
      return {
        commitment: c.id,
        participant: c.participant,
        disposition: "OUT_OF_AUTHORITY" as const,
        reason: `participant ${c.participant} is not a member of ${input.organization} — not wound down by this organization`,
      };
    }
    if (c.revoked) {
      return {
        commitment: c.id,
        participant: c.participant,
        disposition: "ALREADY_CLOSED" as const,
        reason: "commitment is already revoked",
      };
    }
    if (c.expiresAt !== undefined && input.now > c.expiresAt) {
      return {
        commitment: c.id,
        participant: c.participant,
        disposition: "EXPIRED" as const,
        reason: "commitment already expired at dissolution",
      };
    }
    return {
      commitment: c.id,
      participant: c.participant,
      disposition: "MARKED_UNUSABLE" as const,
      reason: `organization ${input.organization} dissolved — open commitment marked unusable, never transferred`,
    };
  });

  // Close memberships through the merged lifecycle machine (REVOKE terminal).
  const memberships = ownMemberships.map((m) => {
    const transition = advanceMembership(m, "REVOKE", input.now);
    if (!transition.applied) {
      notes.push(
        `membership ${m.id} for ${m.principal} could not be revoked: ${transition.reason ?? "unknown"}`,
      );
      return m;
    }
    return {
      ...m,
      state: transition.state,
      revoked: true,
      revocationReason: "organization dissolved",
    };
  });

  notes.push(
    `organization ${input.organization} dissolved: ${memberships.length} memberships closed, ${commitmentDispositions.length} commitments dispositioned`,
  );

  return {
    applied: true,
    state: "DISSOLVED",
    memberships,
    commitmentDispositions,
    notes,
  };
}

function reject(
  base: {
    memberships: OrganizationMembership[];
    commitmentDispositions: CommitmentDisposition[];
    notes: string[];
  },
  state: FoundingResult["state"],
  reason: string,
): DissolutionResult {
  return {
    applied: false,
    state,
    memberships: base.memberships,
    commitmentDispositions: base.commitmentDispositions,
    reason,
    notes: [...base.notes, reason],
  };
}
