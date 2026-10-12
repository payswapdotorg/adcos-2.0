import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateCommitments, allocationTotal } from "../src/contract.js";
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
  threshold: 3,
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

describe("evaluateCommitments", () => {
  it("reaches THRESHOLD_MET when distinct participants cover the threshold", () => {
    const r = evaluateCommitments(
      request,
      offer,
      [commitment(1, "a"), commitment(2, "b"), commitment(3, "c")],
      now,
    );
    assert.equal(r.state, "THRESHOLD_MET");
    assert.equal(r.thresholdMet, true);
    assert.deepEqual([...r.participants].sort(), ["a", "b", "c"]);
    assert.equal(r.committedAllocation, 3);
  });

  it("shortfall yields THRESHOLD_NOT_MET, never FAILED", () => {
    const r = evaluateCommitments(request, offer, [commitment(1, "a")], now);
    assert.equal(r.state, "THRESHOLD_NOT_MET");
    assert.equal(r.thresholdMet, false);
  });

  it("counts duplicate participants once (first accepted wins)", () => {
    const r = evaluateCommitments(
      request,
      offer,
      [commitment(1, "a"), commitment(2, "a"), commitment(3, "b")],
      now,
    );
    assert.equal(r.participants.length, 2);
    assert.ok(r.notes.some((n) => n.includes("duplicate commitment for participant a")));
  });

  it("skips revoked and expired commitments with explicit notes", () => {
    const revoked = { ...commitment(1, "a"), revoked: true };
    const expired = { ...commitment(2, "b"), expiresAt: now - 1 };
    const r = evaluateCommitments(request, offer, [revoked, expired, commitment(3, "c")], now);
    assert.deepEqual([...r.participants], ["c"]);
    assert.ok(r.notes.some((n) => n.includes("revoked")));
    assert.ok(r.notes.some((n) => n.includes("expired")));
  });

  it("an expired request evaluates to EXPIRED regardless of commitments", () => {
    const r = evaluateCommitments(
      request,
      offer,
      [commitment(1, "a"), commitment(2, "b"), commitment(3, "c")],
      request.expiresAt + 1,
    );
    assert.equal(r.state, "EXPIRED");
    assert.equal(r.thresholdMet, false);
    assert.ok(r.notes.some((n) => n.includes("request expired")));
  });

  it("without a bound offer the evaluation stays COMMITMENT_OPEN", () => {
    const r = evaluateCommitments(request, undefined, [commitment(1, "a")], now);
    assert.equal(r.state, "COMMITMENT_OPEN");
    assert.ok(r.notes.some((n) => n.includes("no offer bound yet")));
  });

  it("skips commitments bound to other requests/offers", () => {
    const foreign = { ...commitment(9, "z"), request: "gpr-other" };
    const r = evaluateCommitments(request, offer, [foreign, commitment(1, "a")], now);
    assert.deepEqual([...r.participants], ["a"]);
    assert.ok(r.notes.some((n) => n.includes("not gpr-1")));
  });
});

describe("allocationTotal", () => {
  it("sums the explicit allocation entries", () => {
    assert.equal(allocationTotal({ ...commitment(1, "a"), allocation: { lines: 2, seats: 3 } }), 5);
  });
});
