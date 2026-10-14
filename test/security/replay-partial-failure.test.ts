import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// P4-W1 round-2 — REPLAY / PARTIAL-FAILURE BATTERY. Composed through PUBLIC
// contract entry points ONLY (same import discipline as the round-1 battery
// test/security/isolation.test.ts and test/integration/negative-boundaries.
// test.ts): no package-internal imports, no package src/ edits,
// adcos-contracts FROZEN.
//
// Classes proven here (spec/work-orders.md P4-W1: "stale/unknown/replay/
// partial failure" + INVARIANTS #10/#11/#12/#23):
//   1. replayed commands are refused or idempotent — no double effects: the
//      surfaces boundary refuses duplicate opportunities, organizations,
//      requests, offers, commitments, withdrawals and revocations, and the
//      refused replay leaves the persisted view byte-identical;
//   2. double-delivery of the same intent grants nothing on the wire: the
//      envelope replay guard keys on idempotencyKey (falling back to
//      eventId) — a second delivery of the same intent is REPLAY-refused
//      before dispatch; the guard's bounded FIFO capacity is honestly
//      probed (an evicted key is forgotten — capacity-bounded mitigation,
//      recorded in the threat model, not hidden);
//   3. crash-between-steps leaves a consistent recoverable state: dropping
//      the service instance and rebuilding it over the SAME durable JSONL
//      log (the adapters store) after COMMIT and after AUTHORIZE preserves
//      exactly the applied prefix — recovery continues, replayed steps are
//      refused, and the order never double-advances;
//   4. crash-during-persist (torn tail) is reported, not trusted: a torn
//      final line is counted and skipped, the store folds the last intact
//      snapshot, and a fresh service keeps working over the damaged log;
//   5. mandate expiry between commit and authorize fails closed ACROSS the
//      restart — authority is recomputed from the persisted mandates of the
//      restarted instance, never cached from the pre-crash process;
//   6. inbox partial failure is durable: a FAILED processing attempt's
//      retry-budget consumption and dead-letter state survive the store's
//      restart fold (crash-then-restart never resets the budget).
// ============================================================================

import {
  createSurfacesService,
  JsonlSurfaceStateStore,
} from "../../packages/surfaces/src/contract.js";
import {
  validateEnvelope,
  createEnvelopeReplayGuard,
  beginProcessing,
  recordOutcome,
  isDeadLettered,
  JsonlInboxStore,
  type ValidationContext,
} from "../../packages/coordination/src/contract.js";
import { createReplayGuard } from "../../packages/adcos-contracts/src/index.js";
import type { Envelope, Message } from "../../packages/adcos-contracts/src/index.js";

type Service = ReturnType<typeof createSurfacesService>;

const T0 = 1_700_000_000_000;
const ALICE = "prin-alice-rpf";
const MEMBER = "prin-member-rpf";

const dir = mkdtempSync(join(tmpdir(), "adcos-p4w1-replay-"));
const path = (name: string): string => join(dir, `${name}.jsonl`);

const service = (name: string, clock: () => number = () => T0): Service =>
  createSurfacesService({ statePath: path(name), now: clock });

const enroll = (id: string) => ({
  id,
  device: `dev-${id}`,
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
});

/**
 * Found an organization through the public journey (Lab evidence → formation).
 * The organizer holds a durable group-wide mandate; each optional member gets
 * a mandate ONLY when `mandate` is provided ({ expiresAt } = expiring).
 */
const foundOrg = (
  svc: Service,
  opts: {
    labId: string;
    orgId: string;
    organizer: string;
    members?: Array<{ principal: string; mandate?: { scope?: string; expiresAt?: number } }>;
    now: number;
  },
) => {
  const evaluated = svc.runLabEvaluation({
    id: opts.labId,
    intent: `intent-${opts.labId}`,
    baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
    alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
    selectedStrategy: "alt",
    confidence: 0.8,
    assumptions: [],
  });
  assert.equal(evaluated.applied, true, evaluated.reason ?? "lab evaluation must apply");
  const members = opts.members ?? [];
  return svc.formOrganization(opts.organizer, {
    organization: opts.orgId,
    pursuitEvidenceId: `${opts.labId}-opportunity`,
    candidates: [
      { principal: opts.organizer, consent: true, consentRecordedAt: opts.now },
      ...members.map((m) => ({
        principal: m.principal,
        consent: true,
        consentRecordedAt: opts.now,
      })),
    ],
    minFounders: 1 + members.length,
    authorityScope: "group",
    initialMandates: [
      { principal: opts.organizer, scope: "group", permissions: ["all"] },
      ...(members ?? [])
        .filter((m) => m.mandate !== undefined)
        .map((m) => ({
          principal: m.principal,
          scope: m.mandate?.scope ?? "group.purchase",
          permissions: ["commitment:write"],
          ...(m.mandate?.expiresAt !== undefined ? { expiresAt: m.mandate.expiresAt } : {}),
        })),
    ],
  });
};

const offer = (id: string, request: string, quantity: number, t: number) => ({
  id,
  request,
  supplier: "teleco-x",
  product: "data-bundle-10gb",
  capability: "data-plan-v2",
  region: "GH",
  quantity,
  perMemberCost: 25,
  totalCost: 25 * quantity,
  recurringCharges: [],
  oneTimeCharges: [],
  term: "12-months",
  limitations: ["fair-use"],
  expiry: t + 1_728_000_000,
  provenance: "unicom-listing:p4w1-r2",
});

const paymentReference = (id: string, t: number) => ({
  id,
  type: "payref",
  authority: "payment-authority-x",
  created: t,
  amount: 50,
  currency: "GHS",
  settled: false,
});

// Wire fixtures (same shape as test/integration/negative-boundaries.test.ts).
const validationContext = (now: number): ValidationContext => ({
  allowedScopes: ["device.forwarding"],
  currentPolicyEpoch: 7,
  knownSenders: ["inst-requester"],
  requireKnownSender: true,
  maxPayloadDigestLength: 64,
  now,
});

const envelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: "evt-rpf-1",
  commandId: "cmd-rpf",
  sender: "inst-requester",
  receiver: "inst-holder",
  scope: "device.forwarding",
  issuedAt: T0,
  expiresAt: T0 + 3_600_000,
  idempotencyKey: "op-rpf-1",
  payloadDigest: "sha256:abcd",
  policyEpoch: 7,
  ...overrides,
});

const message = (overrides: { lifecycle?: Message["lifecycle"]; id?: string } = {}): Message => ({
  id: overrides.id ?? "msg-rpf-1",
  envelope: envelope(),
  payload: { note: "probe" },
  lifecycle: overrides.lifecycle ?? {
    state: "PENDING",
    attempts: 0,
    maxRetries: 3,
  },
  createdAt: T0,
  updatedAt: T0,
});

describe("replayed commands are refused with no double-effects", () => {
  it("duplicate opportunity/organization/request/offer/commitment commands are each refused — and the view is byte-identical", () => {
    let t = T0;
    const svc = service("replay-commands", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-rpf-1",
        orgId: "org-rpf-1",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-rpf-1",
        intent: "intent-rpf-1",
        organization: "org-rpf-1",
        requirements: { product: "data-bundle" },
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-rpf-1", "gpr-rpf-1", 2, t)).applied, true);
    const commit = svc.commitToPurchase(ALICE, {
      requestId: "gpr-rpf-1",
      allocation: { lines: 1 },
    });
    assert.equal(commit.applied, true, commit.reason ?? "commit must apply");

    const before = JSON.stringify(svc.getCustomerView(ALICE));

    // Every replayed write is refused at the command boundary.
    assert.equal(
      svc.runLabEvaluation({
        id: "lab-rpf-1",
        intent: "intent-rpf-1",
        baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
        alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
        selectedStrategy: "alt",
        confidence: 0.8,
        assumptions: [],
      }).applied,
      false,
    );
    assert.equal(
      foundOrg(svc, { labId: "lab-other", orgId: "org-rpf-1", organizer: ALICE, now: t }).applied,
      false,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-rpf-1",
        intent: "intent-rpf-1",
        organization: "org-rpf-1",
        requirements: {},
        threshold: 2,
        expiresAt: t + 86_400_000,
      }).applied,
      false,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-rpf-1", "gpr-rpf-1", 2, t)).applied, false);
    const replayedCommit = svc.commitToPurchase(ALICE, {
      requestId: "gpr-rpf-1",
      allocation: { lines: 1 },
    });
    assert.equal(replayedCommit.applied, false);
    assert.match(
      replayedCommit.reason ?? "",
      /already holds commitment 'gpr-rpf-1-commit-prin-alice-rpf-0' on request 'gpr-rpf-1' — withdraw it first/,
    );

    // No double-effects: the projection is unchanged by the refused replays.
    assert.equal(JSON.stringify(svc.getCustomerView(ALICE)), before);
  });

  it("withdrawal and revocation are terminal-safe: replayed withdrawal and re-revocation are refused", () => {
    let t = T0;
    const svc = service("replay-terminal", () => t);
    assert.equal(svc.enrollResource(ALICE, enroll("res-rpf-t")).applied, true);
    assert.equal(svc.applyConsentEvent(ALICE, "res-rpf-t", "OPT_IN").applied, true);
    assert.equal(svc.revokeResource(ALICE, "res-rpf-t").applied, true);
    assert.equal(svc.revokeResource(ALICE, "res-rpf-t").applied, false);
    assert.match(svc.revokeResource(ALICE, "res-rpf-t").reason ?? "", /already revoked/);

    // The withdrawn-commitment replay: open a fresh request, commit, withdraw.
    assert.equal(
      foundOrg(svc, { labId: "lab-rpf-t", orgId: "org-rpf-t", organizer: ALICE, now: t }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-rpf-t",
        intent: "intent-rpf-t",
        organization: "org-rpf-t",
        requirements: {},
        threshold: 2,
        expiresAt: t + 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-rpf-t", "gpr-rpf-t", 2, t)).applied, true);
    const commit = svc.commitToPurchase(ALICE, {
      requestId: "gpr-rpf-t",
      allocation: { lines: 1 },
    });
    assert.equal(commit.applied, true, commit.reason ?? "commit must apply");
    assert.equal(svc.withdrawCommitment(ALICE, commit.commitment?.id ?? "").applied, true);
    const replayed = svc.withdrawCommitment(ALICE, commit.commitment?.id ?? "");
    assert.equal(replayed.applied, false);
    assert.match(replayed.reason ?? "", /is already withdrawn/);
  });
});

describe("double-delivery of the same intent grants nothing on the wire", () => {
  it("a second delivery carrying the SAME idempotency key under a FRESH eventId is a REPLAY (never dispatched)", () => {
    const guard = createEnvelopeReplayGuard();
    const ctx = validationContext(T0);
    const first = validateEnvelope(envelope(), ctx, guard);
    assert.equal(first.accepted, true, JSON.stringify(first.failures));
    const second = validateEnvelope(envelope({ eventId: "evt-rpf-2" }), ctx, guard);
    assert.equal(second.accepted, false);
    assert.deepEqual(
      second.failures.map((f) => f.code),
      ["REPLAY"],
    );
    assert.match(second.failures[0]?.detail ?? "", /duplicate idempotencyKey\/eventId 'op-rpf-1'/);
  });

  it("without an idempotencyKey the eventId IS the intent key — the same eventId delivered twice is a REPLAY", () => {
    const guard = createEnvelopeReplayGuard();
    const ctx = validationContext(T0);
    const bare = envelope({ idempotencyKey: undefined });
    const first = validateEnvelope(bare, ctx, guard);
    assert.equal(first.accepted, true, JSON.stringify(first.failures));
    const second = validateEnvelope(bare, ctx, guard);
    assert.equal(second.accepted, false);
    assert.ok(second.failures.some((f) => f.code === "REPLAY"));
    assert.match(second.failures[0]?.detail ?? "", /duplicate idempotencyKey\/eventId 'evt-rpf-1'/);
  });

  it("the replay guard is honestly capacity-bounded: an evicted key is forgotten (documented bound, not a hidden guarantee)", () => {
    const guard = createReplayGuard({ maxEntries: 2 });
    assert.equal(guard.seen("k1"), false, "k1 is first-seen");
    assert.equal(guard.seen("k2"), false, "k2 is first-seen");
    assert.equal(guard.size, 2);
    assert.equal(guard.seen("k3"), false, "k3 is first-seen and evicts k1 (FIFO)");
    assert.equal(guard.size, 2, "the guard stays bounded");
    // k1 was evicted — a replay of k1 is NOT detected. This is the documented
    // bounded-memory design (round-2 threat model: replay protection is
    // capacity-bounded and process-local; durable id-uniqueness at the
    // surfaces boundary is the second line of defense).
    assert.equal(guard.seen("k1"), false, "evicted key is forgotten");
  });
});

describe("crash-between-steps leaves a consistent recoverable state (same durable log)", () => {
  it("commit-then-crash: a NEW service over the same log preserves the commitment, and authorization continues after restart", () => {
    let t = T0;
    const svc = service("crash-commit", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-crash-c",
        orgId: "org-crash-c",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-crash-c",
        intent: "intent-crash-c",
        organization: "org-crash-c",
        requirements: {},
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-crash-c", "gpr-crash-c", 2, t)).applied, true);
    assert.equal(
      svc.commitToPurchase(ALICE, { requestId: "gpr-crash-c", allocation: { lines: 1 } }).applied,
      true,
    );
    assert.equal(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-crash-c", allocation: { lines: 1 } }).applied,
      true,
    );
    // The process "crashes" here: the instance is dropped (never disposed).

    const restarted = createSurfacesService({ statePath: path("crash-commit"), now: () => t });
    const view = restarted.getCustomerView(ALICE);
    assert.equal(view.groupPurchases[0]?.orderState, "THRESHOLD_MET");
    assert.equal(view.groupPurchases[0]?.myCommitmentId, "gpr-crash-c-commit-prin-alice-rpf-0");

    // Recovery CONTINUES on the restarted instance — authorize + place order.
    assert.equal(
      restarted.advancePurchaseOrder(ALICE, { requestId: "gpr-crash-c", event: "AUTHORIZE" })
        .applied,
      true,
    );
    assert.equal(
      restarted.advancePurchaseOrder(ALICE, {
        requestId: "gpr-crash-c",
        event: "PLACE_ORDER",
        paymentReference: paymentReference("pay-crash-c", t),
      }).applied,
      true,
    );
    assert.equal(restarted.getCustomerView(ALICE).groupPurchases[0]?.orderState, "ORDERED");
  });

  it("authorize-then-crash: the authorization survives restart and is NEVER granted twice (replayed AUTHORIZE is refused)", () => {
    let t = T0;
    const svc = service("crash-authorize", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-crash-a",
        orgId: "org-crash-a",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-crash-a",
        intent: "intent-crash-a",
        organization: "org-crash-a",
        requirements: {},
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-crash-a", "gpr-crash-a", 2, t)).applied, true);
    assert.equal(
      svc.commitToPurchase(ALICE, { requestId: "gpr-crash-a", allocation: { lines: 1 } }).applied,
      true,
    );
    assert.equal(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-crash-a", allocation: { lines: 1 } }).applied,
      true,
    );
    assert.equal(
      svc.advancePurchaseOrder(ALICE, { requestId: "gpr-crash-a", event: "AUTHORIZE" }).applied,
      true,
    );

    // Crash after AUTHORIZE; restart over the same durable log.
    const restarted = createSurfacesService({ statePath: path("crash-authorize"), now: () => t });
    assert.equal(restarted.getCustomerView(ALICE).groupPurchases[0]?.orderState, "AUTHORIZED");

    // The replayed AUTHORIZE cannot double-advance the order.
    const replayed = restarted.advancePurchaseOrder(ALICE, {
      requestId: "gpr-crash-a",
      event: "AUTHORIZE",
    });
    assert.equal(replayed.applied, false);
    assert.match(replayed.reason ?? "", /event AUTHORIZE is not legal in state AUTHORIZED/);
    assert.equal(restarted.getCustomerView(ALICE).groupPurchases[0]?.orderState, "AUTHORIZED");

    // Recovery continues: place the order with opaque payment evidence.
    assert.equal(
      restarted.advancePurchaseOrder(ALICE, {
        requestId: "gpr-crash-a",
        event: "PLACE_ORDER",
        paymentReference: paymentReference("pay-crash-a", t),
      }).applied,
      true,
    );
    assert.equal(restarted.getCustomerView(ALICE).groupPurchases[0]?.orderState, "ORDERED");
  });

  it("crash-during-persist: a torn final line is reported and skipped — the store folds the last intact snapshot and keeps working", () => {
    let t = T0;
    const svc = service("crash-torn", () => t);
    assert.equal(svc.enrollResource(ALICE, enroll("res-rpf-torn")).applied, true);
    assert.equal(svc.applyConsentEvent(ALICE, "res-rpf-torn", "OPT_IN").applied, true);
    assert.equal(svc.getCustomerView(ALICE).resources[0]?.share, "SHARED");

    // Crash mid-append: a truncated (torn) final line lands in the log.
    appendFileSync(path("crash-torn"), '{"consents":[{"resourceId":"res-rpf-to');

    const store = new JsonlSurfaceStateStore(path("crash-torn"));
    assert.equal(store.stats().tornLines, 1, "the torn tail is counted, never trusted");
    assert.ok(store.stats().snapshots >= 2, "intact snapshots are still folded");
    assert.equal(store.restore().consents[0]?.state, "SHARED", "last intact snapshot wins");

    // A fresh service boots over the damaged log and keeps working.
    const restarted = createSurfacesService({ statePath: path("crash-torn"), now: () => t });
    assert.equal(restarted.getCustomerView(ALICE).resources[0]?.share, "SHARED");
    assert.equal(
      restarted.applyConsentEvent(ALICE, "res-rpf-torn", "PAUSE").applied,
      true,
      "the recovered instance still applies new commands",
    );
    assert.equal(restarted.getCustomerView(ALICE).resources[0]?.share, "PAUSED");
  });

  it("mandate expiry between commit and authorize fails closed ACROSS the restart (authority is recomputed, never cached)", () => {
    let t = T0;
    const svc = service("crash-expiry", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-crash-e",
        orgId: "org-crash-e",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: { expiresAt: t + 10_000 } }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-crash-e",
        intent: "intent-crash-e",
        organization: "org-crash-e",
        requirements: {},
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-crash-e", "gpr-crash-e", 2, t)).applied, true);
    assert.equal(
      svc.commitToPurchase(ALICE, { requestId: "gpr-crash-e", allocation: { lines: 1 } }).applied,
      true,
    );
    assert.equal(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-crash-e", allocation: { lines: 1 } }).applied,
      true,
    );

    // Crash; the clock advances past the member's mandate expiry while down.
    const restarted = createSurfacesService({
      statePath: path("crash-expiry"),
      now: () => t + 20_000,
    });
    const authorize = restarted.advancePurchaseOrder(ALICE, {
      requestId: "gpr-crash-e",
      event: "AUTHORIZE",
    });
    assert.equal(authorize.applied, false);
    assert.match(
      authorize.reason ?? "",
      /authorization not grantable: committed participants without an active 'group\.purchase' mandate: prin-member-rpf/,
    );
    assert.equal(
      restarted.getCustomerView(ALICE).groupPurchases[0]?.orderState,
      "THRESHOLD_MET",
      "the refused command did not advance the order",
    );
  });
});

describe("inbox partial failure is durable: retry-budget consumption survives the restart fold", () => {
  it("a FAILED attempt's budget consumption survives reload; exhaustion dead-letters and the budget never resets", () => {
    const storePath = path("inbox-restart");
    const store = new JsonlInboxStore(storePath);
    const pending = message();
    store.append(pending);

    // The handler begins processing, then the attempt fails (crash-injected
    // by appending the transitioned snapshot, exactly as a real process
    // would persist before ack — write-before-ack).
    const begun = beginProcessing(pending, T0);
    assert.equal(begun.applied, true);
    const processing: Message = {
      ...pending,
      lifecycle: { ...pending.lifecycle, state: begun.state, attempts: begun.attempts },
    };
    store.append(processing);
    const failedOnce = recordOutcome(processing, "FAILED", T0 + 1_000);
    assert.equal(failedOnce.applied, true);
    assert.equal(failedOnce.state, "FAILED");
    const failed: Message = {
      ...processing,
      lifecycle: {
        ...processing.lifecycle,
        state: failedOnce.state,
        attempts: failedOnce.attempts,
      },
    };
    store.append(failed);

    // RESTART: a new store over the same file folds the last intact snapshot.
    const restarted = new JsonlInboxStore(storePath);
    assert.equal(restarted.stats().loaded, 1);
    const restored = restarted.list()[0];
    assert.ok(restored, "the folded store holds the message");
    assert.equal(restored.lifecycle.state, "FAILED");
    assert.equal(restored.lifecycle.attempts, 1, "budget consumption survived the restart");

    // Retry continues from the consumed budget — not from zero.
    const retried = beginProcessing(restored, T0 + 2_000);
    assert.equal(retried.applied, true);
    assert.equal(retried.attempts, 2, "the retry budget decrements across restarts");
    const failedAgain = recordOutcome(
      { ...restored, lifecycle: { ...restored.lifecycle, state: retried.state, attempts: 2 } },
      "FAILED",
      T0 + 3_000,
    );
    assert.equal(failedAgain.attempts, 3);
    const exhausted: Message = {
      ...restored,
      lifecycle: {
        ...restored.lifecycle,
        state: failedAgain.state,
        attempts: failedAgain.attempts,
        deadLetterReason: failedAgain.deadLetterReason,
      },
    };
    assert.equal(isDeadLettered(exhausted.lifecycle), true);
    restarted.append(exhausted);

    // Second restart: the dead-letter state is durable — the exhausted
    // budget grants nothing on the restarted instance either.
    const final = new JsonlInboxStore(storePath);
    const deadLettered = final.list()[0];
    assert.ok(deadLettered, "the folded store holds the dead-lettered message");
    assert.equal(isDeadLettered(deadLettered.lifecycle), true);
    assert.match(deadLettered.lifecycle.deadLetterReason ?? "", /retry budget exhausted \(3\/3\)/);
    const afterRestart = beginProcessing(deadLettered, T0 + 4_000);
    assert.equal(afterRestart.applied, false);
    assert.match(afterRestart.reason ?? "", /retry budget exhausted \(3\/3\)/);
  });

  it("a valid, in-scope, fresh envelope whose message exhausted its retry budget is still never reprocessed", () => {
    // The envelope would pass every wire gate (transport acceptance), but the
    // budget dominates: an exhausted retry budget grants nothing.
    const guard = createEnvelopeReplayGuard();
    const wire = validateEnvelope(envelope(), validationContext(T0), guard);
    assert.equal(wire.accepted, true, JSON.stringify(wire.failures));

    const dead = message({
      lifecycle: { state: "FAILED", attempts: 3, maxRetries: 3 },
    });
    assert.equal(isDeadLettered(dead.lifecycle), true);
    const refused = beginProcessing(dead, T0);
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /retry budget exhausted \(3\/3\)/);

    // Reconciliation-required failures stay blocked until reconciled.
    const needsReconcile = message({
      lifecycle: { state: "FAILED", attempts: 1, maxRetries: 3 },
    });
    const blocked = beginProcessing(needsReconcile, T0, { reconcileRequired: true });
    assert.equal(blocked.applied, false);
    assert.match(blocked.reason ?? "", /reconciliation required before retry/);
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
