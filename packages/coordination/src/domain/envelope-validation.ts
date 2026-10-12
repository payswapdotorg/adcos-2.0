import {
  EnvelopeSchema,
  isEnvelopeExpired,
  validateScope,
  createReplayGuard,
  type Envelope,
  type ReplayGuard,
} from "@adcos/contracts";

// ============================================================================
// Envelope validation pipeline — the pre-dispatch gate from
// spec/cross-device-coordination.md: "Before dispatch, validate identity,
// scope, schema, size, freshness/expiry, policy epoch, authorization,
// replay/duplicate status and local resource permissions. Unknown or
// malformed consequential commands fail closed."
// ============================================================================

export interface ValidationContext {
  /** Receiver's allowed scope list (validateScope semantics). */
  allowedScopes: readonly string[];
  /** Highest policy epoch the receiver has observed (older epochs rejected). */
  currentPolicyEpoch: number;
  /** Known sender instance ids (identity check; empty list = open discovery
   *  mode, recorded as a note, never silently accepted for consequential
   *  commands — see requireKnownSender). */
  knownSenders: readonly string[];
  /** When true, unknown senders fail closed. */
  requireKnownSender: boolean;
  /** Maximum accepted payload digest length (size gate proxy). */
  maxPayloadDigestLength: number;
  /** Injected clock. */
  now: number;
}

export interface ValidationFailure {
  code:
    | "MALFORMED"
    | "EXPIRED"
    | "OUT_OF_SCOPE"
    | "STALE_POLICY_EPOCH"
    | "UNKNOWN_SENDER"
    | "OVERSIZED"
    | "REPLAY";
  /** Human-readable failure detail (asserted in tests, logged in ops). */
  detail: string;
}

export interface ValidationResult {
  /** True when every gate passed and the envelope may be dispatched. */
  accepted: boolean;
  /** Failures in evaluation order (empty when accepted). */
  failures: readonly ValidationFailure[];
}

/**
 * Validate an envelope for dispatch. Pure except for the caller-owned
 * replay guard (duplicate state is inherently session-scoped). All checks
 * fail closed; an envelope without optional auth fields passes only when
 * the context does not require them.
 */
export function validateEnvelope(
  envelopeInput: unknown,
  context: ValidationContext,
  replayGuard?: ReplayGuard,
): ValidationResult {
  const failures: ValidationFailure[] = [];

  const parsed = EnvelopeSchema.safeParse(envelopeInput);
  if (!parsed.success) {
    return {
      accepted: false,
      failures: [
        {
          code: "MALFORMED",
          detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        },
      ],
    };
  }
  const envelope: Envelope = parsed.data;

  if (isEnvelopeExpired(envelope, context.now)) {
    failures.push({
      code: "EXPIRED",
      detail: `expiresAt ${envelope.expiresAt} <= now ${context.now}`,
    });
  }

  if (!validateScope(envelope.scope, [...context.allowedScopes])) {
    failures.push({
      code: "OUT_OF_SCOPE",
      detail: `scope '${envelope.scope}' not in receiver's allowed list`,
    });
  }

  if (envelope.policyEpoch !== undefined && envelope.policyEpoch < context.currentPolicyEpoch) {
    failures.push({
      code: "STALE_POLICY_EPOCH",
      detail: `epoch ${envelope.policyEpoch} < current ${context.currentPolicyEpoch}`,
    });
  }

  const known = context.knownSenders.includes(envelope.sender);
  if (!known && context.requireKnownSender) {
    failures.push({
      code: "UNKNOWN_SENDER",
      detail: `sender '${envelope.sender}' is not in the receiver's known list`,
    });
  }

  if (
    envelope.payloadDigest !== undefined &&
    envelope.payloadDigest.length > context.maxPayloadDigestLength
  ) {
    failures.push({
      code: "OVERSIZED",
      detail: `payloadDigest length ${envelope.payloadDigest.length} > ${context.maxPayloadDigestLength}`,
    });
  }

  if (replayGuard && !replayGuard.check(envelope)) {
    failures.push({
      code: "REPLAY",
      detail: `duplicate idempotencyKey/eventId '${envelope.idempotencyKey ?? envelope.eventId}'`,
    });
  }

  return { accepted: failures.length === 0, failures };
}

/**
 * Convenience constructor for the replay guard bound to the validation
 * pipeline (bounded FIFO eviction under load).
 */
export function createEnvelopeReplayGuard(options?: { maxEntries?: number }): ReplayGuard {
  return createReplayGuard(options);
}
