import type { EvaluationVerdict } from "@adcos/economics";
import type { OrganizationMembership, OrganizationMandate } from "@adcos/contracts";

// ============================================================================
// Organization founding from a Lab PURSUE verdict — beyond the membership
// machine: candidate gathering → founder consent → formation with initial
// mandate.
//
// INVARIANTS #21/#24: the Lab (and its PURSUE verdict) only PROPOSES — it can
// never found an organization by itself; explicit founder consent decides.
// FORMED is an agreement state: NOT legal incorporation and NOT unlimited
// authority to bind members (group-organizations spec §1).
// ============================================================================

export type FoundingState =
  | "GATHERING"
  | "CONSENT_PENDING"
  | "FORMED"
  | "DISSOLVED"
  | "FORMATION_FAILED";

export interface FounderCandidate {
  principal: string;
  /** Founder consent: false until the principal has explicitly consented. */
  consent: boolean;
  /** When the consent was recorded (epoch ms); required for a valid consent. */
  consentRecordedAt?: number;
}

export interface InitialMandateInput {
  /** Founding principal the mandate is issued to (must be a consenting founder). */
  principal: string;
  /** Mandate scope; must stay within the organization authority scope. */
  scope: string;
  permissions: string[];
  expiresAt?: number;
}

export interface FoundingInput {
  organization: string;
  /** The Lab opportunity evidence this founding derives from (provenance). */
  pursuitEvidenceId: string;
  /** The economics verdict on that evidence — only PURSUE can found. */
  pursuitVerdict: EvaluationVerdict;
  /** Evidence expiry: stale verdicts cannot found (fail-closed). */
  pursuitExpiresAt?: number;
  /** Founder candidates gathered for this formation. */
  candidates: readonly FounderCandidate[];
  /** Minimum viable founding membership (explicit; no default). */
  minFounders: number;
  /** The organization's authority scope; initial mandates stay within it. */
  authorityScope: string;
  /** Initial mandates to issue at formation (one per consenting founder). */
  initialMandates: readonly InitialMandateInput[];
  now: number;
}

export interface FoundingResult {
  state: FoundingState;
  organization: string;
  /** Consenting founders (present when FORMED). */
  founders: readonly string[];
  /** Candidates whose valid consent is still missing (when not FORMED). */
  consentGaps: readonly string[];
  pursuitEvidenceId: string;
  /** Founder memberships in MEMBER state (present when FORMED). */
  memberships: readonly OrganizationMembership[];
  /** Mandates issued at formation (present when FORMED). */
  mandates: readonly OrganizationMandate[];
  notes: readonly string[];
}

/**
 * Prefix-scope coverage, identical to the merged mandateCovers semantics
 * (minus revocation/expiry, which are mandate properties): 'group.purchase'
 * covers 'group.purchase.offers' but not 'group.purchasing' or 'group'.
 */
export function scopeCovers(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) {
    return true;
  }
  return (
    ancestor.split(".").length < descendant.split(".").length &&
    descendant.startsWith(`${ancestor}.`)
  );
}

/**
 * Found an organization from a Lab PURSUE verdict. Fail-closed: an
 * inadmissible verdict, a stale verdict, an under-sized candidate pool, a
 * consent gap that cannot close, or a mandate/founder mismatch yields
 * FORMATION_FAILED (or CONSENT_PENDING while consent is still gatherable)
 * with explicit reasons — never a partially formed organization.
 */
export function foundOrganization(input: FoundingInput): FoundingResult {
  const notes: string[] = [];
  const base = {
    organization: input.organization,
    founders: [] as string[],
    consentGaps: [] as string[],
    pursuitEvidenceId: input.pursuitEvidenceId,
    memberships: [] as OrganizationMembership[],
    mandates: [] as OrganizationMandate[],
    notes,
  };

  if (input.pursuitVerdict !== "PURSUE") {
    return failed(
      base,
      `verdict ${input.pursuitVerdict} cannot found an organization — the Lab proposes; explicit founder consent decides (INVARIANTS #21)`,
    );
  }
  if (input.pursuitExpiresAt !== undefined && input.now > input.pursuitExpiresAt) {
    return failed(
      base,
      `pursuit evidence ${input.pursuitEvidenceId} expired — re-evaluate before founding`,
    );
  }
  if (input.minFounders < 1) {
    return failed(base, "minFounders must be at least 1");
  }
  if (input.candidates.length < input.minFounders) {
    return failed(
      base,
      `candidate pool ${input.candidates.length} below minimum viable founding membership ${input.minFounders}`,
    );
  }

  // Candidate gathering → founder consent. A consent without a valid record
  // date is not consent (fail-closed).
  const consented: string[] = [];
  const gaps: string[] = [];
  for (const c of input.candidates) {
    const dated =
      c.consent && c.consentRecordedAt !== undefined && c.consentRecordedAt <= input.now;
    if (dated) {
      consented.push(c.principal);
    } else {
      if (c.consent && c.consentRecordedAt === undefined) {
        notes.push(`consent for ${c.principal} has no record date — not counted`);
      } else if (
        c.consent &&
        c.consentRecordedAt !== undefined &&
        c.consentRecordedAt > input.now
      ) {
        notes.push(`consent for ${c.principal} is future-dated — not counted`);
      } else {
        notes.push(`founder candidate ${c.principal} has not consented`);
      }
      gaps.push(c.principal);
    }
  }

  if (consented.length < input.minFounders) {
    return {
      ...base,
      state: "CONSENT_PENDING",
      consentGaps: gaps,
      notes: [
        ...notes,
        `consent incomplete: ${consented.length}/${input.minFounders} founders consented — nothing is committed without consent`,
      ],
    };
  }

  // Formation with initial mandates: one per consenting founder, inside the
  // organization authority scope, unexpired at issuance.
  const consentedSet = new Set(consented);
  for (const m of input.initialMandates) {
    if (!consentedSet.has(m.principal)) {
      return failed(
        base,
        `initial mandate for '${m.principal}' targets a principal that has not consented`,
      );
    }
    if (!scopeCovers(input.authorityScope, m.scope)) {
      return failed(
        base,
        `mandate scope '${m.scope}' for ${m.principal} is outside the organization authority scope '${input.authorityScope}'`,
      );
    }
    if (m.expiresAt !== undefined && m.expiresAt <= input.now) {
      return failed(base, `mandate for ${m.principal} expires in the past`);
    }
  }
  const mandated = new Set(input.initialMandates.map((m) => m.principal));
  for (const founder of consented) {
    if (!mandated.has(founder)) {
      return failed(base, `consenting founder '${founder}' has no initial mandate`);
    }
  }

  const founders = [...consented].sort();
  const memberships: OrganizationMembership[] = founders.map((principal) => ({
    id: `${input.organization}-mem-${principal}`,
    organization: input.organization,
    principal,
    state: "MEMBER",
    role: "founder",
    joinedAt: input.now,
    revoked: false,
  }));
  const mandates: OrganizationMandate[] = input.initialMandates.map((m) => ({
    id: `${input.organization}-mand-${m.principal}`,
    organization: input.organization,
    principal: m.principal,
    scope: m.scope,
    permissions: m.permissions,
    issuedAt: input.now,
    expiresAt: m.expiresAt,
    revoked: false,
  }));
  notes.push(
    `organization ${input.organization} formed from PURSUE verdict ${input.pursuitEvidenceId} with ${founders.length} founders — agreement state only: not legal incorporation, not blanket authority to bind members (INVARIANTS #24)`,
  );

  return {
    state: "FORMED",
    organization: input.organization,
    founders,
    consentGaps: [],
    pursuitEvidenceId: input.pursuitEvidenceId,
    memberships,
    mandates,
    notes,
  };
}

function failed(
  base: Omit<FoundingResult, "state" | "notes"> & { notes: string[] },
  reason: string,
): FoundingResult {
  return { ...base, state: "FORMATION_FAILED", notes: [...base.notes, reason] };
}
