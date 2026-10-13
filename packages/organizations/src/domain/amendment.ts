import type { OrganizationMandate } from "@adcos/contracts";
import { scopeCovers } from "./formation.js";
import { evaluateConsents, type ConsentRecord } from "./consent.js";

// ============================================================================
// Mandate amendment with explicit member-consent rules.
//
// Rules (INVARIANTS #24 — mandates are individually scoped, never blanket):
// - NARROWING (scope stays within the current scope, permissions only
//   removed, expiry not extended) requires the mandate PRINCIPAL's consent.
// - WIDENING (broader scope, added permissions, or an extended expiry)
//   requires UNANIMOUS consent of all active members.
// - Revoked/expired mandates cannot be amended (fail-closed).
// - Consent records must be affirmative and inside the explicit consent
//   window; stale/refused/future-dated records are noted, not counted.
// ============================================================================

export type MandateAmendmentClassification = "NARROWING" | "WIDENING";

export interface MandateAmendment {
  /** New scope (default: keep the current scope). */
  scope?: string;
  /** New permissions (default: keep the current permissions). */
  permissions?: string[];
  /** New expiry (default: keep the current expiry). */
  expiresAt?: number;
  /** Stated reason, carried into the amendment notes verbatim. */
  reason: string;
}

export interface AmendMandateOptions {
  mandate: OrganizationMandate;
  amendment: MandateAmendment;
  /** Caller-owned id for the amended mandate (the next version). */
  amendmentId: string;
  /** Active members (principals in MEMBER state) whose consent may be required. */
  activeMembers: readonly string[];
  consents: readonly ConsentRecord[];
  /** Maximum age of a usable consent record (ms; explicit, no default). */
  maxConsentAgeMs: number;
  now: number;
}

export interface MandateAmendmentResult {
  applied: boolean;
  classification: MandateAmendmentClassification;
  /** The amended mandate (present only when applied). */
  mandate?: OrganizationMandate;
  /** Principals whose affirmative consent was counted. */
  consentsConsidered: readonly string[];
  reason?: string;
  notes: readonly string[];
}

/**
 * Amend a mandate under explicit member-consent rules. Fail-closed: any
 * missing consent, an unknown member list state, or a revoked/expired base
 * mandate rejects the amendment with reasons — authority is never widened
 * silently.
 */
export function amendMandate(options: AmendMandateOptions): MandateAmendmentResult {
  const { mandate, amendment, now } = options;
  const notes: string[] = [`amendment reason: ${amendment.reason}`];

  if (mandate.revoked) {
    return rejected("NARROWING", "mandate is revoked — no amendment is possible", [], notes);
  }
  if (mandate.expiresAt !== undefined && now > mandate.expiresAt) {
    return rejected("NARROWING", "mandate is expired — no amendment is possible", [], notes);
  }

  const newScope = amendment.scope ?? mandate.scope;
  const newPermissions = amendment.permissions ?? mandate.permissions;
  const newExpiry = amendment.expiresAt ?? mandate.expiresAt;
  const classification = classify(mandate, newScope, newPermissions, newExpiry);
  const evaluation = evaluateConsents(options.consents, now, options.maxConsentAgeMs);
  notes.push(...evaluation.notes);
  const consentedSet = new Set(evaluation.counted);

  if (classification === "NARROWING") {
    if (!consentedSet.has(mandate.principal)) {
      return rejected(
        classification,
        `narrowing amendment requires the mandate principal's consent; ${mandate.principal} has not consented`,
        evaluation.counted,
        notes,
      );
    }
  } else {
    const missing = options.activeMembers.filter((m) => !consentedSet.has(m));
    if (options.activeMembers.length === 0) {
      return rejected(
        classification,
        "widening amendment requires unanimous active-member consent; no active members were recorded",
        evaluation.counted,
        notes,
      );
    }
    if (missing.length > 0) {
      return rejected(
        classification,
        `widening amendment requires unanimous consent of active members; missing: ${missing.join(", ")}`,
        evaluation.counted,
        notes,
      );
    }
  }

  const amended: OrganizationMandate = {
    id: options.amendmentId,
    organization: mandate.organization,
    principal: mandate.principal,
    scope: newScope,
    permissions: newPermissions,
    issuedAt: now,
    expiresAt: newExpiry,
    revoked: false,
  };
  notes.push(`mandate ${mandate.id} amended to ${options.amendmentId} (${classification})`);

  return {
    applied: true,
    classification,
    mandate: amended,
    consentsConsidered: evaluation.counted,
    notes,
  };
}

function classify(
  mandate: OrganizationMandate,
  newScope: string,
  newPermissions: string[],
  newExpiry: number | undefined,
): MandateAmendmentClassification {
  const scopeNarrowed = scopeCovers(mandate.scope, newScope);
  const permissionsNarrowed = newPermissions.every((p) => mandate.permissions.includes(p));
  const expiryNarrowed =
    mandate.expiresAt === undefined || newExpiry === undefined || newExpiry <= mandate.expiresAt;
  return scopeNarrowed && permissionsNarrowed && expiryNarrowed ? "NARROWING" : "WIDENING";
}

function rejected(
  classification: MandateAmendmentClassification,
  reason: string,
  consentsConsidered: readonly string[],
  notes: string[],
): MandateAmendmentResult {
  return {
    applied: false,
    classification,
    consentsConsidered,
    reason,
    notes: [...notes, reason],
  };
}
