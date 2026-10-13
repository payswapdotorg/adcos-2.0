import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CoordinationEndpoint } from "../src/adapters/transport/coordination-endpoint.js";
import { JsonlInboxStore } from "../src/adapters/jsonl-inbox-store.js";
import { isDeadLettered } from "../src/domain/inbox.js";
import type {
  EndpointEvent,
  HandlerOutcome,
  MessageHandler,
} from "../src/adapters/transport/endpoint-types.js";
import type { Message, Envelope } from "@adcos/contracts";

// ============================================================================
// Coordination endpoint tests — the receive pipeline (validateEnvelope +
// replay guard BEFORE dispatch; durable inbox lifecycle on receipt) and the
// outbox sender (egress gate, retry/dead-letter on real TCP connections).
//
// Receive-path tests drive receiveEnvelope directly (the listener wiring is
// covered by tcp-transport.test.ts); outbox tests use real sockets between
// two endpoints, each with its own on-disk JSONL store.
// ============================================================================

const SCOPE = "device.forwarding";
const now = () => Date.now();

let envelopeCounter = 0;
const envelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: `evt-endpoint-${(envelopeCounter += 1)}`,
  sender: "inst-b",
  receiver: "inst-a",
  scope: SCOPE,
  issuedAt: now(),
  ...overrides,
});

interface EndpointOptions {
  role: "receiver" | "sender";
  handler?: MessageHandler;
  egressScopes?: string[];
  allowedScopes?: string[];
  knownSenders?: string[];
  inboxMaxRetries?: number;
  retryDelayMs?: number;
}

interface EndpointHandle {
  endpoint: CoordinationEndpoint;
  inbox: string;
  outbox: string;
}

interface TestContext {
  dir: string;
  events: EndpointEvent[];
  endpoints: CoordinationEndpoint[];
  makeEndpoint(options: EndpointOptions): EndpointHandle;
  freePort(): Promise<number>;
}

const contexts: TestContext[] = [];

function createTestContext(): TestContext {
  const dir = mkdtempSync(join(tmpdir(), "adcos-endpoint-"));
  const events: EndpointEvent[] = [];
  const endpoints: CoordinationEndpoint[] = [];
  const context: TestContext = {
    dir,
    events,
    endpoints,
    makeEndpoint(options) {
      const index = endpoints.length;
      const inbox = join(dir, `${options.role}-${index}-inbox.jsonl`);
      const outbox = join(dir, `${options.role}-${index}-outbox.jsonl`);
      const instanceId = options.role === "receiver" ? "inst-a" : "inst-b";
      const endpoint = new CoordinationEndpoint({
        instanceId,
        store: new JsonlInboxStore(inbox),
        outboxStore: new JsonlInboxStore(outbox),
        allowedScopes: options.allowedScopes ?? [SCOPE],
        knownSenders: options.knownSenders ?? ["inst-b"],
        requireKnownSender: true,
        egressScopes: options.egressScopes ?? [SCOPE],
        // Tests default to the success handler; the production endpoint's
        // own default (no handler => REJECTED, fail closed) is covered by
        // its own dedicated test below.
        handler: options.handler ?? (() => ({ outcome: "COMPLETED" as const })),
        ...(options.inboxMaxRetries !== undefined
          ? { inboxMaxRetries: options.inboxMaxRetries }
          : {}),
        retryDelayMs: options.retryDelayMs ?? 20,
        onEvent: (event) => events.push(event),
      });
      endpoints.push(endpoint);
      return { endpoint, inbox, outbox };
    },
    async freePort() {
      const probe = context.makeEndpoint({ role: "sender", egressScopes: [] });
      const { port } = await probe.endpoint.listen(0);
      await probe.endpoint.stopListening();
      return port;
    },
  };
  contexts.push(context);
  return context;
}

after(() => {
  for (const context of contexts) {
    for (const endpoint of context.endpoints) {
      endpoint.dispose();
    }
    rmSync(context.dir, { recursive: true, force: true });
  }
});

async function waitFor(check: () => boolean, timeoutMs = 4000, stepMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error("waitFor: condition not met before timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

function readLines(path: string): Message[] {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Message);
}

function foldMessages(messages: Message[]): Message[] {
  const indexById = new Map<string, number>();
  const folded: Message[] = [];
  for (const message of messages) {
    const index = indexById.get(message.id);
    if (index === undefined) {
      indexById.set(message.id, folded.length);
      folded.push(message);
    } else {
      folded[index] = message;
    }
  }
  return folded;
}

describe("receive pipeline: validateEnvelope + replay guard before dispatch", () => {
  it("accepts a valid envelope, appends it BEFORE acking, then processes it to COMPLETED", async () => {
    const context = createTestContext();
    const { endpoint, inbox } = context.makeEndpoint({ role: "receiver" });
    const response = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-1",
      envelope: envelope(),
    });
    assert.equal(response.type, "ACK");
    // write-before-ack: the PENDING receipt is already durable on disk.
    assert.equal(readLines(inbox).length, 1);
    assert.equal(readLines(inbox)[0]?.lifecycle.state, "PENDING");
    await waitFor(() => foldMessages(readLines(inbox))[0]?.lifecycle.state === "COMPLETED");
    // The physical file carries the full transition history.
    assert.deepEqual(
      readLines(inbox).map((line) => line.lifecycle.state),
      ["PENDING", "PROCESSING", "COMPLETED"],
    );
    assert.ok(context.events.some((event) => event.kind === "inbox-accepted"));
  });

  it("rejects a replayed envelope (same idempotency key) with REPLAY and stores it exactly once", async () => {
    const context = createTestContext();
    const { endpoint, inbox } = context.makeEndpoint({ role: "receiver" });
    const shared = envelope({ idempotencyKey: "op-replay-1" });
    const first = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-1",
      envelope: shared,
    });
    assert.equal(first.type, "ACK");
    const second = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-2",
      envelope: shared,
    });
    assert.equal(second.type, "REJECT");
    assert.equal(second.failures[0]?.code, "REPLAY");
    const receipts = readLines(inbox).filter((line) => line.lifecycle.state === "PENDING");
    assert.equal(receipts.length, 1);
    assert.ok(context.events.some((event) => event.kind === "inbox-rejected"));
  });

  it("refuses an expired envelope (EXPIRED) without storing anything", async () => {
    const context = createTestContext();
    const { endpoint, inbox } = context.makeEndpoint({ role: "receiver" });
    const response = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-1",
      envelope: envelope({ expiresAt: now() - 1000 }),
    });
    assert.equal(response.type, "REJECT");
    assert.equal(response.failures[0]?.code, "EXPIRED");
    assert.equal(readLines(inbox).length, 0);
  });

  it("refuses out-of-scope, unknown-sender, and oversized envelopes without storing them", async () => {
    const context = createTestContext();
    const { endpoint, inbox } = context.makeEndpoint({ role: "receiver" });
    const outOfScope = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-1",
      envelope: envelope({ scope: "secret.payloads" }),
    });
    assert.equal(outOfScope.type, "REJECT");
    assert.ok(outOfScope.failures.some((failure) => failure.code === "OUT_OF_SCOPE"));

    const unknownSender = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-2",
      envelope: envelope({ sender: "inst-stranger" }),
    });
    assert.ok(unknownSender.failures.some((failure) => failure.code === "UNKNOWN_SENDER"));

    const oversized = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-3",
      envelope: envelope({ payloadDigest: "x".repeat(129) }),
    });
    assert.ok(oversized.failures.some((failure) => failure.code === "OVERSIZED"));

    assert.equal(readLines(inbox).length, 0);
  });

  it("fails closed when no handler is configured (REJECTED with reason, not silently dropped)", async () => {
    const context = createTestContext();
    const inbox = join(context.dir, "bare-inbox.jsonl");
    const bare = new CoordinationEndpoint({
      instanceId: "inst-a",
      store: new JsonlInboxStore(inbox),
      allowedScopes: [SCOPE],
      knownSenders: ["inst-b"],
      egressScopes: [],
      onEvent: (event) => context.events.push(event),
    });
    context.endpoints.push(bare);
    const response = await bare.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-1",
      envelope: envelope(),
    });
    assert.equal(response.type, "ACK");
    await waitFor(() =>
      context.events.some((event) => event.kind === "lifecycle" && event.state === "REJECTED"),
    );
    const rejected = context.events.find(
      (event) => event.kind === "lifecycle" && event.state === "REJECTED",
    ) as Extract<EndpointEvent, { kind: "lifecycle" }> | undefined;
    assert.match(rejected?.deadLetterReason ?? "", /no handler configured/);
    const folded = foldMessages(readLines(inbox));
    assert.equal(folded[0]?.lifecycle.state, "REJECTED");
    assert.equal(bare.stats().inbox.loaded, 1);
  });

  it("dead-letters a message whose handler keeps failing until the retry budget is exhausted", async () => {
    const context = createTestContext();
    let handlerCalls = 0;
    const handler = (): HandlerOutcome => {
      handlerCalls += 1;
      return { outcome: "FAILED" };
    };
    const { endpoint, inbox } = context.makeEndpoint({
      role: "receiver",
      handler,
      inboxMaxRetries: 2,
    });
    const response = await endpoint.receiveEnvelope({
      type: "ENVELOPE",
      frameId: "f-1",
      envelope: envelope(),
    });
    assert.equal(response.type, "ACK");
    await waitFor(() => context.events.some((event) => event.kind === "deadletter"));
    const finalMessage = foldMessages(readLines(inbox))[0];
    assert.equal(handlerCalls, 2); // exactly maxRetries processing attempts
    assert.equal(finalMessage?.lifecycle.state, "FAILED");
    assert.equal(isDeadLettered(finalMessage.lifecycle), true);
    assert.match(finalMessage.lifecycle.deadLetterReason ?? "", /retry budget exhausted/);
  });

  it("dead-letters immediately when the handler flags reconciliation-required (no blind retry)", async () => {
    const context = createTestContext();
    let handlerCalls = 0;
    const handler = (): HandlerOutcome => {
      handlerCalls += 1;
      return { outcome: "FAILED", reconcileRequired: true };
    };
    const { endpoint, inbox } = context.makeEndpoint({ role: "receiver", handler });
    await endpoint.receiveEnvelope({ type: "ENVELOPE", frameId: "f-1", envelope: envelope() });
    await waitFor(() => context.events.some((event) => event.kind === "deadletter"));
    await new Promise((resolve) => setTimeout(resolve, 80)); // any (wrong) retry would fire here
    const finalMessage = foldMessages(readLines(inbox))[0];
    assert.equal(handlerCalls, 1); // reconciliation blocks the retry
    assert.equal(isDeadLettered(finalMessage.lifecycle, true), true);
  });
});

describe("outbox over the real wire (retry / duplicate / refusal / dead-letter)", () => {
  it("delivers to a listening peer: ACK, receiver file shows the full lifecycle, sender file shows the outbox trail", async () => {
    const context = createTestContext();
    const receiver = context.makeEndpoint({ role: "receiver" });
    const sender = context.makeEndpoint({ role: "sender" });
    const { port } = await receiver.endpoint.listen(0);
    const report = await sender.endpoint.send(envelope(), {
      host: "127.0.0.1",
      port,
      maxRetries: 3,
    });
    assert.equal(report.state, "DELIVERED");
    assert.equal(report.attempts, 1);
    await waitFor(
      () => foldMessages(readLines(receiver.inbox))[0]?.lifecycle.state === "COMPLETED",
    );
    assert.deepEqual(
      readLines(receiver.inbox).map((line) => line.lifecycle.state),
      ["PENDING", "PROCESSING", "COMPLETED"],
    );
    assert.equal(foldMessages(readLines(sender.outbox))[0]?.lifecycle.state, "COMPLETED");
    assert.ok(context.events.some((event) => event.kind === "outbox-delivered"));
  });

  it("re-sending the same envelope is DELIVERED_DUPLICATE (receiver replay guard suppresses the effect)", async () => {
    const context = createTestContext();
    const receiver = context.makeEndpoint({ role: "receiver" });
    const sender = context.makeEndpoint({ role: "sender" });
    const { port } = await receiver.endpoint.listen(0);
    const shared = envelope({ idempotencyKey: "op-dup-1" });
    const first = await sender.endpoint.send(shared, { host: "127.0.0.1", port, maxRetries: 3 });
    const second = await sender.endpoint.send(shared, { host: "127.0.0.1", port, maxRetries: 3 });
    assert.equal(first.state, "DELIVERED");
    assert.equal(second.state, "DELIVERED_DUPLICATE");
    const receipts = readLines(receiver.inbox).filter((line) => line.lifecycle.state === "PENDING");
    assert.equal(receipts.length, 1); // one receipt, one effect
    await waitFor(
      () => foldMessages(readLines(receiver.inbox))[0]?.lifecycle.state === "COMPLETED",
    );
  });

  it("receiver policy rejection is REJECTED (fail closed, no blind retry of refused commands)", async () => {
    const context = createTestContext();
    const receiver = context.makeEndpoint({ role: "receiver", allowedScopes: ["other.scope"] });
    const sender = context.makeEndpoint({ role: "sender", egressScopes: [SCOPE, "other.scope"] });
    const { port } = await receiver.endpoint.listen(0);
    const report = await sender.endpoint.send(envelope(), {
      host: "127.0.0.1",
      port,
      maxRetries: 3,
    });
    assert.equal(report.state, "REJECTED");
    assert.ok(report.failures?.some((failure) => failure.code === "OUT_OF_SCOPE"));
    assert.equal(readLines(receiver.inbox).length, 0); // never stored
    assert.equal(report.attempts, 1); // policy rejections are not retried
  });

  it("refuses an expired envelope at the egress gate (zero wire attempts, never silently retried)", async () => {
    const context = createTestContext();
    const sender = context.makeEndpoint({ role: "sender" });
    const port = await context.freePort();
    const report = await sender.endpoint.send(envelope({ expiresAt: now() - 1000 }), {
      host: "127.0.0.1",
      port,
      maxRetries: 3,
    });
    assert.equal(report.state, "REFUSED");
    assert.equal(report.attempts, 0);
    assert.match(report.reason ?? "", /expired/);
    const folded = foldMessages(readLines(sender.outbox));
    assert.equal(folded[0]?.lifecycle.state, "REJECTED");
    assert.match(folded[0]?.lifecycle.deadLetterReason ?? "", /expired while pending/);
  });

  it("survives a partition: retries on connection loss and delivers after the listener returns (no silent loss)", async () => {
    const context = createTestContext();
    const receiver = context.makeEndpoint({ role: "receiver" });
    const sender = context.makeEndpoint({ role: "sender" });
    const { port } = await receiver.endpoint.listen(0);
    await receiver.endpoint.stopListening(); // partition begins
    const pending = sender.endpoint.send(envelope(), {
      host: "127.0.0.1",
      port,
      // NOTE: the merged budget counter advances twice per retry cycle
      // (begin + outcome), so maxRetries=16 yields 9 transport attempts —
      // enough to span the 100ms partition window below.
      maxRetries: 16,
      retryDelayMs: 20,
    });
    await new Promise((resolve) => setTimeout(resolve, 100)); // attempts fail while partitioned
    await receiver.endpoint.listen(port); // partition ends, same port
    const report = await pending;
    assert.equal(report.state, "DELIVERED");
    assert.ok(report.attempts >= 2, `expected repeated attempts, got ${report.attempts}`);
    const receipts = readLines(receiver.inbox).filter((line) => line.lifecycle.state === "PENDING");
    assert.equal(receipts.length, 1); // exactly one receipt, one effect
    const attempts = context.events.filter((event) => event.kind === "outbox-attempt");
    assert.ok(attempts.length >= 2);
  });

  it("an envelope that expires while the peer is offline is REFUSED on reconnect, not re-sent", async () => {
    const context = createTestContext();
    const sender = context.makeEndpoint({ role: "sender" });
    const port = await context.freePort();
    const report = await sender.endpoint.send(envelope({ expiresAt: now() + 90 }), {
      host: "127.0.0.1",
      port,
      maxRetries: 8,
      retryDelayMs: 40,
    });
    // transport attempts happened while offline; the moment the envelope
    // expired, the egress gate refused it instead of re-sending.
    assert.equal(report.state, "REFUSED");
    assert.ok(report.attempts >= 1);
    assert.match(report.reason ?? "", /expired while pending/);
    assert.equal(foldMessages(readLines(sender.outbox))[0]?.lifecycle.state, "REJECTED");
  });

  it("dead-letters when the peer never returns and the retry budget is exhausted", async () => {
    const context = createTestContext();
    const sender = context.makeEndpoint({ role: "sender" });
    const port = await context.freePort();
    const report = await sender.endpoint.send(envelope(), {
      host: "127.0.0.1",
      port,
      maxRetries: 2,
      retryDelayMs: 20,
    });
    assert.equal(report.state, "DEAD-LETTERED");
    assert.equal(report.attempts, 2);
    assert.match(report.reason ?? "", /exhausted budget/);
    const folded = foldMessages(readLines(sender.outbox));
    assert.equal(folded[0]?.lifecycle.state, "FAILED");
    assert.equal(isDeadLettered(folded[0].lifecycle), true);
    assert.ok(context.events.some((event) => event.kind === "outbox-deadletter"));
  });
});
