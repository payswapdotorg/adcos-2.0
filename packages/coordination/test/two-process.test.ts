import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Message, Envelope } from "@adcos/contracts";

// ============================================================================
// P2-W2 acceptance core: TWO SEPARATE OS PROCESSES, each with its OWN
// JsonlInboxStore on disk, exchanging coordination envelopes over the real
// TCP transport (loopback). Assertions cover the full lifecycle (send ->
// validate -> inbox PENDING -> PROCESSING -> terminal) AND the negatives
// (replay rejected, expiry refused, dead-letter on retry exhaustion), plus
// partition/reconnect duplicate detection and offline expiry refusal —
// all across the process boundary.
//
// Physical-device forwarding over real NICs stays P4-W2 (recorded).
// ============================================================================

const testDir = fileURLToPath(new URL(".", import.meta.url)); // .../packages/coordination/test/
const packageDir = join(testDir, ".."); // .../packages/coordination
const runtimePath = join(packageDir, "verification", "two-process", "runtime.ts");

interface RuntimeEvent {
  event: string;
  [key: string]: unknown;
}

interface OutboxReport {
  messageId: string;
  eventId: string;
  state: string;
  attempts: number;
  reason?: string;
  failures?: { code: string; detail: string }[];
}

interface RuntimeHandle {
  child: ChildProcessWithoutNullStreams;
  dir: string;
  inboxPath: string;
  outboxPath: string;
  events: RuntimeEvent[];
  stderr: string;
  send(command: Record<string, unknown>): void;
  waitFor(check: (events: RuntimeEvent[]) => boolean, timeoutMs?: number): Promise<RuntimeEvent[]>;
  shutdown(): Promise<void>;
}

const spawned: RuntimeHandle[] = [];

function spawnRuntime(
  role: "listener" | "sender",
  dir: string,
  options?: { clockOffsetMs?: number },
): RuntimeHandle {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      runtimePath,
      "--role",
      role,
      "--dir",
      dir,
      "--retry-delay-ms",
      "25",
      ...(options?.clockOffsetMs !== undefined
        ? ["--clock-offset-ms", String(options.clockOffsetMs)]
        : []),
    ],
    { cwd: packageDir, stdio: ["pipe", "pipe", "pipe"] },
  );
  const events: RuntimeEvent[] = [];
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") {
        continue;
      }
      try {
        events.push(JSON.parse(trimmed) as RuntimeEvent);
      } catch {
        stderr += `[unparsable stdout] ${trimmed}\n`;
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const handle: RuntimeHandle = {
    child,
    dir,
    inboxPath: join(dir, "inbox.jsonl"),
    outboxPath: join(dir, "outbox.jsonl"),
    events,
    stderr,
    send(command) {
      child.stdin.write(`${JSON.stringify(command)}\n`);
    },
    async waitFor(check, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (check(events)) {
          return events;
        }
        if (Date.now() > deadline) {
          assert.fail(
            `waitFor timeout (role=${role}). events so far:\n${events
              .map((event) => JSON.stringify(event))
              .join("\n")}\nstderr:\n${stderr}`,
          );
        }
        if (child.exitCode !== null) {
          assert.fail(`runtime process exited early (code ${child.exitCode}). stderr:\n${stderr}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async shutdown() {
      if (child.exitCode === null) {
        handle.send({ cmd: "shutdown" });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`runtime ${role} did not shut down cleanly. stderr:\n${stderr}`));
          }, 4000);
          child.once("exit", (code) => {
            clearTimeout(timer);
            resolve();
            assert.equal(code, 0, `runtime ${role} must exit 0 on shutdown. stderr:\n${stderr}`);
          });
        });
      }
    },
  };
  spawned.push(handle);
  return handle;
}

after(async () => {
  for (const handle of spawned) {
    try {
      await handle.shutdown();
    } catch {
      handle.child.kill("SIGKILL");
    }
  }
  for (const handle of spawned) {
    rmSync(handle.dir, { recursive: true, force: true });
  }
});

const SCOPE = "device.forwarding";
let envelopeCounter = 0;
const envelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: `evt-two-process-${(envelopeCounter += 1)}`,
  sender: "inst-b",
  receiver: "inst-a",
  scope: SCOPE,
  issuedAt: Date.now(),
  ...overrides,
});

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

const reportOf = (runtime: RuntimeHandle, eventId: string): OutboxReport => {
  // Same envelope can be sent twice (duplicate-delivery scenario): the
  // LATEST terminal report is the one that matters.
  const reports = runtime.events.filter(
    (item) =>
      item.event === "outbox-report" &&
      (item.report as OutboxReport | undefined)?.eventId === eventId,
  );
  const latest = reports.at(-1)?.report as OutboxReport | undefined;
  return latest ?? assert.fail(`no outbox-report for ${eventId}`);
};

describe("two separate processes over the real TCP transport (P2-W2 acceptance core)", () => {
  it("boots two runtimes with independent on-disk stores and delivers the full lifecycle across the boundary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adcos-two-proc-"));
    const alice = spawnRuntime("listener", join(dir, "alice"));
    const bob = spawnRuntime("sender", join(dir, "bob"));
    alice.send({ cmd: "listen" });
    await alice.waitFor((events) => events.some((event) => event.event === "listening"));
    const port = alice.events.find((event) => event.event === "listening")?.port as number;
    bob.send({ cmd: "set-peer", host: "127.0.0.1", port });

    const payload = envelope();
    bob.send({ cmd: "send", envelope: payload, maxRetries: 16 });

    // Sender side: the terminal report is DELIVERED (ack received over TCP).
    await bob.waitFor((events) => events.some((event) => event.event === "outbox-report"));
    assert.equal(reportOf(bob, payload.eventId).state, "DELIVERED");
    assert.equal(reportOf(bob, payload.eventId).attempts, 1);

    // Receiver side: accepted, then PENDING -> PROCESSING -> COMPLETED.
    await alice.waitFor((events) =>
      events.some((event) => event.event === "lifecycle" && event.state === "COMPLETED"),
    );
    // PHYSICAL evidence on disk (read from the test process, not via RPC):
    assert.deepEqual(
      readLines(alice.inboxPath).map((line) => line.lifecycle.state),
      ["PENDING", "PROCESSING", "COMPLETED"],
    );
    const folded = foldMessages(readLines(alice.inboxPath));
    assert.equal(folded[0]?.lifecycle.state, "COMPLETED");
    // Sender's own outbox trail is durable on its side of the boundary.
    assert.equal(foldMessages(readLines(bob.outboxPath))[0]?.lifecycle.state, "COMPLETED");
    // Cross-boundary correlation: the receiver's message id (from the ack)
    // matches the message id in A's durable file.
    const delivered = bob.events.find(
      (event) => event.event === "outbox-delivered" && !event.duplicate,
    );
    assert.equal(delivered?.ackMessageId, folded[0]?.id);
    // The sender's outbox entry id is the sender-side identity of the same
    // exchange (correlated by eventId, not by message id).
    assert.equal(reportOf(bob, payload.eventId).eventId, folded[0]?.envelope.eventId);
  });

  it("rejects a replayed envelope across the boundary and suppresses the duplicate effect", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adcos-two-proc-"));
    const alice = spawnRuntime("listener", join(dir, "alice"));
    const bob = spawnRuntime("sender", join(dir, "bob"));
    alice.send({ cmd: "listen" });
    await alice.waitFor((events) => events.some((event) => event.event === "listening"));
    const port = alice.events.find((event) => event.event === "listening")?.port as number;
    bob.send({ cmd: "set-peer", host: "127.0.0.1", port });

    const shared = envelope({ idempotencyKey: "op-cross-replay-1" });
    bob.send({ cmd: "send", envelope: shared, maxRetries: 16 });
    await bob.waitFor(
      (events) => events.filter((event) => event.event === "outbox-report").length === 1,
    );
    assert.equal(reportOf(bob, shared.eventId).state, "DELIVERED");
    bob.send({ cmd: "send", envelope: shared, maxRetries: 16 });
    await bob.waitFor(
      (events) => events.filter((event) => event.event === "outbox-report").length === 2,
    );
    assert.equal(reportOf(bob, shared.eventId).state, "DELIVERED_DUPLICATE");

    // Receiver REJECTED the second delivery (replay), exactly once stored.
    await alice.waitFor((events) =>
      events.some(
        (event) =>
          event.event === "inbox-rejected" &&
          (event.failures as { code: string }[] | undefined)?.[0]?.code === "REPLAY",
      ),
    );
    await alice.waitFor((events) =>
      events.some((event) => event.event === "lifecycle" && event.state === "COMPLETED"),
    );
    const receipts = readLines(alice.inboxPath).filter(
      (line) => line.lifecycle.state === "PENDING",
    );
    assert.equal(receipts.length, 1); // one receipt, one effect — no duplicate
  });

  it("refuses expiry on BOTH sides of the boundary: sender gate (never sent) and receiver gate (cross-device clock skew)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adcos-two-proc-"));
    const alice = spawnRuntime("listener", join(dir, "alice"), { clockOffsetMs: 5000 });
    const bob = spawnRuntime("sender", join(dir, "bob"));
    alice.send({ cmd: "listen" });
    await alice.waitFor((events) => events.some((event) => event.event === "listening"));
    const port = alice.events.find((event) => event.event === "listening")?.port as number;
    bob.send({ cmd: "set-peer", host: "127.0.0.1", port });

    // (a) Sender-side gate: an envelope already expired on the sender's clock
    // is REFUSED before any wire attempt.
    const stale = envelope({ expiresAt: Date.now() - 5000 });
    bob.send({ cmd: "send", envelope: stale, maxRetries: 16 });
    await bob.waitFor(
      (events) => events.filter((event) => event.event === "outbox-report").length === 1,
    );
    const refusedReport = reportOf(bob, stale.eventId);
    assert.equal(refusedReport.state, "REFUSED");
    assert.equal(refusedReport.attempts, 0); // never touched the wire

    // (b) Receiver-side gate: a short-lived envelope that is still fresh on
    // the sender's clock is EXPIRED on the receiver's skewed clock (5s
    // ahead) — refused across the process boundary, never stored.
    const shortLived = envelope({ expiresAt: Date.now() + 500 });
    bob.send({ cmd: "send", envelope: shortLived, maxRetries: 16 });
    await bob.waitFor(
      (events) => events.filter((event) => event.event === "outbox-report").length === 2,
    );
    const rejectedReport = reportOf(bob, shortLived.eventId);
    assert.equal(rejectedReport.state, "REJECTED");
    assert.ok(rejectedReport.failures?.some((failure) => failure.code === "EXPIRED"));
    assert.equal(rejectedReport.attempts, 1); // expiry refusal is not retried
    await alice.waitFor((events) =>
      events.some(
        (event) =>
          event.event === "inbox-rejected" &&
          (event.failures as { code: string }[] | undefined)?.[0]?.code === "EXPIRED",
      ),
    );
    // PHYSICAL: neither envelope ever touched the receiver's durable inbox.
    assert.equal(readLines(alice.inboxPath).length, 0);
  });

  it("dead-letters on retry exhaustion across the boundary (handler fails every attempt)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adcos-two-proc-"));
    const alice = spawnRuntime("listener", join(dir, "alice"));
    const bob = spawnRuntime("sender", join(dir, "bob"));
    alice.send({ cmd: "listen" });
    await alice.waitFor((events) => events.some((event) => event.event === "listening"));
    const port = alice.events.find((event) => event.event === "listening")?.port as number;
    bob.send({ cmd: "set-peer", host: "127.0.0.1", port });

    alice.send({ cmd: "set-handler", mode: "fail-all" });
    await alice.waitFor((events) => events.some((event) => event.event === "handler-set"));

    const doomed = envelope();
    bob.send({ cmd: "send", envelope: doomed, maxRetries: 16 });
    await bob.waitFor((events) => events.some((event) => event.event === "outbox-report"));
    assert.equal(reportOf(bob, doomed.eventId).state, "DELIVERED"); // accepted first...
    await alice.waitFor((events) => events.some((event) => event.event === "deadletter"));
    // ...then processing failed to exhaustion and dead-lettered ON DISK.
    const folded = foldMessages(readLines(alice.inboxPath));
    assert.equal(folded[0]?.lifecycle.state, "FAILED");
    assert.equal(
      (folded[0]?.lifecycle.attempts ?? 0) >= (folded[0]?.lifecycle.maxRetries ?? 0),
      true,
    );
    assert.match(folded[0]?.lifecycle.deadLetterReason ?? "", /retry budget exhausted/);
    const processingLines = readLines(alice.inboxPath).filter(
      (line) => line.lifecycle.state === "PROCESSING",
    );
    assert.ok(processingLines.length >= 2); // retried before dead-lettering
  });

  it("survives a partition across processes: no silent loss, single effect, duplicates suppressed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adcos-two-proc-"));
    const alice = spawnRuntime("listener", join(dir, "alice"));
    const bob = spawnRuntime("sender", join(dir, "bob"));
    alice.send({ cmd: "listen" });
    await alice.waitFor((events) => events.some((event) => event.event === "listening"));
    const port = alice.events.find((event) => event.event === "listening")?.port as number;
    bob.send({ cmd: "set-peer", host: "127.0.0.1", port });

    // Partition: kill the listener, start a send (all attempts fail), then
    // bring the listener back on the SAME port.
    alice.send({ cmd: "unlisten" });
    await alice.waitFor((events) => events.some((event) => event.event === "listener-closed"));
    const lost = envelope();
    bob.send({ cmd: "send", envelope: lost, maxRetries: 16, retryDelayMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    alice.send({ cmd: "listen" });
    await alice.waitFor(
      (events) => events.filter((event) => event.event === "listening").length === 2, // rebound
    );
    const report = await (async () => {
      await bob.waitFor((events) => events.some((event) => event.event === "outbox-report"));
      return reportOf(bob, lost.eventId);
    })();
    assert.equal(report.state, "DELIVERED");
    assert.ok(report.attempts >= 2, `expected retried attempts, got ${report.attempts}`);
    await alice.waitFor((events) =>
      events.some((event) => event.event === "lifecycle" && event.state === "COMPLETED"),
    );

    // Late duplicate delivery after the ack: the receiver's replay guard
    // suppresses it — exactly one receipt on disk, no second effect.
    bob.send({ cmd: "send", envelope: lost, maxRetries: 16 });
    await bob.waitFor(
      (events) =>
        events.filter((event) => event.event === "outbox-report").length === 2 &&
        (
          events.filter((event) => event.event === "outbox-report").at(-1)?.report as
            | OutboxReport
            | undefined
        )?.state === "DELIVERED_DUPLICATE",
    );
    const receipts = readLines(alice.inboxPath).filter(
      (line) => line.lifecycle.state === "PENDING",
    );
    assert.equal(receipts.length, 1);
    const completed = foldMessages(readLines(alice.inboxPath))[0];
    assert.equal(completed?.lifecycle.state, "COMPLETED");
  });

  it("refuses (never silently retries) an envelope that expires while the peer is offline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adcos-two-proc-"));
    const alice = spawnRuntime("listener", join(dir, "alice"));
    const bob = spawnRuntime("sender", join(dir, "bob"));
    alice.send({ cmd: "listen" });
    await alice.waitFor((events) => events.some((event) => event.event === "listening"));
    const port = alice.events.find((event) => event.event === "listening")?.port as number;
    bob.send({ cmd: "set-peer", host: "127.0.0.1", port });

    // Partition first; the envelope is short-lived and expires mid-partition.
    alice.send({ cmd: "unlisten" });
    await alice.waitFor((events) => events.some((event) => event.event === "listener-closed"));
    const expiring = envelope({ expiresAt: Date.now() + 90 });
    bob.send({ cmd: "send", envelope: expiring, maxRetries: 16, retryDelayMs: 40 });
    await bob.waitFor((events) => events.some((event) => event.event === "outbox-report"));
    const report = reportOf(bob, expiring.eventId);
    assert.equal(report.state, "REFUSED");
    assert.ok(report.attempts >= 1, "wire attempts happened while the peer was reachable-but-down");
    assert.match(report.reason ?? "", /expired while pending/);
    // The sender's outbox trail shows the refusal durably.
    assert.equal(foldMessages(readLines(bob.outboxPath))[0]?.lifecycle.state, "REJECTED");

    // Peer returns — but the expired envelope is NEVER (re)sent.
    alice.send({ cmd: "listen" });
    await alice.waitFor(
      (events) => events.filter((event) => event.event === "listening").length === 2,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stored = readLines(alice.inboxPath);
    assert.equal(
      stored.filter((line) => line.envelope.eventId === expiring.eventId).length,
      0,
      "expired envelope must never reach the receiver's durable inbox",
    );
    // And nothing retried after the refusal: still exactly one report.
    assert.equal(bob.events.filter((event) => event.event === "outbox-report").length, 1);
  });

  it("shuts both processes down cleanly (exit 0, no crash noise)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adcos-two-proc-"));
    const alice = spawnRuntime("listener", join(dir, "alice"));
    const bob = spawnRuntime("sender", join(dir, "bob"));
    await alice.waitFor((events) => events.some((event) => event.event === "ready"));
    await bob.waitFor((events) => events.some((event) => event.event === "ready"));
    await alice.shutdown();
    await bob.shutdown();
    assert.equal(
      alice.events.some((event) => event.event === "error"),
      false,
      alice.stderr,
    );
    assert.equal(
      bob.events.some((event) => event.event === "error"),
      false,
      bob.stderr,
    );
  });
});
