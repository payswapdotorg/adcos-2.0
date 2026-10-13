import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rankCandidates,
  DEFAULT_RANKING_POLICY,
  RECOMMENDATION_RULE_VERSION,
} from "../src/contract.js";
import type { RecommendationCandidate, RankingPolicy } from "../src/contract.js";

// SYNTHETIC FIXTURES — clearly labeled, not provider data (INVARIANTS #6).
// Every candidate below is a made-up test input; no real offer is implied.

const now = 1_700_000_000_000;

const candidate = (overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate => ({
  id: "cand",
  kind: "SUBSCRIPTION",
  priceMinorUnits: 5000,
  capacityUnits: 10,
  confidence: 0.8,
  provenance: "synthetic-fixture:test-set-1",
  eligibility: { feasible: true, reasons: [] },
  assumptions: ["fixture-price-stable"],
  ...overrides,
});

const options = (
  candidates: RecommendationCandidate[],
  overrides: Partial<Parameters<typeof rankCandidates>[0]> = {},
) => ({
  id: "rec-1",
  intent: "intent-1",
  kind: "SUBSCRIPTION" as const,
  snapshot: "synthetic-fixture:test-set-1",
  baseline: "current-plan",
  candidates,
  evaluatedAt: now,
  ...overrides,
});

const subscriptionSet = (): RecommendationCandidate[] => [
  candidate({ id: "current-plan", priceMinorUnits: 5000, capacityUnits: 10, confidence: 0.9 }),
  candidate({ id: "plan-l", priceMinorUnits: 3000, capacityUnits: 5, confidence: 0.7 }),
  candidate({ id: "plan-xl", priceMinorUnits: 8000, capacityUnits: 20, confidence: 0.75 }),
];

describe("rankCandidates (multi-candidate recommendation breadth)", () => {
  it("ranks N candidates with explicit criteria; price-vs-capacity surfaces as structured evidence", () => {
    const r = rankCandidates(options(subscriptionSet()));
    // PRICE_PER_CAPACITY_ASC: plan-xl 400 < current-plan 500 < plan-l 600
    // (minor units per capacity; the evidence field is the milli scale).
    assert.deepEqual(
      r.ranked.map((x) => [x.rank, x.candidate, x.tradeOff.pricePerCapacityMilli]),
      [
        [1, "plan-xl", 400000],
        [2, "current-plan", 500000],
        [3, "plan-l", 600000],
      ],
    );
    // plan-l is cheapest by price but worst value — the trade-off is explicit.
    const xl = r.ranked.find((x) => x.candidate === "plan-xl");
    assert.deepEqual(xl?.vsBaseline, {
      priceDeltaMinorUnits: 3000,
      capacityDeltaUnits: 10,
      pricePerCapacityDeltaMilli: -100000,
    });
    assert.equal(r.baseline, "current-plan");
    assert.deepEqual(r.rejected, []);
    assert.equal(r.kind, "SUBSCRIPTION");
    assert.equal(r.snapshot, "synthetic-fixture:test-set-1");
    assert.equal(r.evaluatedAt, now);
  });

  it("carries provenance verbatim — never invents provider data", () => {
    const r = rankCandidates(options(subscriptionSet()));
    for (const x of r.ranked) {
      assert.equal(x.provenance, "synthetic-fixture:test-set-1");
    }
    assert.equal(
      r.ranked.find((x) => x.candidate === "plan-xl")?.assumptions[0],
      "fixture-price-stable",
    );
  });

  it("rejects infeasible candidates WITH reasons — never silently drops them", () => {
    const set = [
      ...subscriptionSet(),
      candidate({
        id: "plan-foreign-region",
        eligibility: { feasible: false, reasons: ["not offered in region GH"] },
      }),
      candidate({ id: "plan-below-min", capacityUnits: 4 }),
      candidate({ id: "plan-over-budget", priceMinorUnits: 9001 }),
      candidate({ id: "plan-bad-price", priceMinorUnits: 12.5 }),
      candidate({ id: "sim-extra", kind: "SIM" }),
    ];
    const r = rankCandidates(
      options(set, {
        constraints: {
          minCapacityUnits: 5,
          maxPriceMinorUnits: 9000,
          requiredKind: "SUBSCRIPTION",
        },
      }),
    );
    // Conservation: every candidate appears exactly once.
    assert.equal(r.ranked.length + r.rejected.length, set.length);
    assert.deepEqual(
      r.rejected.map((x) => x.candidate),
      ["plan-bad-price", "plan-below-min", "plan-foreign-region", "plan-over-budget", "sim-extra"],
    );
    const foreign = r.rejected.find((x) => x.candidate === "plan-foreign-region");
    assert.deepEqual(foreign?.reasons, [
      "caller-supplied eligibility failed: not offered in region GH",
    ]);
    assert.ok(
      r.rejected
        .find((x) => x.candidate === "plan-below-min")
        ?.reasons.some((x) => x.includes("below minimum 5 (hard constraint)")),
    );
    assert.ok(
      r.rejected
        .find((x) => x.candidate === "plan-over-budget")
        ?.reasons.some((x) => x.includes("above budget cap 9000 (hard constraint)")),
    );
    assert.ok(
      r.rejected
        .find((x) => x.candidate === "plan-bad-price")
        ?.reasons.some((x) => x.includes("integer >= 0")),
    );
    assert.ok(
      r.rejected
        .find((x) => x.candidate === "sim-extra")
        ?.reasons.some((x) => x.includes("does not match the recommendation case SUBSCRIPTION")),
    );
  });

  it("is deterministic for a fixed snapshot and invariant under input reordering", () => {
    const a = rankCandidates(options(subscriptionSet()));
    assert.deepEqual(a, rankCandidates(options(subscriptionSet())));
    const shuffled = [...subscriptionSet()].reverse();
    const b = rankCandidates(options(shuffled));
    assert.deepEqual(a, b);
  });

  it("exact rational ordering beats the rounded milli display", () => {
    // 1000/3 = 333.3̄  and 333333/1000 = 333.333 both floor to 333333 milli,
    // but 333333/1000 < 1000/3 exactly (999999 < 1000000 on cross products).
    const r = rankCandidates(
      options([
        candidate({ id: "current-plan", priceMinorUnits: 1000, capacityUnits: 3 }),
        candidate({ id: "rational-a", priceMinorUnits: 333333, capacityUnits: 1000 }),
        candidate({ id: "rational-b", priceMinorUnits: 1000, capacityUnits: 3 }),
      ]),
    );
    assert.deepEqual(
      r.ranked.map((x) => [x.candidate, x.tradeOff.pricePerCapacityMilli]),
      [
        ["rational-a", 333333],
        ["current-plan", 333333],
        ["rational-b", 333333],
      ],
    );
  });

  it("breaks exact ties by ascending candidate id", () => {
    const r = rankCandidates(
      options([
        candidate({ id: "current-plan", priceMinorUnits: 4000, capacityUnits: 8 }),
        candidate({ id: "beta", priceMinorUnits: 4000, capacityUnits: 8 }),
        candidate({ id: "alpha", priceMinorUnits: 4000, capacityUnits: 8 }),
      ]),
    );
    assert.deepEqual(
      r.ranked.map((x) => x.candidate),
      ["alpha", "beta", "current-plan"],
    );
  });

  it("applies caller-declared criteria lexicographically (no hidden weights)", () => {
    const policy: RankingPolicy = {
      ruleVersion: RECOMMENDATION_RULE_VERSION,
      criteria: ["CONFIDENCE_DESC", "PRICE_ASC"],
      tieBreak: "CANDIDATE_ID_ASC",
    };
    const r = rankCandidates(
      options(
        [
          candidate({
            id: "current-plan",
            priceMinorUnits: 5000,
            capacityUnits: 10,
            confidence: 0.9,
          }),
          candidate({
            id: "cheap-low-conf",
            priceMinorUnits: 1000,
            capacityUnits: 10,
            confidence: 0.5,
          }),
          candidate({ id: "mid-conf", priceMinorUnits: 6000, capacityUnits: 10, confidence: 0.7 }),
        ],
        { policy },
      ),
    );
    assert.deepEqual(
      r.ranked.map((x) => x.candidate),
      ["current-plan", "mid-conf", "cheap-low-conf"],
    );
    assert.equal(r.policy.ruleVersion, RECOMMENDATION_RULE_VERSION);
  });

  it("declares the default policy explicitly (stated in code, locked by tests)", () => {
    assert.equal(RECOMMENDATION_RULE_VERSION, "recommendation-lexicographic-v1");
    assert.deepEqual(DEFAULT_RANKING_POLICY, {
      ruleVersion: RECOMMENDATION_RULE_VERSION,
      criteria: ["PRICE_PER_CAPACITY_ASC", "PRICE_ASC", "CAPACITY_DESC"],
      tieBreak: "CANDIDATE_ID_ASC",
    });
  });

  it("a rejected baseline stays visible while others rank against it", () => {
    const r = rankCandidates(
      options([
        candidate({
          id: "current-plan",
          capacityUnits: 3,
          eligibility: { feasible: false, reasons: ["status quo under review"] },
        }),
        candidate({ id: "plan-xl", priceMinorUnits: 8000, capacityUnits: 20 }),
      ]),
    );
    assert.deepEqual(
      r.rejected.map((x) => x.candidate),
      ["current-plan"],
    );
    assert.equal(r.ranked.length, 1);
    // vsBaseline deltas are still computed from the (rejected) baseline record.
    assert.equal(r.ranked[0].vsBaseline.capacityDeltaUnits, 17);
  });

  it("supports SIM and EQUIPMENT cases with the same machinery", () => {
    const sim = rankCandidates(
      options(
        [
          candidate({ id: "current-plan", kind: "SIM", priceMinorUnits: 2000, capacityUnits: 5 }),
          candidate({ id: "sim-dual", kind: "SIM", priceMinorUnits: 3000, capacityUnits: 12 }),
        ],
        { kind: "SIM" },
      ),
    );
    assert.equal(sim.kind, "SIM");
    assert.deepEqual(
      sim.ranked.map((x) => x.candidate),
      ["sim-dual", "current-plan"],
    );

    const equipment = rankCandidates(
      options(
        [
          candidate({
            id: "current-plan",
            kind: "EQUIPMENT",
            priceMinorUnits: 90000,
            capacityUnits: 1,
          }),
          candidate({
            id: "router-pro",
            kind: "EQUIPMENT",
            priceMinorUnits: 150000,
            capacityUnits: 4,
          }),
        ],
        { kind: "EQUIPMENT" },
      ),
    );
    assert.equal(equipment.kind, "EQUIPMENT");
    assert.equal(equipment.ranked[0].candidate, "router-pro");
  });

  it("fails closed on a missing baseline or duplicate candidate ids", () => {
    assert.throws(
      () => rankCandidates(options([candidate({ id: "lonely" })])),
      /baseline candidate 'current-plan' is not among the candidates/,
    );
    assert.throws(
      () =>
        rankCandidates(
          options([candidate({ id: "current-plan" }), candidate({ id: "current-plan" })]),
        ),
      /duplicate candidate id 'current-plan'/,
    );
  });
});
