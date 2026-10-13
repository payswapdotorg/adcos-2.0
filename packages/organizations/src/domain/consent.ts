// ============================================================================
// Explicit consent records — shared validation for mandate amendment and
// organization dissolution.
//
// Rules (fail-closed, INVARIANTS #24): a consent counts only when it is an
// affirmative record dated within the consent window [now - maxConsentAgeMs,
// now]. Refusals, stale records, and future-dated records are not counted
// and are surfaced as notes — never silently ignored.
// ============================================================================

export interface ConsentRecord {
  principal: string;
  /** Affirmative consent; false is a refusal. */
  consent: boolean;
  /** When the consent was recorded (epoch ms). */
  recordedAt: number;
}

export interface ConsentEvaluation {
  /** Principals whose affirmative consent was counted. */
  counted: readonly string[];
  notes: readonly string[];
}

/**
 * Evaluate consent records against the window. There is deliberately no
 * default for the window length — the caller states it explicitly.
 */
export function evaluateConsents(
  records: readonly ConsentRecord[],
  now: number,
  maxConsentAgeMs: number,
): ConsentEvaluation {
  const counted: string[] = [];
  const notes: string[] = [];
  for (const r of records) {
    if (!r.consent) {
      notes.push(`consent record for ${r.principal} is a refusal — not counted`);
      continue;
    }
    if (r.recordedAt > now) {
      notes.push(`consent record for ${r.principal} is future-dated — not counted`);
      continue;
    }
    if (r.recordedAt < now - maxConsentAgeMs) {
      notes.push(
        `consent record for ${r.principal} is stale (older than ${maxConsentAgeMs}ms) — not counted`,
      );
      continue;
    }
    counted.push(r.principal);
  }
  return { counted, notes };
}
