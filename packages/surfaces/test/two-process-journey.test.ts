import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ============================================================================
// Two-process verification (P2-W1 round 2): two SEPARATE node processes,
// each constructing the surfaces service over the SAME on-disk JSONL state
// log, drive the customer journey across a real process boundary — process
// one performs the first half, exits; process two restores the durable
// state and completes the journey. This is real OS-process restart
// durability, one level stronger than the in-process new-instance tests in
// service-persistence.test.ts. Mirrors the landed coordination two-process
// pattern (control plane on stdin/stdout, state on disk).
// ============================================================================

const dir = mkdtempSync(join(tmpdir(), "adcos-surfaces-two-process-"));
const statePath = join(dir, "two-process.jsonl");
const runtime = resolve(import.meta.dirname, "../verification/two-process/runtime.ts");

interface RuntimeEvent {
  event: string;
  cmd?: string;
  applied?: boolean;
  reason?: string;
  verdict?: string;
  order?: { state: string };
  view?: unknown;
  stats?: { snapshots: number; tornLines: number };
  [key: string]: unknown;
}

interface RuntimeResult {
  pid: number;
  events: RuntimeEvent[];
}

function driveRuntime(args: string[], commands: object[]): Promise<RuntimeResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", runtime, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const events: RuntimeEvent[] = [];
    let pid = 0;
    let stderr = "";
    let buffer = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error(`runtime timed out; stderr so far: ${stderr}`));
    }, 60_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") continue;
        try {
          const event = JSON.parse(line) as RuntimeEvent;
          if (event.event === "ready") {
            pid = event.pid as number;
          }
          events.push(event);
        } catch {
          rejectPromise(new Error(`unparseable runtime output: ${line}`));
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rejectPromise(new Error(`runtime exited ${code}; stderr: ${stderr}`));
        return;
      }
      resolvePromise({ pid, events });
    });

    for (const command of commands) {
      child.stdin.write(`${JSON.stringify(command)}\n`);
    }
    child.stdin.end();
  });
}

const OPERATORS = ["prin-operator"];

describe("two-process journey (real process restart over one durable log)", () => {
  it("process one drives the first half of the journey, then exits", async () => {
    const first = await driveRuntime(
      ["--state", statePath, "--operators", OPERATORS.join(",")],
      [
        {
          cmd: "enroll",
          actor: "prin-alice",
          resource: {
            id: "res-tp",
            device: "dev-tp",
            type: "phone",
            capability: "forwarding-v1",
            modes: ["local", "relay"],
            limits: { maxSessions: 2 },
          },
        },
        { cmd: "consent", actor: "prin-alice", resourceId: "res-tp", event: "OPT_IN" },
        {
          cmd: "observe",
          actor: "prin-alice",
          resourceId: "res-tp",
          input: { status: "DEGRADED", declaredVersion: "1.0.0" },
        },
        {
          cmd: "lab",
          input: {
            id: "lab-tp",
            intent: "intent-tp",
            baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
            alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
            selectedStrategy: "alt",
            confidence: 0.8,
            assumptions: [],
            expiresAt: Date.now() + 172_800_000,
          },
        },
        {
          cmd: "form",
          actor: "prin-alice",
          input: {
            organization: "org-tp",
            pursuitEvidenceId: "lab-tp-opportunity",
            candidates: [
              { principal: "prin-alice", consent: true, consentRecordedAt: Date.now() },
              { principal: "prin-bob", consent: true, consentRecordedAt: Date.now() },
            ],
            minFounders: 2,
            authorityScope: "group",
            initialMandates: [
              { principal: "prin-alice", scope: "group", permissions: ["all"] },
              { principal: "prin-bob", scope: "group.purchase", permissions: ["commitment:write"] },
            ],
          },
        },
        {
          cmd: "open",
          actor: "prin-alice",
          input: {
            id: "gpr-tp",
            intent: "intent-tp",
            organization: "org-tp",
            requirements: { product: "data-bundle" },
            threshold: 2,
            expiresAt: Date.now() + 86_400_000,
          },
        },
        { cmd: "durability" },
        { cmd: "shutdown" },
      ],
    );

    // Every step of the first half applied.
    const results = first.events.filter((e) => e.event === "result");
    assert.equal(results.length, 6);
    for (const result of results) {
      assert.equal(result.applied, true, `${String(result.cmd)} refused: ${String(result.reason)}`);
    }
    // The Lab verdict was PURSUE.
    const lab = results.find((r) => r.cmd === "lab");
    assert.equal(lab?.verdict, "PURSUE");
    // Durability: snapshots were written before each ack.
    const stats = first.events.find((e) => e.event === "stats");
    assert.ok((stats?.stats?.snapshots ?? 0) >= 6);
  });

  it("process two restores the state and completes the journey", async () => {
    const second = await driveRuntime(
      ["--state", statePath, "--operators", OPERATORS.join(",")],
      [
        // The offer for the request opened by process one.
        {
          cmd: "offer",
          actor: "prin-alice",
          offer: {
            id: "gpo-tp",
            request: "gpr-tp",
            supplier: "teleco-x",
            product: "data-bundle-10gb",
            capability: "data-plan-v2",
            region: "GH",
            quantity: 10,
            perMemberCost: 12.5,
            totalCost: 125,
            recurringCharges: [{ amount: 12.5, frequency: "monthly", description: "per member" }],
            oneTimeCharges: [{ amount: 5, description: "activation" }],
            term: "12-months",
            limitations: ["fair-use"],
            expiry: Date.now() + 172_800_000,
            provenance: "unicom-listing",
          },
        },
        {
          cmd: "commit",
          actor: "prin-alice",
          input: { requestId: "gpr-tp", allocation: { lines: 1 } },
        },
        {
          cmd: "commit",
          actor: "prin-bob",
          input: { requestId: "gpr-tp", allocation: { lines: 1 } },
        },
        { cmd: "order", actor: "prin-alice", input: { requestId: "gpr-tp", event: "AUTHORIZE" } },
        {
          cmd: "order",
          actor: "prin-alice",
          input: {
            requestId: "gpr-tp",
            event: "PLACE_ORDER",
            paymentReference: {
              id: "pay-tp-1",
              type: "mobile-money",
              authority: "authorized-psp",
              created: Date.now(),
              settled: false,
            },
          },
        },
        {
          cmd: "order",
          actor: "prin-alice",
          input: { requestId: "gpr-tp", event: "CONFIRM_CONTRACT" },
        },
        {
          cmd: "order",
          actor: "prin-alice",
          input: { requestId: "gpr-tp", event: "MARK_FULFILLED" },
        },
        {
          cmd: "order",
          actor: "prin-alice",
          input: { requestId: "gpr-tp", event: "RECONCILE", usageEvidenceComplete: true },
        },
        { cmd: "view", principal: "prin-alice" },
        { cmd: "operator-view", principal: "prin-operator" },
        { cmd: "durability" },
        { cmd: "shutdown" },
      ],
    );

    const results = second.events.filter((e) => e.event === "result");
    for (const result of results) {
      assert.equal(result.applied, true, `${String(result.cmd)} refused: ${String(result.reason)}`);
    }
    // The order reached RECONCILED inside the second process.
    const reconciled = results.find((r) => r.cmd === "order" && r.order?.state === "RECONCILED");
    assert.notEqual(reconciled, undefined);

    // The customer view (built in the SECOND process) shows the whole
    // journey: the resource from process one, the RECONCILED order, the
    // opportunity recommendation.
    const view = second.events.find((e) => e.event === "view" && e.principal === "prin-alice")
      ?.view as {
      resources: { resourceId: string; share: string; status: string }[];
      organizations: { organization: string; state: string }[];
      groupPurchases: { requestId: string; orderState: string; committedParticipants: number }[];
      opportunities: { recommendation: string | undefined }[];
    };
    assert.equal(view.resources[0]?.resourceId, "res-tp");
    assert.equal(view.resources[0]?.share, "SHARED");
    assert.equal(view.resources[0]?.status, "DEGRADED");
    assert.equal(view.organizations[0]?.organization, "org-tp");
    assert.equal(view.groupPurchases[0]?.orderState, "RECONCILED");
    assert.equal(view.groupPurchases[0]?.committedParticipants, 2);
    assert.equal(view.opportunities[0]?.recommendation, "pursue alt");

    // The operator aggregate is available in the second process too.
    const operatorView = second.events.find(
      (e) => e.event === "view" && e.principal === "prin-operator",
    );
    assert.notEqual(operatorView, undefined);
    assert.equal(operatorView?.applied, true);

    // The durable log now carries both processes' snapshots (no reset).
    const stats = second.events.find((e) => e.event === "stats");
    assert.ok((stats?.stats?.snapshots ?? 0) >= 12);
    assert.equal(stats?.stats?.tornLines ?? -1, 0);
  });

  it("process three sees an unconfigured role list and refuses the operator view (config, not state)", async () => {
    const third = await driveRuntime(
      ["--state", statePath],
      [
        { cmd: "operator-view", principal: "prin-operator" },
        { cmd: "view", principal: "prin-alice" },
        { cmd: "shutdown" },
      ],
    );
    const refused = third.events.find((e) => e.event === "view" && e.principal === "prin-operator");
    assert.equal(refused?.applied, false);
    assert.match(String(refused?.reason), /does not hold the operator role/);
    // The customer view is still intact in the third process.
    const view = third.events.find((e) => e.event === "view" && e.principal === "prin-alice")
      ?.view as { groupPurchases: { orderState: string }[] };
    assert.equal(view.groupPurchases[0]?.orderState, "RECONCILED");
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
