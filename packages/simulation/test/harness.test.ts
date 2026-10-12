import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runScenario } from "../src/contract.js";
import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
} from "@adcos/contracts";

const now = 1_700_000_000_000;

const request: GroupPurchaseRequest = {
  id: "gpr-1",
  intent: "intent-1",
  organization: "org-1",
  requirements: { product: "data-bundle" },
  participants: ["prin-alice"],
  threshold: 2,
  expiresAt: now + 86_400_000,
};

const offer: GroupPurchaseOffer = {
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

const commitment = (i: number, participant: string): GroupPurchaseCommitment => ({
  id: `gpc-${i}`,
  request: "gpr-1",
  offer: "gpo-1",
  participant,
  allocation: { lines: 1 },
  acceptedAt: now - 1000 + i,
  revoked: false,
});

const scenario = {
  id: "scen-1",
  arms: [
    { strategy: "baseline-status-quo", cost: 100, reliability: 0.9, utilization: 0.4 },
    { strategy: "alt-sharenet", cost: 80, reliability: 0.95, utilization: 0.6 },
  ],
  baselineStrategy: "baseline-status-quo",
  selectedStrategy: "alt-sharenet",
  confidence: 0.8,
  assumptions: ["price-stable-30d"],
  request,
  offer,
  commitments: [commitment(1, "prin-alice"), commitment(2, "prin-bob")],
};

describe("runScenario (shadow harness)", () => {
  it("drives lab → economics → group-purchasing into one advisory report", () => {
    const r = runScenario(scenario, now);
    assert.equal(r.scenarioId, "scen-1");
    assert.equal(r.verdict, "PURSUE");
    assert.equal(r.opportunity.recommendation, "pursue alt-sharenet");
    assert.equal(r.opportunity.benefit, 20);
    assert.equal(r.purchaseState, "THRESHOLD_MET");
    assert.deepEqual([...r.participants], ["prin-alice", "prin-bob"]);
    assert.equal(r.evidence.selected.strategy, "alt-sharenet");
  });

  it("is fully reproducible for a fixed scenario and clock", () => {
    assert.deepEqual(runScenario(scenario, now), runScenario(scenario, now));
  });

  it("keeps the report advisory when the verdict is negative", () => {
    const r = runScenario(
      { ...scenario, confidence: 0.2, commitments: [commitment(1, "prin-alice")] },
      now,
    );
    assert.equal(r.verdict, "REJECT");
    assert.equal(r.purchaseState, "THRESHOLD_NOT_MET");
    assert.match(r.opportunity.recommendation, /do not pursue/);
  });

  it("reflects request expiry end-to-end", () => {
    const r = runScenario(scenario, request.expiresAt + 1);
    assert.equal(r.purchaseState, "EXPIRED");
    assert.equal(r.thresholdMet, false);
  });
});
