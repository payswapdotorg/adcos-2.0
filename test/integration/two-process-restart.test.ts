import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ============================================================================
// P3-W1 real-boundary dogfood — the integrated story driven across REAL
// OS-process boundaries with REAL TCP transport and a REAL clock:
//
//   process 1 (inst-omar, the owner's device)  : enrollment → consent →
//     observation → Lab PURSUE evaluation → organization formation with
//     initial mandates. Clean exit (restart #1 over the durable state log).
//   process 2 (inst-cara, the customer's device): restores the SAME state
//     log, opens the group purchase, receives the attributable offer,
//     commits — then starts a REAL TCP coordination endpoint with its own
//     durable inbox/outbox and stays alive.
//   process 3 (inst-omar restarted): restores the SAME state log (restart
//     #2), proves idempotency (duplicate enrollment refused), commits as
//     the second member (threshold met), exchanges a REAL envelope with
//     process 2 over TCP loopback (accepted + completed) and a REPLAY of
//     the same idempotency key (rejected by the receiver's replay guard,
//     recorded as DELIVERED_DUPLICATE by the sender — effectively-once
//     domain effect), then completes the order lifecycle to RECONCILED and
//     reads the finished story through the isolated customer view.
//
// Durable evidence asserted on disk afterwards: the shared surfaces state
// log, process 2's coordination inbox (the delivered message COMPLETED, the
// replay never stored) and process 3's coordination outbox.
//
// MOCK/REAL: processes, restarts, TCP transport, clocks and JSONL stores are
// REAL. The provider offer and opaque payment reference are synthetic
// evidence objects (ADR-0004: live provider/payment success is
// BLOCKED-ON-OPERATOR and never claimed here).
// ============================================================================

const dir = mkdtempSync(join(tmpdir(), "adcos-p3w1-two-process-"));
const statePath = join(dir, "surface-state.jsonl");
const runtime = resolve(import.meta.dirname, "two-process/runtime.ts");

const OWNER = "prin-omar";
const CUSTOMER = "prin-cara";
const ORG = "org-communal-tp";
const RESOURCE = "res-hotspot-tp";

interface RuntimeEvent {
  event: string;
  cmd?: string;
  principal?: string;
  applied?: boolean;
  reason?: string;
  verdict?: string;
  order?: { state: string };
  port?: number;
  stats?: { snapshots: number; tornLines: number };
  report?: {
    messageId: string;
    eventId: string;
    state: string;
    attempts: number;
    reason?: string;
  };
  messageId?: string;
  state?: string;
  view?: unknown;
  [key: string]: unknown;
}

interface RuntimeHandle {
  child: ChildProcessWithoutNullStreams;
  events: RuntimeEvent[];
  stderr: string;
  send(command: Record<string, unknown>): void;
  waitFor(check: (events: RuntimeEvent[]) => boolean, timeoutMs?: number): Promise<RuntimeEvent[]>;
  shutdown(): Promise<void>;
}

const spawned: RuntimeHandle[] = [];
let customerHandle: RuntimeHandle | undefined;

function spawnRuntime(instance: string, peer: string, coordDir: string): RuntimeHandle {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      runtime,
      "--state",
      statePath,
      "--coord-dir",
      coordDir,
      "--instance",
      instance,
      "--peer",
      peer,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const events: RuntimeEvent[] = [];
  let stderr = "";
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim() === "") {
        continue;
      }
      try {
        events.push(JSON.parse(line) as RuntimeEvent);
      } catch {
        stderr += `[unparsable stdout] ${line}\n`;
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const handle: RuntimeHandle = {
    child,
    events,
    get stderr() {
      return stderr;
    },
    send(command) {
      child.stdin.write(`${JSON.stringify(command)}\n`);
    },
    async waitFor(check, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (check(events)) {
          return events;
        }
        if (Date.now() > deadline) {
          assert.fail(
            `waitFor timeout (instance=${instance}). events so far:\n${events
              .map((event) => JSON.stringify(event))
              .join("\n")}\nstderr:\n${stderr}`,
          );
        }
        if (child.exitCode !== null) {
          assert.fail(
            `runtime ${instance} exited early (code ${child.exitCode}). stderr:\n${stderr}`,
          );
        }
        await new Promise((resolvePromise) => {
          setTimeout(resolvePromise, 10);
        });
      }
    },
    async shutdown() {
      if (child.exitCode === null) {
        handle.send({ cmd: "shutdown" });
        await new Promise<void>((resolvePromise, rejectPromise) => {
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            rejectPromise(
              new Error(`runtime ${instance} did not shut down cleanly. stderr:\n${stderr}`),
            );
          }, 5000);
          child.once("exit", (code) => {
            clearTimeout(timer);
            resolvePromise();
            assert.equal(
              code,
              0,
              `runtime ${instance} must exit 0 on shutdown. stderr:\n${stderr}`,
            );
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
  rmSync(dir, { recursive: true, force: true });
});

describe("P3-W1 dogfood across real process boundaries (restart, real TCP, durable logs)", () => {
  it("process 1 (owner instance) drives the first half and exits cleanly — restart #1", async () => {
    const owner = spawnRuntime("inst-omar", "inst-cara", join(dir, "coord-omar"));
    await owner.waitFor((events) => events.some((e) => e.event === "ready"));

    owner.send({
      cmd: "enroll",
      actor: OWNER,
      resource: {
        id: RESOURCE,
        device: "dev-omar-phone",
        type: "phone",
        capability: "forwarding-v1",
        modes: ["local", "relay"],
        limits: { maxSessions: 2 },
      },
    });
    owner.send({ cmd: "consent", actor: OWNER, resourceId: RESOURCE, event: "OPT_IN" });
    owner.send({
      cmd: "observe",
      actor: OWNER,
      resourceId: RESOURCE,
      input: {
        status: "DEGRADED",
        freshness: Date.now() - 30_000,
        evidence: ["probe:tcp-handshake-ok"],
        declaredVersion: "1.4.0",
      },
    });
    owner.send({
      cmd: "lab",
      input: {
        id: "lab-tp",
        intent: "intent-stable-data-tp",
        baseline: {
          strategy: "baseline-status-quo",
          cost: 100,
          reliability: 0.9,
          utilization: 0.4,
        },
        alternatives: [
          { strategy: "alt-communal-bundle-tp", cost: 80, reliability: 0.95, utilization: 0.6 },
        ],
        selectedStrategy: "alt-communal-bundle-tp",
        confidence: 0.8,
        assumptions: ["price-stable-30d"],
        expiresAt: Date.now() + 172_800_000,
      },
    });
    owner.send({
      cmd: "form",
      actor: OWNER,
      input: {
        organization: ORG,
        pursuitEvidenceId: "lab-tp-opportunity",
        candidates: [
          { principal: OWNER, consent: true, consentRecordedAt: Date.now() },
          { principal: CUSTOMER, consent: true, consentRecordedAt: Date.now() },
        ],
        minFounders: 2,
        authorityScope: "group",
        initialMandates: [
          { principal: OWNER, scope: "group", permissions: ["commitment:write", "order:advance"] },
          {
            principal: CUSTOMER,
            scope: "group.purchase",
            permissions: ["commitment:write", "order:advance"],
          },
        ],
      },
    });
    owner.send({ cmd: "durability" });
    await owner.waitFor(
      (events) => events.filter((e) => e.event === "result" || e.event === "stats").length >= 6,
    );

    const results = owner.events.filter((e) => e.event === "result");
    assert.equal(results.length, 5);
    for (const result of results) {
      assert.equal(result.applied, true, `${String(result.cmd)} refused: ${String(result.reason)}`);
    }
    assert.equal(results.find((r) => r.cmd === "lab")?.verdict, "PURSUE");
    const stats = owner.events.find((e) => e.event === "stats");
    assert.ok((stats?.stats?.snapshots ?? 0) >= 5, "write-before-ack snapshots before exit");

    await owner.shutdown(); // restart #1: the process dies; the log survives
  });

  it("process 2 (customer instance) restores the state, opens the purchase, commits and listens on real TCP", async () => {
    const customer = spawnRuntime("inst-cara", "inst-omar", join(dir, "coord-cara"));
    customerHandle = customer;
    await customer.waitFor((events) => events.some((e) => e.event === "ready"));

    customer.send({
      cmd: "open",
      actor: CUSTOMER,
      input: {
        id: "gpr-tp",
        intent: "intent-stable-data-tp",
        organization: ORG,
        requirements: { product: "data-bundle", region: "GH" },
        threshold: 2,
        expiresAt: Date.now() + 7 * 86_400_000,
      },
    });
    customer.send({
      cmd: "offer",
      actor: CUSTOMER,
      offer: {
        id: "gpo-tp",
        request: "gpr-tp",
        supplier: "teleco-x",
        product: "data-bundle-10gb",
        capability: "data-plan-v2",
        region: "GH",
        quantity: 10,
        perMemberCost: 25,
        totalCost: 250,
        recurringCharges: [{ amount: 25, frequency: "monthly", description: "per member" }],
        oneTimeCharges: [{ amount: 10, description: "activation" }],
        term: "12-months",
        limitations: ["fair-use"],
        expiry: Date.now() + 1_728_000_000,
        provenance: "unicom-listing:tier-2",
      },
    });
    customer.send({
      cmd: "commit",
      actor: CUSTOMER,
      input: { requestId: "gpr-tp", allocation: { lines: 4 } },
    });
    customer.send({ cmd: "listen" });

    await customer.waitFor((events) => events.some((e) => e.event === "listening"));
    const results = customer.events.filter((e) => e.event === "result");
    assert.equal(results.length, 3);
    for (const result of results) {
      assert.equal(result.applied, true, `${String(result.cmd)} refused: ${String(result.reason)}`);
    }
    // The restored state from process 1 is visible (the org exists and the
    // customer's open/offer/commit all succeeded against it).
    const commit = results.find((r) => r.cmd === "commit");
    assert.equal((commit?.evaluation as { state?: string } | undefined)?.state !== undefined, true);
    // Process 2 stays alive: its TCP endpoint is the receiver for the
    // restarted owner instance's coordination exchange below.
  });

  it("process 3 (owner instance restarted) recovers, commits, exchanges real TCP envelopes (incl. a replay) and completes the order to RECONCILED — restart #2", async () => {
    const customerPort =
      spawned
        .find((h) => h.events.some((e) => e.event === "listening"))
        ?.events.find((e) => e.event === "listening")?.port ?? 0;
    assert.ok(customerPort > 0, "process 2 must be listening");

    const owner = spawnRuntime("inst-omar", "inst-cara", join(dir, "coord-omar"));
    await owner.waitFor((events) => events.some((e) => e.event === "ready"));

    // IDEMPOTENCY across the restart: re-enrolling the resource that
    // process 1 already persisted is refused — recovery, not duplication.
    owner.send({
      cmd: "enroll",
      actor: OWNER,
      resource: {
        id: RESOURCE,
        device: "dev-omar-phone",
        type: "phone",
        capability: "forwarding-v1",
        modes: ["local", "relay"],
        limits: { maxSessions: 2 },
      },
    });
    await owner.waitFor((events) => events.some((e) => e.event === "result" && e.cmd === "enroll"));
    const duplicateEnroll = owner.events.find((e) => e.event === "result" && e.cmd === "enroll");
    assert.equal(duplicateEnroll?.applied, false);
    assert.match(String(duplicateEnroll?.reason), /already enrolled/);

    // The owner commits as the second member — the threshold is met.
    owner.send({
      cmd: "commit",
      actor: OWNER,
      input: { requestId: "gpr-tp", allocation: { lines: 6 } },
    });
    await owner.waitFor((events) => events.some((e) => e.event === "result" && e.cmd === "commit"));
    const commit = owner.events.find((e) => e.event === "result" && e.cmd === "commit");
    assert.equal(commit?.applied, true, String(commit?.reason));
    assert.equal((commit?.evaluation as { state?: string } | undefined)?.state, "THRESHOLD_MET");

    // REAL TCP exchange #1: the commitment notice is delivered to the
    // customer instance's endpoint (validated, durably appended
    // write-before-ack, dispatched to COMPLETED, ACKed).
    const now = Date.now();
    const noticeEnvelope = {
      schema: { major: 1, minor: 2, patch: 0 },
      eventId: "evt-tp-commit-notice",
      commandId: "cmd-commit-notice",
      sender: "inst-omar",
      receiver: "inst-cara",
      scope: "device.forwarding",
      issuedAt: now,
      expiresAt: now + 3_600_000,
      correlationId: "corr-tp-1",
      idempotencyKey: "op-tp-commit-notice",
      payloadDigest: "sha256:1a2b",
      authorizationRef: "authz-tp-1",
      delegationRef: "deleg-owner-leaf",
      policyEpoch: 7,
    };
    owner.send({ cmd: "send", envelope: noticeEnvelope, host: "127.0.0.1", port: customerPort });
    await owner.waitFor((events) => events.some((e) => e.event === "outbox-report"));
    const delivered = owner.events.find((e) => e.event === "outbox-report")?.report;
    assert.equal(delivered?.state, "DELIVERED");
    assert.ok((delivered?.attempts ?? 0) >= 1);

    // The receiver (process 2) accepted and completed the message.
    const customer = customerHandle;
    assert.ok(customer !== undefined, "process 2 must still be running");
    await customer.waitFor((events) =>
      events.some((e) => e.event === "lifecycle" && e.state === "COMPLETED"),
    );
    const accepted = customer.events.find((e) => e.event === "inbox-accepted");
    assert.equal(accepted?.messageId, "msg-evt-tp-commit-notice");

    // REAL TCP exchange #2 — the REPLAY: same idempotency key, fresh event
    // id. The receiver's replay guard rejects it (inbox-rejected REPLAY,
    // never stored); the sender records DELIVERED_DUPLICATE — at-least-once
    // transport + receiver-side duplicate suppression = effectively-once
    // domain effect.
    owner.send({
      cmd: "send",
      envelope: { ...noticeEnvelope, eventId: "evt-tp-commit-replay" },
      host: "127.0.0.1",
      port: customerPort,
    });
    await owner.waitFor((events) => events.filter((e) => e.event === "outbox-report").length >= 2);
    const replayReport = owner.events.filter((e) => e.event === "outbox-report")[1]?.report;
    assert.equal(replayReport?.state, "DELIVERED_DUPLICATE");
    assert.match(String(replayReport?.reason), /duplicate suppressed by receiver replay guard/);
    await customer.waitFor((events) => events.some((e) => e.event === "inbox-rejected"));
    const rejection = customer.events.find((e) => e.event === "inbox-rejected");
    assert.ok(
      ((rejection?.failures as { code?: string }[] | undefined) ?? []).some(
        (f) => f.code === "REPLAY",
      ),
    );

    // The customer instance shuts down cleanly; its durable coordination
    // inbox survives on disk (asserted after the story completes).
    await customer.shutdown();

    // The restarted owner instance completes the collective order lifecycle:
    // AUTHORIZE (computed mandates over BOTH committed participants) →
    // PLACE_ORDER with the opaque payment evidence (ADR-0004) →
    // CONFIRM_CONTRACT → MARK_FULFILLED → RECONCILE on usage evidence.
    const order = (event: string, extra: Record<string, unknown> = {}): void => {
      owner.send({ cmd: "order", actor: OWNER, input: { requestId: "gpr-tp", event, ...extra } });
    };
    order("AUTHORIZE");
    await owner.waitFor((events) => events.some((e) => e.event === "result" && e.cmd === "order"));
    const authorized = owner.events.find((e) => e.event === "result" && e.cmd === "order");
    assert.equal(authorized?.applied, true, String(authorized?.reason));
    assert.equal((authorized?.order as { state?: string } | undefined)?.state, "AUTHORIZED");

    order("PLACE_ORDER", {
      paymentReference: {
        id: "payref-tp-opaque-7",
        type: "mobile-money",
        authority: "authorized-psp",
        created: Date.now(),
        settled: false,
      },
    });
    order("CONFIRM_CONTRACT");
    order("MARK_FULFILLED");
    order("RECONCILE", { usageEvidenceComplete: true });
    await owner.waitFor(
      (events) =>
        events.filter((e) => e.event === "result" && e.cmd === "order").length >= 5 &&
        events.some(
          (e) =>
            e.event === "result" &&
            e.cmd === "order" &&
            (e.order as { state?: string } | undefined)?.state === "RECONCILED",
        ),
    );
    const orderResults = owner.events.filter((e) => e.event === "result" && e.cmd === "order");
    for (const result of orderResults) {
      assert.equal(result.applied, true, String(result.reason));
    }

    // The finished story through the isolated customer view (built in the
    // RESTARTED owner process from the recovered state).
    owner.send({ cmd: "view", principal: CUSTOMER });
    owner.send({ cmd: "view", principal: OWNER });
    owner.send({ cmd: "durability" });
    await owner.waitFor(
      (events) =>
        events.filter((e) => e.event === "view").length >= 2 &&
        events.some((e) => e.event === "stats"),
    );
    const customerView = owner.events.find((e) => e.event === "view" && e.principal === CUSTOMER)
      ?.view as {
      resources: { resourceId: string }[];
      organizations: { organization: string; state: string }[];
      groupPurchases: {
        requestId: string;
        orderState: string;
        committedParticipants: number;
        threshold: number;
      }[];
      opportunities: { recommendation: string | undefined }[];
    };
    assert.equal(customerView.resources.length, 0); // tenant isolation: not hers
    assert.equal(customerView.organizations[0]?.organization, ORG);
    assert.equal(customerView.organizations[0]?.state, "MEMBER");
    assert.equal(customerView.groupPurchases[0]?.orderState, "RECONCILED");
    assert.equal(customerView.groupPurchases[0]?.committedParticipants, 2);
    assert.equal(customerView.groupPurchases[0]?.threshold, 2);
    assert.equal(customerView.opportunities[0]?.recommendation, "pursue alt-communal-bundle-tp");

    const ownerView = owner.events.find((e) => e.event === "view" && e.principal === OWNER)
      ?.view as { resources: { resourceId: string; share: string; status: string }[] };
    assert.equal(ownerView.resources[0]?.resourceId, RESOURCE);
    assert.equal(ownerView.resources[0]?.share, "SHARED");
    assert.equal(ownerView.resources[0]?.status, "DEGRADED");

    // Durability: the shared log grew across all three processes, torn-free.
    const stats = owner.events.find((e) => e.event === "stats");
    assert.ok((stats?.stats?.snapshots ?? 0) >= 11);
    assert.equal(stats?.stats?.tornLines ?? -1, 0);

    await owner.shutdown();
  });

  it("durable evidence on disk after the story: shared state log, coordination inbox (delivered COMPLETED, replay never stored), coordination outbox", () => {
    // The shared surfaces state log survived two process restarts and its
    // last snapshot carries the RECONCILED order.
    assert.ok(existsSync(statePath));
    const stateLines = readFileSync(statePath, "utf8")
      .split("\n")
      .filter((l) => l !== "");
    assert.ok(stateLines.length >= 11);
    const lastSnapshot = JSON.parse(stateLines[stateLines.length - 1] ?? "{}") as {
      orders?: { request: string; state: string }[];
    };
    assert.equal(lastSnapshot.orders?.find((o) => o.request === "gpr-tp")?.state, "RECONCILED");

    // Process 2's durable coordination inbox: exactly ONE message (the
    // delivered notice) whose final lifecycle snapshot is COMPLETED; the
    // replayed envelope was rejected BEFORE the durable append and is
    // therefore absent from the log.
    const customerInboxPath = join(dir, "coord-cara", "inbox.jsonl");
    assert.ok(existsSync(customerInboxPath));
    const inboxMessages = readFileSync(customerInboxPath, "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l) as { id: string; lifecycle: { state: string; attempts: number } });
    const distinctIds = new Set(inboxMessages.map((m) => m.id));
    assert.equal(distinctIds.size, 1);
    assert.ok([...distinctIds][0] === "msg-evt-tp-commit-notice");
    const finalNotice = inboxMessages[inboxMessages.length - 1];
    assert.equal(finalNotice?.lifecycle.state, "COMPLETED");
    // A first-delivery COMPLETED entry carries zero FAILED attempts; the
    // sender-side report (asserted above) is where the wire attempt count
    // lives.
    assert.equal(finalNotice?.lifecycle.attempts ?? -1, 0);

    // Process 3's durable coordination outbox: both sends left lifecycle
    // snapshots (DELIVERED and the duplicate-suppressed COMPLETED entry).
    const ownerOutboxPath = join(dir, "coord-omar", "outbox.jsonl");
    assert.ok(existsSync(ownerOutboxPath));
    const outboxEntries = readFileSync(ownerOutboxPath, "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l) as { id: string; lifecycle: { state: string } });
    const outboxIds = new Set(outboxEntries.map((m) => m.id));
    assert.equal(outboxIds.size, 2); // the notice + the replay entry
    const noticeEntry = outboxEntries.filter((m) => m.id === "outbox-evt-tp-commit-notice");
    assert.equal(noticeEntry[noticeEntry.length - 1]?.lifecycle.state, "COMPLETED");
    const replayEntry = outboxEntries.filter((m) => m.id === "outbox-evt-tp-commit-replay");
    assert.equal(replayEntry[replayEntry.length - 1]?.lifecycle.state, "COMPLETED");
  });
});
