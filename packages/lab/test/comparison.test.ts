import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runComparison, asOpportunityEvidence } from "../src/contract.js";

const now = 1_700_000_000_000;

const arms = [
  { strategy: "baseline-status-quo", cost: 100, reliability: 0.9, utilization: 0.4 },
  { strategy: "alt-sharenet", cost: 80, reliability: 0.95, utilization: 0.6 },
];

describe("runComparison", () => {
  it("produces canonical evidence from a fixed snapshot", () => {
    const ev = runComparison({
      id: "lab-1",
      intent: "intent-1",
      baseline: arms[0],
      alternatives: [arms[1]],
      selectedStrategy: "alt-sharenet",
      confidence: 0.8,
      assumptions: ["price-stable-30d"],
      evaluatedAt: now,
    });
    assert.equal(ev.id, "lab-1");
    assert.equal(ev.baseline, "baseline-status-quo");
    assert.deepEqual(ev.alternatives, ["alt-sharenet"]);
    assert.equal(ev.noChange.cost, 100);
    assert.equal(ev.selected.cost, 80);
    assert.equal(ev.selected.confidence, 0.8);
    assert.equal(ev.comparison.costDelta, -20);
    assert.equal(ev.comparison.savingsRatio, 0.2);
    assert.equal(ev.evaluatedAt, now);
  });

  it("is byte-for-byte reproducible for identical inputs", () => {
    const opts = {
      id: "lab-2",
      intent: "intent-1",
      baseline: arms[0],
      alternatives: [arms[1]],
      selectedStrategy: "alt-sharenet",
      confidence: 0.8,
      assumptions: ["price-stable-30d"],
      evaluatedAt: now,
    };
    assert.deepEqual(runComparison(opts), runComparison(opts));
  });

  it("penalizes confidence explicitly when secondary metrics are missing", () => {
    const ev = runComparison({
      id: "lab-3",
      intent: "intent-1",
      baseline: { strategy: "baseline-status-quo", cost: 100 },
      alternatives: [],
      selectedStrategy: "baseline-status-quo",
      confidence: 0.8,
      assumptions: [],
      evaluatedAt: now,
    });
    assert.equal(ev.selected.confidence, 0.6); // 0.8 - 0.1 (reliability) - 0.1 (utilization)
    assert.ok(ev.selected.assumptions.some((a) => a.includes("reliability missing")));
    assert.ok(ev.selected.assumptions.some((a) => a.includes("utilization missing")));
  });

  it("rejects a selected strategy that is not among the arms", () => {
    assert.throws(() =>
      runComparison({
        id: "lab-4",
        intent: "intent-1",
        baseline: arms[0],
        alternatives: [arms[1]],
        selectedStrategy: "alt-unicom",
        confidence: 0.8,
        assumptions: [],
        evaluatedAt: now,
      }),
    );
  });
});

describe("asOpportunityEvidence", () => {
  it("wraps evidence with an explicit recommendation (advisory only)", () => {
    const ev = runComparison({
      id: "lab-5",
      intent: "intent-1",
      baseline: arms[0],
      alternatives: [arms[1]],
      selectedStrategy: "alt-sharenet",
      confidence: 0.8,
      assumptions: [],
      evaluatedAt: now,
    });
    const opp = asOpportunityEvidence(ev, "pursue alt-sharenet", { id: "opp-1", benefit: 20 });
    assert.equal(opp.id, "opp-1");
    assert.equal(opp.recommendation, "pursue alt-sharenet");
    assert.equal(opp.benefit, 20);
    assert.equal(opp.confidence, ev.selected.confidence);
  });
});
