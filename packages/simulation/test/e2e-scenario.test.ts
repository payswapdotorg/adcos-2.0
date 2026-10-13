import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runScenario } from "../src/contract.js";
import type { Scenario, ScenarioReport } from "../src/contract.js";
import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
} from "@adcos/contracts";

// ============================================================================
// Simulation E2E scenario test (P2-W3 round-2 recorded remainder, closed by
// P3-W1 Task 3): ONE fixed-snapshot, fully reproducible end-to-end scenario
// through the shadow harness covering the round-2 flows —
//   - member allocation with the explicit rounding policy + per-record
//     provenance, and pre-fulfilment withdrawal reallocation (explicit
//     shortfall under consent caps, nothing silently transferred);
//   - recommendation breadth with deterministic lexicographic ranking and
//     eligibility-precondition REJECT-with-reasons (hard constraints are
//     ineligibility, never a lower score);
//   - organization formation flows: founding from the Lab PURSUE verdict
//     with founder consent + initial mandates, and dissolution with explicit
//     open-commitment dispositions (including OUT_OF_AUTHORITY for a
//     non-member commitment).
//
// Reproducibility contract: two INDEPENDENT runs over independently cloned
// inputs produce IDENTICAL canonical snapshots (deepEqual + canonical JSON),
// and the scenario input is never mutated (advisory harness, no side
// effects). The numeric expectations below are LOCKED from the deterministic
// largest-remainder rule (group-allocation-largest-remainder-v1) — they are
// the recorded canonical snapshot of this scenario, not re-derived at
// assertion time.
// ============================================================================

const NOW = 1_700_000_000_000;

const request: GroupPurchaseRequest = {
  id: "gpr-e2e",
  intent: "intent-e2e",
  organization: "org-e2e",
  requirements: { product: "data-bundle-10gb", region: "GH" },
  participants: ["prin-alice"],
  threshold: 3,
  expiresAt: NOW + 86_400_000,
};

const offer: GroupPurchaseOffer = {
  id: "gpo-e2e",
  request: "gpr-e2e",
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
  expiry: NOW + 172_800_000,
  provenance: "unicom-listing:tier-2",
};

const commitment = (i: number, participant: string, lines: number): GroupPurchaseCommitment => ({
  id: `gpc-e2e-${i}`,
  request: "gpr-e2e",
  offer: "gpo-e2e",
  participant,
  allocation: { lines },
  acceptedAt: NOW - 1000 + i,
  revoked: false,
});

// Four members commit 4/5/2/3 = 14 weighted units against a 10-unit offer;
// prin-bob withdraws before fulfilment (his commitment is revoked), so the
// post-withdrawal set carries alice(4) + cara(2) + dave(3) live.
const commitments: GroupPurchaseCommitment[] = [
  commitment(1, "prin-alice", 4),
  commitment(2, "prin-bob", 5),
  commitment(3, "prin-cara", 2),
  commitment(4, "prin-dave", 3),
];
const afterWithdrawal: GroupPurchaseCommitment[] = [
  commitment(1, "prin-alice", 4),
  { ...commitment(2, "prin-bob", 5), revoked: true },
  commitment(3, "prin-cara", 2),
  commitment(4, "prin-dave", 3),
];

const scenario: Scenario = {
  id: "scen-e2e",
  arms: [
    { strategy: "baseline-status-quo", cost: 100, reliability: 0.9, utilization: 0.4 },
    { strategy: "alt-communal-bundle", cost: 80, reliability: 0.95, utilization: 0.6 },
  ],
  baselineStrategy: "baseline-status-quo",
  selectedStrategy: "alt-communal-bundle",
  confidence: 0.8,
  assumptions: ["price-stable-30d"],
  request,
  offer,
  commitments,
  // Recommendation breadth: one eligible winner, three REJECTED-with-reasons
  // (hard capacity constraint ×2, caller-supplied eligibility ×1).
  recommendation: {
    id: "rec-e2e",
    intent: "intent-e2e",
    kind: "SUBSCRIPTION",
    snapshot: "pinned-provider-listing-fixture",
    baseline: "tier-baseline",
    candidates: [
      {
        id: "tier-baseline",
        kind: "SUBSCRIPTION",
        priceMinorUnits: 3000,
        capacityUnits: 5,
        confidence: 0.9,
        provenance: "unicom-listing:baseline",
        eligibility: { feasible: true, reasons: [] },
        assumptions: ["list-price-verified-30d"],
      },
      {
        id: "tier-communal-10gb",
        kind: "SUBSCRIPTION",
        priceMinorUnits: 2500,
        capacityUnits: 10,
        confidence: 0.85,
        provenance: "unicom-listing:tier-2",
        eligibility: { feasible: true, reasons: [] },
        assumptions: ["group-commitment-required"],
      },
      {
        id: "tier-premium-stale",
        kind: "SUBSCRIPTION",
        priceMinorUnits: 2000,
        capacityUnits: 12,
        confidence: 0.6,
        provenance: "unicom-listing:stale",
        eligibility: { feasible: false, reasons: ["listing expired at snapshot time"] },
        assumptions: [],
      },
      {
        id: "tier-tiny",
        kind: "SUBSCRIPTION",
        priceMinorUnits: 900,
        capacityUnits: 3,
        confidence: 0.7,
        provenance: "unicom-listing:tiny",
        eligibility: { feasible: true, reasons: [] },
        assumptions: [],
      },
    ],
    constraints: { minCapacityUnits: 8 },
  },
  // Org formation flow: founding from the PURSUE verdict with three
  // consenting founders and initial mandates inside the authority scope.
  founding: {
    organization: "org-e2e",
    candidates: [
      { principal: "prin-alice", consent: true, consentRecordedAt: NOW - 5_000 },
      { principal: "prin-bob", consent: true, consentRecordedAt: NOW - 5_000 },
      { principal: "prin-cara", consent: true, consentRecordedAt: NOW - 5_000 },
    ],
    minFounders: 3,
    authorityScope: "group",
    initialMandates: [
      { principal: "prin-alice", scope: "group.purchase", permissions: ["commitment:write"] },
      { principal: "prin-bob", scope: "group", permissions: ["commitment:write", "order:advance"] },
      { principal: "prin-cara", scope: "group.purchase", permissions: ["commitment:write"] },
    ],
  },
  // Allocation flow: the obtained offer is distributed across the committed
  // members at ORDERED, then prin-bob withdraws pre-fulfilment and his units
  // are redistributed under consent caps (one unit becomes an explicit
  // shortfall). The opaque payment reference is evidence only (ADR-0004).
  allocation: {
    orderState: "ORDERED",
    withdrawal: {
      participant: "prin-bob",
      commitments: afterWithdrawal,
      orderState: "ORDERED",
    },
    paymentReference: {
      id: "payref-e2e",
      type: "mobile-money",
      authority: "authorized-psp",
      created: NOW,
      settled: false,
    },
  },
  // Dissolution flow: unanimous active-member consent winds the formed
  // organization down; every commitment gets an explicit disposition —
  // including OUT_OF_AUTHORITY for prin-dave (a committer who is not a
  // member) and ALREADY_CLOSED for prin-bob's revoked commitment.
  dissolution: {
    consents: [
      { principal: "prin-alice", consent: true, recordedAt: NOW },
      { principal: "prin-bob", consent: true, recordedAt: NOW },
      { principal: "prin-cara", consent: true, recordedAt: NOW },
    ],
    maxConsentAgeMs: 60_000,
    commitments: afterWithdrawal,
  },
};

// Two INDEPENDENT inputs: the second run consumes a deep clone taken before
// the first run, so any nondeterminism or input mutation would show up as a
// snapshot difference.
const independentInput: Scenario = structuredClone(scenario);
const run1: ScenarioReport = runScenario(scenario, NOW);
const run2: ScenarioReport = runScenario(independentInput, NOW);

describe("simulation E2E scenario (fixed snapshot, round-2 flows, fully reproducible)", () => {
  it("two independent runs produce identical canonical snapshots (deepEqual + canonical JSON)", () => {
    assert.deepEqual(run2, run1);
    assert.equal(JSON.stringify(run2), JSON.stringify(run1));
  });

  it("the harness never mutates the scenario input (advisory, no side effects)", () => {
    assert.deepEqual(scenario, independentInput);
  });

  it("advisory chain: PURSUE verdict, threshold met, all four participants counted", () => {
    assert.equal(run1.scenarioId, "scen-e2e");
    assert.equal(run1.verdict, "PURSUE");
    assert.equal(run1.opportunity.recommendation, "pursue alt-communal-bundle");
    assert.equal(run1.opportunity.benefit, 20);
    assert.equal(run1.purchaseState, "THRESHOLD_MET");
    assert.equal(run1.thresholdMet, true);
    assert.deepEqual([...run1.participants], ["prin-alice", "prin-bob", "prin-cara", "prin-dave"]);
    assert.equal(run1.evidence.selected.strategy, "alt-communal-bundle");
    assert.equal(run1.evidence.comparison.costDelta, -20);
  });

  it("recommendation breadth: deterministic ranking + eligibility REJECT-with-reasons", () => {
    const report = run1.recommendation;
    assert.ok(report !== undefined, "the scenario carries a recommendation case");
    // Only the communal tier is eligible: the baseline and tiny tiers fail
    // the 8-unit hard capacity constraint, the premium tier fails the
    // caller-supplied eligibility (stale listing).
    assert.deepEqual(
      report.ranked.map((r) => r.candidate),
      ["tier-communal-10gb"],
    );
    assert.equal(report.ranked[0]?.rank, 1);
    assert.equal(report.ranked[0]?.priceMinorUnits, 2500);
    assert.equal(report.ranked[0]?.capacityUnits, 10);
    assert.deepEqual(
      report.rejected.map((r) => r.candidate),
      ["tier-baseline", "tier-premium-stale", "tier-tiny"],
    );
    assert.ok(
      report.rejected
        .find((r) => r.candidate === "tier-baseline")
        ?.reasons.includes("capacity 5 below minimum 8 (hard constraint)"),
    );
    assert.ok(
      report.rejected
        .find((r) => r.candidate === "tier-tiny")
        ?.reasons.includes("capacity 3 below minimum 8 (hard constraint)"),
    );
    assert.ok(
      report.rejected
        .find((r) => r.candidate === "tier-premium-stale")
        ?.reasons.includes("caller-supplied eligibility failed: listing expired at snapshot time"),
    );
    assert.equal(report.policy.ruleVersion, "recommendation-lexicographic-v1");
    assert.equal(report.snapshot, "pinned-provider-listing-fixture");
  });

  it("org formation flow: founding from the PURSUE verdict with consent + initial mandates", () => {
    const founding = run1.founding;
    assert.ok(founding !== undefined, "the scenario carries a founding case");
    assert.equal(founding.state, "FORMED");
    assert.equal(founding.organization, "org-e2e");
    assert.deepEqual([...founding.founders], ["prin-alice", "prin-bob", "prin-cara"]);
    assert.equal(founding.pursuitEvidenceId, "scen-e2e-opportunity");
    assert.deepEqual(
      founding.mandates.map((m) => [m.principal, m.scope]),
      [
        ["prin-alice", "group.purchase"],
        ["prin-bob", "group"],
        ["prin-cara", "group.purchase"],
      ],
    );
    assert.deepEqual(
      founding.memberships.map((m) => [m.principal, m.state, m.role]),
      [
        ["prin-alice", "MEMBER", "founder"],
        ["prin-bob", "MEMBER", "founder"],
        ["prin-cara", "MEMBER", "founder"],
      ],
    );
  });

  it("allocation flow: rounding policy, provenance, withdrawal reallocation with an explicit shortfall", () => {
    const allocation = run1.allocation;
    assert.ok(allocation !== undefined, "the scenario carries an allocation case");
    assert.equal(allocation.state, "COMPUTED");
    assert.equal(allocation.policy.ruleVersion, "group-allocation-largest-remainder-v1");
    assert.equal(allocation.policy.mode, "LARGEST_REMAINDER");
    assert.equal(allocation.policy.consentCap, "COMMITTED_UNITS");

    // Post-withdrawal canonical snapshot (weights 4/2/3 over the 10-unit
    // offer after prin-bob's 5-unit commitment was revoked):
    //   alice 4 units / 10 000 minor, cara 2 / 5 000, dave 3 / 7 500;
    //   bob WITHDRAWN holding his pre-withdrawal 4 units / 10 000;
    //   9 usable units, 22 500 minor chargeable (2 500 unallocated), and
    //   ONE withdrawn unit that could not be reallocated under consent
    //   caps — an explicit shortfall, never silently transferred.
    assert.equal(allocation.totalUnits, 9);
    assert.equal(allocation.totalCostMinorUnits, 22_500);
    assert.equal(allocation.shortfallUnits, 1);
    assert.deepEqual(
      allocation.allocations.map((a) => [
        a.participant,
        a.committedUnits,
        a.units,
        a.costMinorUnits,
        a.status,
      ]),
      [
        ["prin-alice", 4, 4, 10_000, "ALLOCATED"],
        ["prin-cara", 2, 2, 5_000, "ALLOCATED"],
        ["prin-dave", 3, 3, 7_500, "ALLOCATED"],
        ["prin-bob", 5, 4, 10_000, "WITHDRAWN"],
      ],
    );
    // Provenance: every record names the obtained offer and the commitment
    // it is proportional to.
    for (const record of allocation.allocations) {
      assert.equal(record.offer, "gpo-e2e");
      assert.match(record.id, /^gpo-e2e-alloc-prin-/);
      assert.match(record.commitment, /^gpc-e2e-[1-4]$/);
    }
    // The opaque payment reference is carried as evidence only (ADR-0004).
    assert.equal(allocation.paymentReference?.id, "payref-e2e");
    assert.equal(allocation.paymentReference?.settled, false);
    // The explicit-shortfall and unallocated-cost notes are part of the
    // canonical snapshot.
    assert.ok(
      allocation.notes.includes(
        "1 withdrawn units could not be reallocated under consent caps — explicit shortfall, never silently transferred",
      ),
    );
    assert.ok(
      allocation.notes.includes(
        "2500 minor units of cost are unallocated (shortfall units carry no member cost) — never charged silently",
      ),
    );
    assert.ok(
      allocation.notes.includes(
        "participant prin-bob withdrawn before fulfilment: 4 units returned for reallocation",
      ),
    );
  });

  it("dissolution flow: unanimous consent, explicit commitment dispositions, nothing transferred", () => {
    const dissolution = run1.dissolution;
    assert.ok(dissolution !== undefined, "the scenario carries a dissolution case");
    assert.equal(dissolution.applied, true);
    assert.equal(dissolution.state, "DISSOLVED");
    assert.deepEqual(
      dissolution.commitmentDispositions.map((d) => [d.commitment, d.participant, d.disposition]),
      [
        ["gpc-e2e-1", "prin-alice", "MARKED_UNUSABLE"],
        ["gpc-e2e-2", "prin-bob", "ALREADY_CLOSED"],
        ["gpc-e2e-3", "prin-cara", "MARKED_UNUSABLE"],
        ["gpc-e2e-4", "prin-dave", "OUT_OF_AUTHORITY"],
      ],
    );
    // Every membership is closed through the merged machine (REVOKE terminal).
    for (const membership of dissolution.memberships) {
      assert.equal(membership.state, "REVOKED");
      assert.equal(membership.revoked, true);
      assert.equal(membership.revocationReason, "organization dissolved");
    }
  });
});
