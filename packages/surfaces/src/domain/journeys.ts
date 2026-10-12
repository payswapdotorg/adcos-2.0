// ============================================================================
// Customer opt-in/opt-out journey — the sharing consent state machine.
// Sharing is revocable at any time; consent never silently re-enables.
// ============================================================================

export type ConsentEvent = "OPT_IN" | "OPT_OUT" | "PAUSE" | "RESUME";

/**
 * Consent states:
 *   NOT_SHARED --OPT_IN--> SHARED
 *   SHARED     --OPT_OUT--> NOT_SHARED
 *   SHARED     --PAUSE--> PAUSED
 *   PAUSED     --RESUME--> SHARED
 *   PAUSED     --OPT_OUT--> NOT_SHARED
 * NOT_SHARED requires a fresh OPT_IN (no silent resume); OPT_IN is the only
 * entry into SHARED.
 */
const CONSENT_TRANSITIONS: Record<string, Partial<Record<ConsentEvent, string>>> = {
  NOT_SHARED: { OPT_IN: "SHARED" },
  SHARED: { OPT_OUT: "NOT_SHARED", PAUSE: "PAUSED" },
  PAUSED: { RESUME: "SHARED", OPT_OUT: "NOT_SHARED" },
};

export interface ConsentTransition {
  state: "NOT_SHARED" | "SHARED" | "PAUSED";
  applied: boolean;
  reason?: string;
}

/**
 * Apply a consent event to a sharing journey. Pure; the caller owns
 * persistence and re-confirmation UX.
 */
export function advanceConsent(
  state: "NOT_SHARED" | "SHARED" | "PAUSED",
  event: ConsentEvent,
): ConsentTransition {
  const target = CONSENT_TRANSITIONS[state]?.[event];
  if (target === undefined) {
    return {
      state,
      applied: false,
      reason: `consent event ${event} is not legal in state ${state}`,
    };
  }
  return { state: target as ConsentTransition["state"], applied: true };
}
