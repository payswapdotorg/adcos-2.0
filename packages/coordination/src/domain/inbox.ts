import type { Message, EventLifecycle } from "@adcos/contracts";

// ============================================================================
// Durable inbox/outbox lifecycle — EventLifecycle state machine with retry
// budget, dead-letter and reconcile-before-retry semantics.
//
// The reconcile requirement is carried by the canonical Status type
// (Status.reconcile: "requires reconciliation before retry"), not by
// EventLifecycle; callers derive it from the last observed status and pass
// it explicitly — the lifecycle engine itself stays contract-shaped.
// ============================================================================

/**
 * Lifecycle transitions:
 *   PENDING → PROCESSING → COMPLETED | FAILED | REJECTED | CANCELLED
 *   FAILED → PROCESSING (retry, while attempts < maxRetries AND no pending
 *            reconciliation requirement)
 *   FAILED → dead-letter (attempts exhausted or reconciliation required)
 *   CANCELLED/COMPLETED/REJECTED are terminal.
 */
export interface LifecycleTransition {
  state: EventLifecycle["state"];
  attempts: number;
  deadLetterReason?: string;
  applied: boolean;
  reason?: string;
}

const TERMINAL: ReadonlySet<EventLifecycle["state"]> = new Set([
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
]);

/**
 * Begin processing a message (PENDING → PROCESSING; retry from FAILED allowed
 * only within the retry budget and without a pending reconciliation
 * requirement).
 */
export function beginProcessing(
  message: Message,
  now: number,
  options?: { reconcileRequired?: boolean },
): LifecycleTransition {
  const lifecycle = message.lifecycle;
  if (TERMINAL.has(lifecycle.state)) {
    return {
      state: lifecycle.state,
      attempts: lifecycle.attempts,
      applied: false,
      reason: `state ${lifecycle.state} is terminal`,
    };
  }
  if (lifecycle.state === "FAILED") {
    if (options?.reconcileRequired === true) {
      return {
        state: lifecycle.state,
        attempts: lifecycle.attempts,
        applied: false,
        reason: "reconciliation required before retry (Status.reconcile)",
      };
    }
    if (lifecycle.attempts >= lifecycle.maxRetries) {
      return {
        state: lifecycle.state,
        attempts: lifecycle.attempts,
        applied: false,
        reason: `retry budget exhausted (${lifecycle.attempts}/${lifecycle.maxRetries})`,
      };
    }
  }
  return {
    state: "PROCESSING",
    attempts: lifecycle.state === "FAILED" ? lifecycle.attempts + 1 : lifecycle.attempts,
    applied: true,
  };
}

/**
 * Record a processing attempt's outcome. Terminal outcomes only from
 * PROCESSING; failure consumes the retry budget; the dead-letter reason is
 * attached automatically when the budget is exhausted.
 */
export function recordOutcome(
  message: Message,
  outcome: "COMPLETED" | "FAILED" | "REJECTED" | "CANCELLED",
  now: number,
  options?: { deadLetterReason?: string },
): LifecycleTransition {
  const lifecycle = message.lifecycle;
  if (lifecycle.state !== "PROCESSING") {
    return {
      state: lifecycle.state,
      attempts: lifecycle.attempts,
      applied: false,
      reason: `outcome can only be recorded while PROCESSING (state: ${lifecycle.state})`,
    };
  }
  const attempts = outcome === "FAILED" ? lifecycle.attempts + 1 : lifecycle.attempts;
  const deadLetterReason =
    outcome === "FAILED" && attempts >= lifecycle.maxRetries
      ? (options?.deadLetterReason ??
        `retry budget exhausted (${attempts}/${lifecycle.maxRetries})`)
      : options?.deadLetterReason;
  const transition: LifecycleTransition = { state: outcome, attempts, applied: true };
  if (deadLetterReason !== undefined) {
    transition.deadLetterReason = deadLetterReason;
  }
  return transition;
}

/**
 * Dead-letter check: a FAILED message with an exhausted budget or a pending
 * reconciliation requirement is dead-lettered (delivered to the DLQ owner,
 * never silently dropped, never auto-retried).
 */
export function isDeadLettered(lifecycle: EventLifecycle, reconcileRequired?: boolean): boolean {
  return (
    lifecycle.state === "FAILED" &&
    (lifecycle.attempts >= lifecycle.maxRetries || reconcileRequired === true)
  );
}
