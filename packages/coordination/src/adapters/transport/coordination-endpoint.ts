import type { Message, Envelope } from "@adcos/contracts";
import { validateEnvelope, createEnvelopeReplayGuard } from "../../domain/envelope-validation.js";
import { beginProcessing, recordOutcome, isDeadLettered } from "../../domain/inbox.js";
import type { JsonlInboxStore, InboxStoreStats } from "../jsonl-inbox-store.js";
import { TcpTransportListener } from "./tcp-transport.js";
import type { WireFrame } from "./wire-protocol.js";
import { OutboxSender, type OutboxSendOptions } from "./outbox-sender.js";
import type {
  EndpointEvent,
  HandlerOutcome,
  MessageHandler,
  SendReport,
} from "./endpoint-types.js";

// ============================================================================
// Coordination endpoint — one runtime instance's wire presence.
//
// Receive path (per spec/cross-device-coordination.md, "before dispatch"):
//   wire frame -> validateEnvelope (identity/scope/schema/freshness/policy
//   epoch/size) + envelope replay guard -> ONLY THEN the durable inbox
//   append (write-before-ack) -> ACK frame back. Rejections are REJECT
//   frames carrying the failure codes — observable, never silent drops.
//
// Dispatch pump: PENDING -> PROCESSING -> terminal via the merged
// EventLifecycle machine (beginProcessing / recordOutcome / isDeadLettered),
// every transition appended to the durable store as a snapshot line.
// Fail-closed default: no handler configured => messages are REJECTED.
//
// Send path: delegated to OutboxSender (same lifecycle machine on the
// egress side; expiry re-checked before every attempt).
// ============================================================================

const DEFAULT_FAIL_CLOSED_HANDLER: MessageHandler = () => ({
  outcome: "REJECTED",
  deadLetterReason: "no handler configured (fail closed)",
});

export interface CoordinationEndpointOptions {
  readonly instanceId: string;
  /** Durable inbox store for received messages (required). */
  readonly store: JsonlInboxStore;
  /** Durable outbox store for send attempts (optional but recommended). */
  readonly outboxStore?: JsonlInboxStore;
  /** Receiver's accepted scopes (validateScope semantics). */
  readonly allowedScopes: readonly string[];
  /** Receiver's known sender instance ids. */
  readonly knownSenders: readonly string[];
  /** Unknown senders fail closed (default true). */
  readonly requireKnownSender?: boolean;
  /** Receiver's highest observed policy epoch (default 0). */
  readonly currentPolicyEpoch?: number;
  /** Receiver's payload-digest size gate (default 64). */
  readonly maxPayloadDigestLength?: number;
  /** Sender's egress scopes; empty (default) refuses every send (fail closed). */
  readonly egressScopes?: readonly string[];
  /** Dispatch handler; default rejects everything (fail closed). */
  readonly handler?: MessageHandler;
  /** Retry budget for received messages (default 3, same as merged tests). */
  readonly inboxMaxRetries?: number;
  readonly onEvent?: (event: EndpointEvent) => void;
  /** Injected clock (default Date.now). */
  readonly now?: () => number;
  /** Retry delay for inbox retries and default outbox retries (ms). */
  readonly retryDelayMs?: number;
  /** Per-send ack timeout for the outbox client (ms). */
  readonly ackTimeoutMs?: number;
  /** Frame size cap for both directions. */
  readonly maxFrameBytes?: number;
}

export class CoordinationEndpoint {
  readonly instanceId: string;
  private readonly store: JsonlInboxStore;
  private readonly outbox: OutboxSender;
  private readonly listener: TcpTransportListener;
  private handler: MessageHandler;
  private readonly onEvent?: (event: EndpointEvent) => void;
  private readonly now: () => number;
  private readonly retryDelayMs: number;
  private readonly replayGuard = createEnvelopeReplayGuard();
  private readonly reconcileRequired = new Set<string>();
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private pumping = false;

  constructor(private readonly options: CoordinationEndpointOptions) {
    this.instanceId = options.instanceId;
    this.store = options.store;
    this.handler = options.handler ?? DEFAULT_FAIL_CLOSED_HANDLER;
    this.onEvent = options.onEvent;
    this.now = options.now ?? (() => Date.now());
    this.retryDelayMs = options.retryDelayMs ?? 50;
    this.outbox = new OutboxSender({
      store: options.outboxStore,
      egressScopes: options.egressScopes ?? [],
      now: this.now,
      retryDelayMs: this.retryDelayMs,
      ackTimeoutMs: options.ackTimeoutMs,
      onEvent: (event) => this.emit(event),
    });
    this.listener = new TcpTransportListener(async (frame) => this.receiveEnvelope(frame), {
      maxFrameBytes: options.maxFrameBytes,
    });
  }

  private emit(event: EndpointEvent): void {
    this.onEvent?.(event);
  }

  /** Start listening for envelopes (port 0 = kernel-assigned). */
  async listen(port: number, host = "127.0.0.1"): Promise<{ port: number }> {
    await this.listener.listen(port, host);
    return { port: this.listener.port };
  }

  /** Stop listening and destroy live connections (models a partition). */
  async stopListening(): Promise<void> {
    await this.listener.close();
  }

  get listening(): boolean {
    return this.listener.listening;
  }

  setHandler(handler: MessageHandler): void {
    this.handler = handler;
  }

  /**
   * Receive one ENVELOPE frame: validate -> replay guard -> durable append
   * -> ACK (append strictly precedes the ack: write-before-ack). Rejected
   * envelopes return a REJECT frame with every failure code and are never
   * stored. Public so tests can drive the pipeline without a socket.
   */
  async receiveEnvelope(frame: Extract<WireFrame, { type: "ENVELOPE" }>): Promise<WireFrame> {
    const validation = validateEnvelope(
      frame.envelope,
      {
        allowedScopes: this.options.allowedScopes,
        currentPolicyEpoch: this.options.currentPolicyEpoch ?? 0,
        knownSenders: this.options.knownSenders,
        requireKnownSender: this.options.requireKnownSender ?? true,
        maxPayloadDigestLength: this.options.maxPayloadDigestLength ?? 64,
        now: this.now(),
      },
      this.replayGuard,
    );
    const eventId =
      typeof (frame.envelope as { eventId?: unknown })?.eventId === "string"
        ? String((frame.envelope as { eventId: string }).eventId)
        : "(unknown)";
    if (!validation.accepted) {
      this.emit({ kind: "inbox-rejected", eventId, failures: [...validation.failures] });
      return { type: "REJECT", frameId: frame.frameId, failures: [...validation.failures] };
    }
    const envelope = frame.envelope as Envelope;
    const timestamp = this.now();
    const message: Message = {
      id: `msg-${envelope.eventId}`,
      envelope,
      payload: {},
      lifecycle: { state: "PENDING", attempts: 0, maxRetries: this.options.inboxMaxRetries ?? 3 },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.append(message);
    this.emit({ kind: "inbox-accepted", messageId: message.id, eventId });
    setImmediate(() => {
      void this.processInbox();
    });
    return { type: "ACK", frameId: frame.frameId, messageId: message.id };
  }

  /**
   * Dispatch pump: advance every PENDING / retryable FAILED message through
   * the merged EventLifecycle machine, appending each transition to the
   * store. Schedules itself again after retryDelayMs whenever a FAILED
   * message still has budget left. Dead letters are events + store lines,
   * never silent drops.
   */
  async processInbox(): Promise<void> {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    let retryScheduled = false;
    try {
      for (const message of this.store.list()) {
        const lifecycle = message.lifecycle;
        const deadLetter = isDeadLettered(lifecycle, this.reconcileRequired.has(message.id));
        const retryable =
          lifecycle.state === "PENDING" || (lifecycle.state === "FAILED" && !deadLetter);
        if (!retryable) {
          continue;
        }
        const begin = beginProcessing(message, this.now(), {
          reconcileRequired: this.reconcileRequired.has(message.id),
        });
        if (!begin.applied) {
          this.emit({
            kind: "lifecycle",
            messageId: message.id,
            state: lifecycle.state,
            attempts: lifecycle.attempts,
            deadLetterReason: begin.reason,
          });
          continue;
        }
        let current: Message = {
          ...message,
          lifecycle: { ...lifecycle, state: begin.state, attempts: begin.attempts },
          updatedAt: this.now(),
        };
        this.store.append(current);
        this.emit({
          kind: "lifecycle",
          messageId: current.id,
          state: current.lifecycle.state,
          attempts: current.lifecycle.attempts,
        });
        const outcome = await this.runHandler(current);
        const transition = recordOutcome(current, outcome.outcome, this.now(), {
          deadLetterReason: outcome.deadLetterReason,
        });
        if (transition.applied) {
          current = {
            ...current,
            lifecycle: {
              ...current.lifecycle,
              state: transition.state,
              attempts: transition.attempts,
              deadLetterReason: transition.deadLetterReason,
            },
            updatedAt: this.now(),
          };
          this.store.append(current);
          this.emit({
            kind: "lifecycle",
            messageId: current.id,
            state: current.lifecycle.state,
            attempts: current.lifecycle.attempts,
            deadLetterReason: current.lifecycle.deadLetterReason,
          });
          if (outcome.outcome === "FAILED" && outcome.reconcileRequired === true) {
            this.reconcileRequired.add(current.id);
          }
        }
        if (
          current.lifecycle.state === "FAILED" &&
          !isDeadLettered(current.lifecycle, this.reconcileRequired.has(current.id))
        ) {
          retryScheduled = true;
        }
        if (isDeadLettered(current.lifecycle, this.reconcileRequired.has(current.id))) {
          this.emit({
            kind: "deadletter",
            messageId: current.id,
            reason: current.lifecycle.deadLetterReason ?? "retry budget exhausted",
          });
        }
      }
    } finally {
      this.pumping = false;
    }
    if (retryScheduled && this.pumpTimer === null) {
      this.pumpTimer = setTimeout(() => {
        this.pumpTimer = null;
        void this.processInbox();
      }, this.retryDelayMs);
    }
  }

  private async runHandler(message: Message): Promise<HandlerOutcome> {
    try {
      return await this.handler(message);
    } catch (error) {
      return {
        outcome: "FAILED",
        deadLetterReason: `handler threw: ${(error as Error).message}`,
      };
    }
  }

  /** Send an envelope through the outbox (see OutboxSender semantics). */
  send(envelope: Envelope, sendOptions: OutboxSendOptions): Promise<SendReport> {
    return this.outbox.send(envelope, sendOptions);
  }

  /** Durable inbox stats (messages loaded + torn tail lines, if any). */
  stats(): { inbox: InboxStoreStats } {
    return { inbox: this.store.stats() };
  }

  /** Stop retry timers and fail pending outbox sends observably. */
  dispose(): void {
    this.outbox.dispose();
    if (this.pumpTimer !== null) {
      clearTimeout(this.pumpTimer);
      this.pumpTimer = null;
    }
    void this.stopListening();
  }
}
