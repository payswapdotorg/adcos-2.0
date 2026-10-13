import {
  EnvelopeSchema,
  isEnvelopeExpired,
  validateScope,
  type Envelope,
  type EventLifecycle,
  type Message,
} from "@adcos/contracts";
import { beginProcessing, recordOutcome, isDeadLettered } from "../../domain/inbox.js";
import type { JsonlInboxStore } from "../jsonl-inbox-store.js";
import { TcpTransportClient, asTransportError, isTransportError } from "./tcp-transport.js";
import { createFrameId } from "./wire-protocol.js";
import type { EndpointEvent, SendReport, SendState } from "./endpoint-types.js";

// ============================================================================
// Outbox sender — the retry/dead-letter machine for envelopes going OUT onto
// the wire. Reuses the merged EventLifecycle functions (beginProcessing /
// recordOutcome / isDeadLettered) so wire re-sends obey exactly the same
// semantics as inbox processing.
//
// Egress gates (fail closed, checked before EVERY attempt — including
// retries, so an envelope that expires while offline is REFUSED, never
// blindly re-sent):
//   - malformed envelope            -> REFUSED (never touches the wire)
//   - expired (isEnvelopeExpired)   -> REFUSED (renewed authorization needed)
//   - scope outside egressScopes    -> REFUSED (sender-side policy)
//
// Delivery outcomes:
//   - ACK                            -> DELIVERED
//   - REJECT containing code REPLAY  -> DELIVERED_DUPLICATE (the receiver
//     already accepted this envelope; at-least-once transport +
//     receiver-side duplicate suppression = effectively-once domain effect)
//   - REJECT (any other code)        -> REJECTED (receiver policy is
//     authoritative; no blind retry of refused consequential commands)
//   - transport failure              -> FAILED, retried within the budget
//     with a delay; exhaustion dead-letters (observable, never silent)
// ============================================================================

export interface OutboxOptions {
  /** Durable outbox store (entry snapshots per lifecycle transition). */
  store?: JsonlInboxStore;
  /** Sender-side egress scope allowlist; empty (default) refuses everything. */
  egressScopes: readonly string[];
  /** Injected clock. */
  now: () => number;
  /** Delay between transport attempts (ms). */
  retryDelayMs?: number;
  /** Per-send ack timeout (ms). */
  ackTimeoutMs?: number;
  onEvent?: (event: EndpointEvent) => void;
}

export interface OutboxSendOptions {
  readonly host: string;
  readonly port: number;
  readonly payload?: Record<string, unknown>;
  /** Total processing attempts allowed before dead-letter (default 3). */
  readonly maxRetries?: number;
  /** Override of the constructor retry delay (ms). */
  readonly retryDelayMs?: number;
}

export class OutboxSender {
  private disposed = false;

  constructor(private readonly options: OutboxOptions) {}

  dispose(): void {
    this.disposed = true;
  }

  /** A terminal COMPLETED entry must not carry a stale failure reason. */
  private static withoutReason(lifecycle: EventLifecycle): EventLifecycle {
    const clone = { ...lifecycle };
    delete (clone as { deadLetterReason?: string }).deadLetterReason;
    return clone;
  }

  private emit(event: EndpointEvent): void {
    this.options.onEvent?.(event);
  }

  private entryFor(
    envelope: Envelope,
    payload: Record<string, unknown>,
    maxRetries: number,
  ): Message {
    const timestamp = this.options.now();
    return {
      id: `outbox-${envelope.eventId}`,
      envelope,
      payload,
      lifecycle: { state: "PENDING", attempts: 0, maxRetries },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /** Egress gate: fail-closed checks re-run before every attempt. */
  private gate(envelope: Envelope): { ok: true } | { ok: false; reason: string } {
    const parsed = EnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      return {
        ok: false,
        reason: `refused: malformed envelope (${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")})`,
      };
    }
    if (isEnvelopeExpired(envelope, this.options.now())) {
      return {
        ok: false,
        reason: `refused: envelope expired while pending (expiresAt ${envelope.expiresAt} <= now ${this.options.now()}; renewed authorization required, never blind replay)`,
      };
    }
    if (!validateScope(envelope.scope, [...this.options.egressScopes])) {
      return {
        ok: false,
        reason: `refused: scope '${envelope.scope}' not in sender's egress list`,
      };
    }
    return { ok: true };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async send(envelope: Envelope, sendOptions: OutboxSendOptions): Promise<SendReport> {
    const maxRetries = sendOptions.maxRetries ?? 3;
    const retryDelayMs = sendOptions.retryDelayMs ?? this.options.retryDelayMs ?? 50;
    const payload = sendOptions.payload ?? {};
    let entry = this.entryFor(envelope, payload, maxRetries);
    this.options.store?.append(entry);

    const refused = this.gate(envelope);
    if (refused.ok === false) {
      entry = {
        ...entry,
        lifecycle: { ...entry.lifecycle, state: "REJECTED", deadLetterReason: refused.reason },
        updatedAt: this.options.now(),
      };
      this.options.store?.append(entry);
      this.emit({ kind: "outbox-refused", messageId: entry.id, reason: refused.reason });
      return this.report(entry, "REFUSED", 0, refused.reason);
    }

    const client = new TcpTransportClient(sendOptions.host, sendOptions.port, {
      ackTimeoutMs: this.options.ackTimeoutMs,
    });
    let attempts = 0;
    try {
      for (;;) {
        if (this.disposed) {
          return this.report(
            entry,
            "DEAD-LETTERED",
            attempts,
            "sender disposed before delivery (observable, not silent)",
          );
        }
        const gate = this.gate(envelope);
        if (gate.ok === false) {
          entry = {
            ...entry,
            lifecycle: { ...entry.lifecycle, state: "REJECTED", deadLetterReason: gate.reason },
            updatedAt: this.options.now(),
          };
          this.options.store?.append(entry);
          this.emit({ kind: "outbox-refused", messageId: entry.id, reason: gate.reason });
          return this.report(entry, "REFUSED", attempts, gate.reason);
        }

        const begin = beginProcessing(entry, this.options.now());
        if (!begin.applied) {
          const reason = begin.reason ?? "begin refused";
          this.emit({ kind: "outbox-deadletter", messageId: entry.id, reason });
          return this.report(entry, "DEAD-LETTERED", attempts, reason);
        }
        entry = {
          ...entry,
          lifecycle: { ...entry.lifecycle, state: begin.state, attempts: begin.attempts },
          updatedAt: this.options.now(),
        };
        this.options.store?.append(entry);
        attempts += 1;
        this.emit({ kind: "outbox-attempt", messageId: entry.id, attempt: attempts });

        try {
          const frameId = createFrameId("outbox");
          const response = await client.sendFrame({ type: "ENVELOPE", frameId, envelope });
          if (response.type === "ACK") {
            const outcome = recordOutcome(entry, "COMPLETED", this.options.now());
            entry = {
              ...entry,
              lifecycle: {
                ...OutboxSender.withoutReason(entry.lifecycle),
                state: outcome.state,
                attempts: outcome.attempts,
              },
              updatedAt: this.options.now(),
            };
            this.options.store?.append(entry);
            this.emit({
              kind: "outbox-delivered",
              messageId: entry.id,
              duplicate: false,
              ackMessageId: response.messageId,
            });
            return this.report(entry, "DELIVERED", attempts);
          }
          if (response.type === "ENVELOPE") {
            // The receiver must answer ACK or REJECT; an ENVELOPE reply is
            // protocol noise — fail this attempt as a transport failure.
            throw asTransportError("receiver replied with an ENVELOPE frame (protocol noise)");
          }
          const failures = [...response.failures];
          const isReplay = failures.some((failure) => failure.code === "REPLAY");
          if (isReplay) {
            const outcome = recordOutcome(entry, "COMPLETED", this.options.now());
            entry = {
              ...entry,
              lifecycle: {
                ...OutboxSender.withoutReason(entry.lifecycle),
                state: outcome.state,
                attempts: outcome.attempts,
              },
              updatedAt: this.options.now(),
            };
            this.options.store?.append(entry);
            this.emit({
              kind: "outbox-delivered",
              messageId: entry.id,
              duplicate: true,
            });
            return this.report(
              entry,
              "DELIVERED_DUPLICATE",
              attempts,
              "duplicate suppressed by receiver replay guard",
              failures,
            );
          }
          const reason = `receiver rejected: ${failures
            .map((failure) => `${failure.code}(${failure.detail})`)
            .join("; ")}`;
          const outcome = recordOutcome(entry, "REJECTED", this.options.now(), {
            deadLetterReason: reason,
          });
          entry = {
            ...entry,
            lifecycle: { ...entry.lifecycle, state: outcome.state, attempts: outcome.attempts },
            updatedAt: this.options.now(),
          };
          this.options.store?.append(entry);
          this.emit({ kind: "outbox-rejected", messageId: entry.id, failures });
          return this.report(entry, "REJECTED", attempts, reason, failures);
        } catch (error) {
          const transportDetail = isTransportError(error)
            ? error.message
            : `unexpected error: ${(error as Error).message}`;
          const outcome = recordOutcome(entry, "FAILED", this.options.now());
          const deadLetterReason = outcome.deadLetterReason ?? transportDetail;
          entry = {
            ...entry,
            lifecycle: {
              ...entry.lifecycle,
              state: outcome.state,
              attempts: outcome.attempts,
              deadLetterReason,
            },
            updatedAt: this.options.now(),
          };
          this.options.store?.append(entry);
          if (isDeadLettered(entry.lifecycle)) {
            const reason = `transport failures exhausted budget: ${transportDetail}`;
            this.emit({ kind: "outbox-deadletter", messageId: entry.id, reason });
            return this.report(entry, "DEAD-LETTERED", attempts, reason);
          }
          await this.sleep(retryDelayMs);
        }
      }
    } finally {
      client.close();
    }
  }

  private report(
    entry: Message,
    state: SendState,
    attempts: number,
    reason?: string,
    failures?: readonly { code: string; detail: string }[],
  ): SendReport {
    return {
      messageId: entry.id,
      eventId: entry.envelope.eventId,
      state,
      attempts,
      reason,
      failures,
      lifecycle: entry.lifecycle,
    };
  }
}
