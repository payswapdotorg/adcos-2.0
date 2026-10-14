import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// P4-W1 round-2 — BUDGET-ENFORCEMENT NEGATIVES BATTERY. Composed through
// PUBLIC contract entry points ONLY (same import discipline as the round-1
// battery test/security/isolation.test.ts): no package-internal imports, no
// package src/ edits, adcos-contracts FROZEN.
//
// The frozen contract surface exposes budget enforcement at exactly three
// seams, and each is proven here (spec/work-orders.md P4-W1: "budget
// enforcement" + INVARIANTS #19/#22/#25/#26):
//   1. the recommendation budget cap (Lab rankCandidates,
//      RecommendationConstraints.maxPriceMinorUnits) is a HARD constraint —
//      an over-budget candidate is REJECTED with reasons even when it is the
//      objectively best candidate on every ranking criterion, and removing
//      the cap restores its rank (the cap is a gate, never a score — hard
//      constraints cannot be traded away by a weighted reward function);
//   2. numeric hygiene fails closed: negative / non-integer / NaN / Infinity
//      amounts are refused by the ranking eligibility precheck and by the
//      economics trade-off engine (throw), including the unsafe
//      cross-product range guard; a malformed BASELINE throws outright
//      (baseline integrity);
//   3. the offer boundary refuses lying arithmetic (stated totalCost must
//      equal perMemberCost × quantity in both directions) and refuses
//      NaN/Infinity amounts outright (fail-closed throw);
//   4. the coordination retry budget is enforced: an exhausted budget grants
//      nothing even for a message whose envelope passes every wire gate, and
//      a reconciliation requirement blocks retry until reconciled;
//   5. the commitment ledger (the monetary-adjacent budget surface that
//      exists) is exact under interleaved commitments — duplicates counted
//      once, no lost updates — and the accounting survives restart.
//
// HONEST LIMITS (asserted only where the contract guarantees them; recorded
// PARTIAL/GAP in docs/reports/security/round-2-report.md):
//   - there is NO monetary budget ledger on the frozen public surface, so
//     "budget decrement" is proven on the two ledgers that exist (retry
//     budget, commitment/threshold accounting);
//   - a CONSISTENT negative offer (perMemberCost and totalCost both
//     negative) is NOT refused by the offer schema today — GAP recorded
//     with probe evidence in the round-2 report, never asserted here as a
//     guarantee;
//   - zero price is legal by documented contract domain ("integer >= 0");
//     zero capacity is refused.
// ============================================================================

import {
  createSurfacesService,
  JsonlSurfaceStateStore,
} from "../../packages/surfaces/src/contract.js";
import {
  validateEnvelope,
  createEnvelopeReplayGuard,
  beginProcessing,
  type ValidationContext,
} from "../../packages/coordination/src/contract.js";
import type { Message } from "../../packages/adcos-contracts/src/index.js";
import { rankCandidates } from "../../packages/lab/src/contract.js";
import type { RecommendationCandidate } from "../../packages/lab/src/contract.js";
import { comparePriceCapacity } from "../../packages/economics/src/contract.js";

type Service = ReturnType<typeof createSurfacesService>;

const T0 = 1_700_000_000_000;
const ALICE = "prin-alice-bud";
const MEMBER = "prin-member-bud";
const MEMBER2 = "prin-member2-bud";

const dir = mkdtempSync(join(tmpdir(), "adcos-p4w1-budget-"));
const path = (name: string): string => join(dir, `${name}.jsonl`);

const service = (name: string, clock: () => number = () => T0): Service =>
  createSurfacesService({ statePath: path(name), now: clock });

const candidate = (
  id: string,
  price: number,
  capacity: number,
  confidence = 0.9,
): RecommendationCandidate => ({
  id,
  kind: "SUBSCRIPTION",
  priceMinorUnits: price,
  capacityUnits: capacity,
  confidence,
  provenance: "fixture:p4w1-budget",
  eligibility: { feasible: true, reasons: [] },
  assumptions: [],
});

const ranking = (candidates: readonly RecommendationCandidate[], maxPriceMinorUnits?: number) =>
  rankCandidates({
    id: "rank-bud",
    intent: "intent-bud",
    kind: "SUBSCRIPTION",
    snapshot: "fixture:p4w1-budget",
    baseline: "base",
    candidates,
    ...(maxPriceMinorUnits !== undefined ? { constraints: { maxPriceMinorUnits } } : {}),
    evaluatedAt: T0,
  });

/**
 * Found an organization through the public journey (Lab evidence → formation).
 * The organizer holds a durable group-wide mandate; each optional member gets
 * a durable purchase mandate.
 */
const foundOrg = (
  svc: Service,
  opts: { labId: string; orgId: string; organizer: string; members: string[]; now: number },
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
  return svc.formOrganization(opts.organizer, {
    organization: opts.orgId,
    pursuitEvidenceId: `${opts.labId}-opportunity`,
    candidates: [
      { principal: opts.organizer, consent: true, consentRecordedAt: opts.now },
      ...opts.members.map((principal) => ({
        principal,
        consent: true,
        consentRecordedAt: opts.now,
      })),
    ],
    minFounders: 1 + opts.members.length,
    authorityScope: "group",
    initialMandates: [
      { principal: opts.organizer, scope: "group", permissions: ["all"] },
      ...opts.members.map((principal) => ({
        principal,
        scope: "group.purchase",
        permissions: ["commitment:write"],
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
  provenance: "unicom-listing:p4w1-budget",
});

describe("over-budget candidates are refused as a hard constraint, not a score", () => {
  it("the objectively best candidate above the cap is REJECTED with reasons — a worse candidate below the cap ranks first", () => {
    // 'premium' is the objectively best candidate: lowest price-per-capacity
    // (5 milli vs 9 and 10) AND highest capacity AND highest confidence.
    const candidates = [
      candidate("base", 100, 10),
      candidate("cheap", 90, 10, 0.8),
      candidate("premium", 500, 100, 0.99),
    ];

    // Without a budget cap the premium candidate ranks #1 on merit.
    const uncapped = ranking(candidates);
    assert.equal(uncapped.ranked[0]?.candidate, "premium");

    // With the cap it is REFUSED outright (INVARIANTS #22: hard constraints
    // are never traded away by ranking criteria) and the affordable
    // candidate leads instead.
    const capped = ranking(candidates, 120);
    assert.deepEqual(
      capped.ranked.map((r) => r.candidate),
      ["cheap", "base"],
      "the over-budget candidate is absent from the ranking",
    );
    const rejected = capped.rejected.find((r) => r.candidate === "premium");
    assert.ok(rejected, "the over-budget candidate is kept in the report, never dropped");
    assert.deepEqual(rejected?.reasons, ["price 500 above budget cap 120 (hard constraint)"]);
    // The constraint itself is recorded on the report (auditable, INVARIANTS #26).
    assert.deepEqual(capped.constraints, { maxPriceMinorUnits: 120 });
  });

  it("the baseline (current spend) is subject to the same cap — a no-change arm over budget is REJECTED with reasons", () => {
    const capped = ranking([candidate("base", 500, 10), candidate("cheap", 90, 10)], 120);
    const rejected = capped.rejected.find((r) => r.candidate === "base");
    assert.ok(rejected, "the over-budget baseline is reported");
    assert.deepEqual(rejected?.reasons, ["price 500 above budget cap 120 (hard constraint)"]);
    assert.deepEqual(
      capped.ranked.map((r) => r.candidate),
      ["cheap"],
    );
  });
});

describe("malformed amounts are refused (fail-closed numeric hygiene)", () => {
  it("negative / non-integer / NaN / Infinity prices are REJECTED with exact reasons; capacity must be an integer >= 1", () => {
    const cases: ReadonlyArray<[string, number, number, RegExp]> = [
      ["NaN price", NaN, 10, /price must be an integer >= 0 in minor units \(got NaN\)/],
      [
        "Infinity price",
        Infinity,
        10,
        /price must be an integer >= 0 in minor units \(got Infinity\)/,
      ],
      ["negative price", -5, 10, /price must be an integer >= 0 in minor units \(got -5\)/],
      ["fractional price", 90.5, 10, /price must be an integer >= 0 in minor units \(got 90\.5\)/],
      ["zero capacity", 90, 0, /capacity must be an integer >= 1 \(got 0\)/],
      ["negative capacity", 90, -2, /capacity must be an integer >= 1 \(got -2\)/],
      ["NaN capacity", 90, NaN, /capacity must be an integer >= 1 \(got NaN\)/],
      ["Infinity capacity", 90, Infinity, /capacity must be an integer >= 1 \(got Infinity\)/],
    ];
    for (const [label, price, capacity, reasonPattern] of cases) {
      const report = ranking([candidate("base", 100, 10), candidate("bad", price, capacity)]);
      const rejected = report.rejected.find((r) => r.candidate === "bad");
      assert.ok(rejected, `[${label}] the malformed candidate is reported`);
      assert.match(
        rejected?.reasons.join("; ") ?? "",
        reasonPattern,
        `[${label}] exact refusal reason`,
      );
      assert.equal(
        report.ranked.some((r) => r.candidate === "bad"),
        false,
        `[${label}] the malformed candidate is never ranked`,
      );
    }
    // Zero PRICE is legal by documented domain ("integer >= 0"): a free-tier
    // candidate ranks; this is contract behavior, not a refusal.
    const zero = ranking([candidate("base", 100, 10), candidate("free", 0, 20)]);
    assert.equal(zero.ranked[0]?.candidate, "free");
  });

  it("a malformed BASELINE throws outright (baseline integrity — no evidence is invented)", () => {
    assert.throws(
      () => ranking([candidate("base", NaN, 10), candidate("ok", 50, 10)]),
      /candidate base: price must be an integer >= 0 in minor units \(got NaN\)/,
    );
    assert.throws(
      () => ranking([candidate("base", 100, 0), candidate("ok", 50, 10)]),
      /candidate base: capacity must be an integer >= 1 \(got 0\)/,
    );
  });

  it("the trade-off engine throws on malformed numbers and on unsafe cross products", () => {
    const throws = (baseline: { id: string; priceMinorUnits: number; capacityUnits: number }) =>
      assert.throws(
        () => comparePriceCapacity(baseline, []),
        /price must be an integer >= 0 in minor units|capacity must be an integer >= 1|price×capacity cross products exceed the safe integer range/,
      );
    throws({ id: "neg", priceMinorUnits: -1, capacityUnits: 1 });
    throws({ id: "frac", priceMinorUnits: 0.5, capacityUnits: 1 });
    throws({ id: "nan", priceMinorUnits: NaN, capacityUnits: 1 });
    throws({ id: "inf", priceMinorUnits: Infinity, capacityUnits: 1 });
    throws({ id: "zerocap", priceMinorUnits: 10, capacityUnits: 0 });
    throws({ id: "fraccap", priceMinorUnits: 10, capacityUnits: 1.5 });
    // 2^53-1 × 2 exceeds the safe integer range — refused, never rounded.
    throws({ id: "unsafe", priceMinorUnits: 9_007_199_254_740_991, capacityUnits: 2 });
    // The safe boundary itself is computed exactly.
    const safe = comparePriceCapacity({ id: "safe", priceMinorUnits: 1_000, capacityUnits: 8 }, []);
    assert.equal(safe[0]?.pricePerCapacityMilli, 125_000, "floor(1000 × 1000 / 8)");
  });
});

describe("the offer boundary fails closed on lying and non-finite cost arithmetic", () => {
  it("an understated OR overstated totalCost is refused; only the exact per-member roll-up is accepted", () => {
    let t = T0;
    const svc = service("offer-math", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-bud-math",
        orgId: "org-bud-math",
        organizer: ALICE,
        members: [MEMBER, MEMBER2],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-bud-math",
        intent: "intent-bud-math",
        organization: "org-bud-math",
        requirements: {},
        threshold: 3,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );

    const understated = svc.receiveOffer(ALICE, {
      ...offer("gpo-under", "gpr-bud-math", 3, t),
      totalCost: 60,
    });
    assert.equal(understated.applied, false);
    assert.match(
      understated.reason ?? "",
      /offer 'gpo-under' totals inconsistent: stated totalCost 60 does not match the per-member roll-up 25 × 3/,
    );
    const overstated = svc.receiveOffer(ALICE, {
      ...offer("gpo-over", "gpr-bud-math", 3, t),
      totalCost: 90,
    });
    assert.equal(overstated.applied, false);
    assert.match(overstated.reason ?? "", /totals inconsistent/);

    const honest = svc.receiveOffer(ALICE, offer("gpo-honest", "gpr-bud-math", 3, t));
    assert.equal(honest.applied, true, honest.reason ?? "the exact roll-up must apply");
    assert.equal(new JsonlSurfaceStateStore(path("offer-math")).restore().offers.length, 1);
  });

  it("NaN and Infinity amounts are refused outright (fail-closed throw, never coerced)", () => {
    let t = T0;
    const svc = service("offer-nonfinite", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-bud-nf",
        orgId: "org-bud-nf",
        organizer: ALICE,
        members: [],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-bud-nf",
        intent: "intent-bud-nf",
        organization: "org-bud-nf",
        requirements: {},
        threshold: 1,
        expiresAt: t + 86_400_000,
      }).applied,
      true,
    );
    // NaN amounts: the frozen offer contract refuses non-number values —
    // the refusal surfaces as a typed throw from the schema boundary.
    assert.throws(
      () =>
        svc.receiveOffer(ALICE, {
          ...offer("gpo-nan", "gpr-bud-nf", 3, t),
          perMemberCost: NaN,
        }),
      /Invalid input: expected number, received NaN/,
    );
    // Infinity amounts: likewise refused (non-finite is not a number here).
    assert.throws(
      () =>
        svc.receiveOffer(ALICE, {
          ...offer("gpo-inf", "gpr-bud-nf", 3, t),
          perMemberCost: Infinity,
          totalCost: Infinity,
        }),
      /Invalid input: expected number, received Infinity/,
    );
    // Nothing was persisted by the refused offers.
    assert.equal(new JsonlSurfaceStateStore(path("offer-nonfinite")).restore().offers.length, 0);
  });
});

// Wire fixtures (coordination public entries, same shapes as
// test/integration/negative-boundaries.test.ts).
const budgetValidationContext = (): ValidationContext => ({
  allowedScopes: ["device.forwarding"],
  currentPolicyEpoch: 7,
  knownSenders: ["inst-requester"],
  requireKnownSender: true,
  maxPayloadDigestLength: 64,
  now: T0,
});

const budgetEnvelope = (overrides: { eventId?: string; idempotencyKey?: string } = {}) => ({
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: overrides.eventId ?? "evt-bud-1",
  commandId: "cmd-bud",
  sender: "inst-requester",
  receiver: "inst-holder",
  scope: "device.forwarding",
  issuedAt: T0,
  expiresAt: T0 + 3_600_000,
  idempotencyKey: overrides.idempotencyKey ?? "op-bud-1",
  payloadDigest: "sha256:abcd",
  policyEpoch: 7,
});

describe("the retry budget is enforced and grants nothing once exhausted", () => {
  it("an exhausted retry budget refuses reprocessing even for a message whose envelope passes every wire gate", () => {
    const guard = createEnvelopeReplayGuard();
    const wire = validateEnvelope(budgetEnvelope(), budgetValidationContext(), guard);
    assert.equal(wire.accepted, true, "the envelope itself is valid, fresh and in scope");

    const exhausted: Message = {
      id: "msg-bud-1",
      envelope: budgetEnvelope(),
      payload: { note: "budget probe" },
      lifecycle: {
        state: "FAILED",
        attempts: 3,
        maxRetries: 3,
        deadLetterReason: "retry budget exhausted (3/3)",
      },
      createdAt: T0,
      updatedAt: T0,
    };
    const refused = beginProcessing(exhausted, T0);
    assert.equal(refused.applied, false, "the exhausted budget dominates the valid envelope");
    assert.match(refused.reason ?? "", /retry budget exhausted \(3\/3\)/);

    // A reconciliation requirement blocks retry below exhaustion too.
    const needsReconcile: Message = {
      id: "msg-bud-2",
      envelope: budgetEnvelope({ eventId: "evt-bud-2", idempotencyKey: "op-bud-2" }),
      payload: { note: "reconcile probe" },
      lifecycle: { state: "FAILED", attempts: 1, maxRetries: 3 },
      createdAt: T0,
      updatedAt: T0,
    };
    const blocked = beginProcessing(needsReconcile, T0, { reconcileRequired: true });
    assert.equal(blocked.applied, false);
    assert.match(
      blocked.reason ?? "",
      /reconciliation required before retry \(Status\.reconcile\)/,
    );
  });
});

describe("commitment-ledger accounting is exact under interleaving and survives restart", () => {
  it("interleaved commitments (with duplicate and withdrawn-and-recommitted participants) lose no updates; the accounting survives restart", () => {
    let t = T0;
    const svc = service("ledger-interleaved", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-bud-led",
        orgId: "org-bud-led",
        organizer: ALICE,
        members: [MEMBER, MEMBER2],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-bud-led",
        intent: "intent-bud-led",
        organization: "org-bud-led",
        requirements: {},
        threshold: 3,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-bud-led", "gpr-bud-led", 3, t)).applied, true);

    // Interleave three participants, a duplicate attempt and a
    // withdraw-then-recommit cycle: every distinct participant lands exactly
    // once in the ledger (no lost updates, no double counting). The
    // withdrawal cycle runs while the order is still in the open phase
    // (below threshold) — individual withdrawal is open-phase only.
    assert.equal(
      svc.commitToPurchase(ALICE, { requestId: "gpr-bud-led", allocation: { lines: 1 } }).applied,
      true,
    );
    const member2First = svc.commitToPurchase(MEMBER2, {
      requestId: "gpr-bud-led",
      allocation: { lines: 1 },
    });
    assert.equal(member2First.applied, true, member2First.reason ?? "commit must apply");
    assert.equal(
      svc.commitToPurchase(MEMBER2, { requestId: "gpr-bud-led", allocation: { lines: 4 } }).applied,
      false,
      "the duplicate participant is refused at the boundary",
    );
    assert.equal(svc.withdrawCommitment(MEMBER2, member2First.commitment?.id ?? "").applied, true);
    assert.equal(
      svc.commitToPurchase(MEMBER2, { requestId: "gpr-bud-led", allocation: { lines: 2 } }).applied,
      true,
      "the withdrawn participant re-commits with a fresh commitment",
    );
    assert.equal(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-bud-led", allocation: { lines: 1 } }).applied,
      true,
      "the third distinct participant completes the ledger",
    );
    assert.equal(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-bud-led", allocation: { lines: 9 } }).applied,
      false,
      "a post-threshold duplicate is still refused",
    );

    const view = svc.getCustomerView(ALICE).groupPurchases[0];
    assert.equal(view?.committedParticipants, 3, "exactly three distinct participants counted");
    assert.equal(view?.threshold, 3);
    assert.equal(view?.orderState, "THRESHOLD_MET");

    // Restart over the same durable log: the accounting is identical.
    const restarted = createSurfacesService({
      statePath: path("ledger-interleaved"),
      now: () => t,
    });
    const restoredView = restarted.getCustomerView(ALICE).groupPurchases[0];
    assert.equal(restoredView?.committedParticipants, 3);
    assert.equal(restoredView?.orderState, "THRESHOLD_MET");
    // And the durable ledger holds exactly one live commitment per participant.
    const ledger = new JsonlSurfaceStateStore(path("ledger-interleaved")).restore().commitments;
    assert.deepEqual(
      ledger
        .filter((c) => !c.revoked)
        .map((c) => c.participant)
        .sort(),
      [ALICE, MEMBER, MEMBER2],
    );
    assert.equal(
      ledger.filter((c) => c.revoked).length,
      1,
      "the withdrawn commitment is retained as revoked (history never rewritten)",
    );
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
