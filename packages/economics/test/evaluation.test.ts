import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateOpportunity,
  summarizeOfferCosts,
  DEFAULT_EVALUATION_POLICY,
} from "../src/contract.js";
import type { LabComparisonEvidence, GroupPurchaseOffer } from "@adcos/contracts";

const now = 1_700_000_000_000;

const baseEvidence: LabComparisonEvidence = {
  id: "lab-1",
  intent: "intent-1",
  baseline: "baseline-status-quo",
  alternatives: ["alt-sharenet"],
  noChange: { cost: 100, reliability: 0.9, utilization: 0.4 },
  selected: {
    strategy: "alt-sharenet",
    cost: 80,
    reliability: 0.95,
    utilization: 0.6,
    confidence: 0.8,
    assumptions: ["price-stable-30d"],
  },
  comparison: { costDelta: -20 },
  evaluatedAt: now,
  expiresAt: now + 604_800_000,
};

const baseOffer: GroupPurchaseOffer = {
  id: "gpo-1",
  request: "gpr-1",
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
  expiry: now + 172_800_000,
  provenance: "unicom-listing",
};

describe("evaluateOpportunity", () => {
  it("PURSUE when confidence, saving and assumptions all clear the policy", () => {
    const r = evaluateOpportunity(baseEvidence);
    assert.equal(r.verdict, "PURSUE");
    assert.equal(r.costDelta, -20);
    assert.equal(r.confidence, 0.8);
    assert.deepEqual(r.reasons, []);
    assert.equal(r.evidenceId, "lab-1");
  });

  it("REJECT with explicit reasons when confidence is below policy", () => {
    const r = evaluateOpportunity(baseEvidence, {
      ...DEFAULT_EVALUATION_POLICY,
      minConfidence: 0.9,
    });
    assert.equal(r.verdict, "REJECT");
    assert.ok(r.reasons.some((x) => x.includes("confidence 0.8 below minimum 0.9")));
  });

  it("REJECT when there is no saving (cost regression)", () => {
    const r = evaluateOpportunity({
      ...baseEvidence,
      selected: { ...baseEvidence.selected, cost: 120 },
    });
    assert.equal(r.verdict, "REJECT");
    assert.ok(r.reasons.some((x) => x.includes("below minimum")));
  });

  it("REJECT on reliability regression beyond tolerance", () => {
    const r = evaluateOpportunity({
      ...baseEvidence,
      selected: { ...baseEvidence.selected, reliability: 0.7 },
    });
    assert.equal(r.verdict, "REJECT");
    assert.ok(r.reasons.some((x) => x.includes("reliability regression")));
  });

  it("INSUFFICIENT_EVIDENCE when policy requires reliability and it is missing", () => {
    const partial: LabComparisonEvidence = {
      ...baseEvidence,
      noChange: { cost: 100 },
      selected: { ...baseEvidence.selected, reliability: undefined },
    };
    const r = evaluateOpportunity(partial, {
      ...DEFAULT_EVALUATION_POLICY,
      requireReliability: true,
    });
    assert.equal(r.verdict, "INSUFFICIENT_EVIDENCE");
  });

  it("is reproducible for a fixed snapshot and policy", () => {
    assert.deepEqual(evaluateOpportunity(baseEvidence), evaluateOpportunity(baseEvidence));
  });

  it("rejects malformed evidence (schema-validated input)", () => {
    assert.throws(() => evaluateOpportunity({ ...baseEvidence, selected: "not-an-object" }));
  });
});

describe("summarizeOfferCosts", () => {
  it("rolls up explicit charges and verifies stated totals", () => {
    const s = summarizeOfferCosts(baseOffer);
    assert.equal(s.oneTimeTotal, 5);
    assert.equal(s.recurringFirstPeriod, 12.5);
    assert.equal(s.perMemberCost, 12.5);
    assert.equal(s.totalsConsistent, true);
    assert.equal(s.totalFirstPeriod, 142.5); // 125 + 5 + 12.5
  });

  it("reports inconsistent stated totals instead of repairing them", () => {
    const s = summarizeOfferCosts({ ...baseOffer, perMemberCost: 15 });
    assert.equal(s.totalsConsistent, false);
  });
});
