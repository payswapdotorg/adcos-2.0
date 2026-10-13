import type { EventLifecycle, Message } from "@adcos/contracts";
import type { WireFailure } from "./wire-protocol.js";

// ============================================================================
// Shared coordination-runtime types (events, handler outcomes, send reports).
// Kept in a dedicated dependency-free module so the inbox endpoint and the
// outbox sender both depend on these types without importing each other
// (the architecture checker forbids cycles, including type-only imports).
// ============================================================================

/** Result a message handler produces for one processing attempt. */
export type HandlerOutcome =
  | { readonly outcome: "COMPLETED"; readonly deadLetterReason?: string }
  | { readonly outcome: "REJECTED"; readonly deadLetterReason?: string }
  | {
      readonly outcome: "FAILED";
      readonly deadLetterReason?: string;
      /** true = requires reconciliation before retry (Status.reconcile semantics). */
      readonly reconcileRequired?: boolean;
    };

/** Message handler invoked by the dispatch pump. Throwing counts as FAILED. */
export type MessageHandler = (message: Message) => HandlerOutcome | Promise<HandlerOutcome>;

/** Terminal state of one outbox send, from the sender's point of view. */
export type SendState =
  | "DELIVERED"
  | "DELIVERED_DUPLICATE"
  | "REJECTED"
  | "REFUSED"
  | "DEAD-LETTERED";

/** Observable result of an outbox send (also the ack contract to callers). */
export interface SendReport {
  readonly messageId: string;
  readonly eventId: string;
  readonly state: SendState;
  /** Transport attempts actually made (refused sends make zero attempts). */
  readonly attempts: number;
  /** Refusal / rejection / dead-letter reason, when applicable. */
  readonly reason?: string;
  /** Receiver-side validation failures when state is REJECTED. */
  readonly failures?: readonly WireFailure[];
  /** Final lifecycle snapshot of the outbox entry (durable evidence). */
  readonly lifecycle: EventLifecycle;
}

/** Events emitted by the coordination runtime (inbox + outbox sides). */
export type EndpointEvent =
  | { readonly kind: "inbox-accepted"; readonly messageId: string; readonly eventId: string }
  | {
      readonly kind: "inbox-rejected";
      readonly eventId: string;
      readonly failures: readonly WireFailure[];
    }
  | {
      readonly kind: "lifecycle";
      readonly messageId: string;
      readonly state: EventLifecycle["state"];
      readonly attempts: number;
      readonly deadLetterReason?: string;
    }
  | { readonly kind: "deadletter"; readonly messageId: string; readonly reason: string }
  | { readonly kind: "outbox-refused"; readonly messageId: string; readonly reason: string }
  | {
      readonly kind: "outbox-rejected";
      readonly messageId: string;
      readonly failures: readonly WireFailure[];
    }
  | {
      readonly kind: "outbox-delivered";
      readonly messageId: string;
      readonly duplicate: boolean;
      readonly ackMessageId?: string;
    }
  | { readonly kind: "outbox-deadletter"; readonly messageId: string; readonly reason: string }
  | { readonly kind: "outbox-attempt"; readonly messageId: string; readonly attempt: number };

export function endpointEventDescription(event: EndpointEvent): string {
  switch (event.kind) {
    case "inbox-accepted":
      return `inbox accepted ${event.messageId} (event ${event.eventId})`;
    case "inbox-rejected":
      return `inbox rejected event ${event.eventId}: ${event.failures
        .map((failure) => `${failure.code}(${failure.detail})`)
        .join(", ")}`;
    case "lifecycle":
      return `lifecycle ${event.messageId} -> ${event.state} (attempts ${event.attempts})`;
    case "deadletter":
      return `dead-letter ${event.messageId}: ${event.reason}`;
    case "outbox-refused":
      return `outbox refused ${event.messageId}: ${event.reason}`;
    case "outbox-rejected":
      return `outbox rejected ${event.messageId}: ${event.failures
        .map((failure) => failure.code)
        .join(", ")}`;
    case "outbox-delivered":
      return `outbox delivered ${event.messageId}${event.duplicate ? " (duplicate)" : ""}`;
    case "outbox-deadletter":
      return `outbox dead-letter ${event.messageId}: ${event.reason}`;
    case "outbox-attempt":
      return `outbox attempt #${event.attempt} for ${event.messageId}`;
  }
}
