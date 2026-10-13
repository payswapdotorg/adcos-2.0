import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMemberAllocations,
  reallocateOnWithdrawal,
  DEFAULT_ROUNDING_POLICY,
  ALLOCATION_RULE_VERSION,
} from "../src/contract.js";
import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  PaymentReference,
} from "@adcos/contracts";

const now = 1_700_000_000_000;

// SYNTHETIC FIXTURE — not provider data. All numbers below are test inputs
// only; nothing here claims a real offer exists (INVARIANTS #6).

const request = (overrides: Partial<GroupPurchaseRequest> = {}): GroupPurchaseRequest => ({
  id: "gpr-1",
  intent: "intent-1",
  organization: "org-1",
  requirements: { product: "data-bundle" },
  participants: [],
  threshold: 2,
  expiresAt: now + 86_400_000,
  ...overrides,
});

const offer = (overrides: Partial<GroupPurchaseOffer> = {}): GroupPurchaseOffer => ({
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
  ...overrides,
});

const commitment = (
  i: number,
  participant: string,
  units: number,
  overrides: Partial<GroupPurchaseCommitment> = {},
): GroupPurchaseCommitment => ({
  id: `gpc-${i}`,
  request: "gpr-1",
  offer: "gpo-1",
  participant,
  allocation: { lines: units },
  acceptedAt: now - 1000 + i,
  revoked: false,
  ...overrides,
});

const paymentReference: PaymentReference = {
  id: "pay-1",
  type: "mobile-money",
  authority: "authorized-psp",
  created: now,
  settled: false,
};

const compute = (
  commitments: GroupPurchaseCommitment[],
  overrides: Partial<Parameters<typeof computeMemberAllocations>[0]> = {},
) =>
  computeMemberAllocations({
    request: request(),
    offer: offer(),
    commitments,
    orderState: "ORDERED",
    now,
    ...overrides,
  });

describe("explicit rounding policy (stated in code, locked by tests)", () => {
  it("declares the versioned largest-remainder rule with consent caps and id-ascending tie-break", () => {
    assert.equal(ALLOCATION_RULE_VERSION, "group-allocation-largest-remainder-v1");
    assert.deepEqual(DEFAULT_ROUNDING_POLICY, {
      ruleVersion: ALLOCATION_RULE_VERSION,
      mode: "LARGEST_REMAINDER",
      tieBreak: "PARTICIPANT_ID_ASC",
      consentCap: "COMMITTED_UNITS",
    });
  });

  it("records the policy on every result", () => {
    const r = compute([commitment(1, "a", 4), commitment(2, "b", 6)]);
    assert.equal(r.policy.ruleVersion, ALLOCATION_RULE_VERSION);
  });
});

describe("computeMemberAllocations (proportional to commitment)", () => {
  it("splits exactly when weights divide the quantity, with exact minor-unit cost shares", () => {
    const r = compute([commitment(1, "a", 4), commitment(2, "b", 3), commitment(3, "c", 3)]);
    assert.equal(r.state, "COMPUTED");
    assert.deepEqual(
      r.allocations.map((x) => [x.participant, x.units, x.costMinorUnits]),
      [
        ["a", 4, 5000],
        ["b", 3, 3750],
        ["c", 3, 3750],
      ],
    );
    assert.equal(r.totalUnits, 10);
    assert.equal(r.totalCostMinorUnits, 12500);
    assert.equal(r.shortfallUnits, 0);
  });

  it("largest remainder with id-ascending tie-break, deterministic under input reordering", () => {
    // W=11, quantity=10: base a=3,b=3,c=2; remainders c=8 > a=b=7 (tie → a first).
    // leftover 2 → c+1, a+1 ⇒ a=4,b=3,c=3.
    const r = compute([commitment(1, "a", 4), commitment(2, "b", 4), commitment(3, "c", 3)]);
    assert.deepEqual(
      r.allocations.map((x) => [x.participant, x.units]),
      [
        ["a", 4],
        ["b", 3],
        ["c", 3],
      ],
    );
    const reordered = compute([
      commitment(3, "c", 3),
      commitment(2, "b", 4),
      commitment(1, "a", 4),
    ]);
    assert.deepEqual(r, reordered);
    assert.deepEqual(
      compute([commitment(1, "a", 4), commitment(2, "b", 4), commitment(3, "c", 3)]),
      r,
    );
  });

  it("per-member records carry offer and commitment provenance", () => {
    const r = compute([commitment(7, "a", 5), commitment(8, "b", 5)]);
    for (const a of r.allocations) {
      assert.equal(a.offer, "gpo-1");
      assert.match(a.commitment, /^gpc-\d+$/);
      assert.equal(a.id, `gpo-1-alloc-${a.participant}`);
      assert.equal(a.status, "ALLOCATED");
      assert.equal(a.committedUnits, 5);
    }
  });

  it("respects the consent cap and reports the unplaced units as an explicit shortfall", () => {
    // quantity 10 over commitments a:1,b:2 → only 3 units placeable under caps.
    const r = compute([commitment(1, "a", 1), commitment(2, "b", 2)]);
    assert.equal(r.state, "COMPUTED");
    assert.deepEqual(
      r.allocations.map((x) => [x.participant, x.units, x.costMinorUnits]),
      [
        ["a", 1, 1250],
        ["b", 2, 2500],
      ],
    );
    assert.equal(r.totalUnits, 3);
    assert.equal(r.shortfallUnits, 7);
    assert.ok(r.notes.some((n) => n.includes("7 units could not be placed under consent caps")));
    // Unallocated units carry no member cost; the remainder is explicit.
    assert.equal(r.totalCostMinorUnits, 3750);
    assert.ok(r.notes.some((n) => n.includes("minor units of cost are unallocated")));
  });

  it("counts duplicate participants once — first accepted commitment wins", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "a", 9), commitment(3, "b", 5)]);
    const a = r.allocations.find((x) => x.participant === "a");
    assert.equal(a?.commitment, "gpc-1");
    assert.equal(a?.committedUnits, 5);
    assert.ok(r.notes.some((n) => n.includes("duplicate commitment for participant a")));
  });

  it("requires a placed order — pre-order states are rejected", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5)], {
      orderState: "THRESHOLD_MET",
    });
    assert.equal(r.state, "REJECTED");
    assert.ok(r.notes.some((n) => n.includes("requires a placed order")));
  });

  it("rejects offers whose money is not exact in integer minor units", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5)], {
      offer: offer({ totalCost: 125.005 }),
    });
    assert.equal(r.state, "REJECTED");
    assert.ok(r.notes.some((n) => n.includes("integer minor units")));
  });

  it("rejects offers with inconsistent stated totals — never silently repaired", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5)], {
      offer: offer({ perMemberCost: 13 }),
    });
    assert.equal(r.state, "REJECTED");
    assert.ok(r.notes.some((n) => n.includes("inconsistent")));
  });

  it("rejects an offer that does not reference the request", () => {
    const r = compute([commitment(1, "a", 5)], {
      offer: offer({ request: "gpr-other" }),
    });
    assert.equal(r.state, "REJECTED");
    assert.ok(r.notes.some((n) => n.includes("does not reference request")));
  });

  it("expired commitments are skipped with notes and the threshold is re-checked", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5, { expiresAt: now - 1 })]);
    assert.equal(r.state, "UNUSABLE_SHORTFALL");
    assert.ok(r.notes.some((n) => n.includes("expired")));
    assert.ok(r.notes.some((n) => n.includes("threshold not met")));
    assert.equal(r.shortfallUnits, 10);
  });

  it("offer expiry makes the whole allocation UNUSABLE_EXPIRED, never transferred", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5)], {
      now: offer().expiry + 1,
    });
    assert.equal(r.state, "UNUSABLE_EXPIRED");
    assert.ok(r.notes.some((n) => n.includes("offer expired")));
    assert.equal(r.totalUnits, 0);
  });

  it("request expiry (merged evaluateCommitments semantics) makes allocations unusable", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5)], {
      now: request().expiresAt + 1,
    });
    assert.equal(r.state, "UNUSABLE_EXPIRED");
    assert.ok(r.notes.some((n) => n.includes("request expired")));
    assert.ok(r.notes.some((n) => n.includes("never silently transferred")));
  });

  it("below-threshold groups never receive allocations", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5)], {
      request: request({ threshold: 3 }),
    });
    assert.equal(r.state, "UNUSABLE_SHORTFALL");
    assert.ok(r.allocations.every((a) => a.status === "UNUSABLE_SHORTFALL"));
    assert.ok(r.allocations.every((a) => a.units === 0));
  });

  it("records the opaque payment reference as evidence only (ADR-0004)", () => {
    const r = compute([commitment(1, "a", 5), commitment(2, "b", 5)], {
      paymentReference,
    });
    assert.deepEqual(r.paymentReference, paymentReference);
  });
});

describe("reallocateOnWithdrawal (before fulfilment)", () => {
  const baseScenario = () =>
    compute([commitment(1, "a", 6), commitment(2, "b", 6), commitment(3, "c", 6)]);

  it("redistributes the withdrawn units among remaining members under consent caps", () => {
    // Initial: a=4,b=3,c=3 (largest remainder, tie a<b<c). Withdraw a ⇒ 4 units
    // return; b,c each have 3 headroom ⇒ b+2, c+2 ⇒ b=5, c=5.
    const previous = baseScenario();
    assert.deepEqual(
      previous.allocations.map((x) => [x.participant, x.units]),
      [
        ["a", 4],
        ["b", 3],
        ["c", 3],
      ],
    );
    const r = reallocateOnWithdrawal(previous, {
      request: request(),
      offer: offer(),
      commitments: [commitment(2, "b", 6), commitment(3, "c", 6)],
      withdrawParticipant: "a",
      orderState: "ORDERED",
      now,
    });
    assert.equal(r.state, "COMPUTED");
    const a = r.allocations.find((x) => x.participant === "a");
    assert.equal(a?.status, "WITHDRAWN");
    assert.deepEqual(
      r.allocations
        .filter((x) => x.status === "ALLOCATED")
        .map((x) => [x.participant, x.units, x.costMinorUnits]),
      [
        ["b", 5, 6250],
        ["c", 5, 6250],
      ],
    );
    assert.equal(r.totalUnits, 10);
    assert.equal(r.totalCostMinorUnits, 12500);
    assert.equal(r.shortfallUnits, 0);
    assert.ok(r.notes.some((n) => n.includes("withdrawn before fulfilment: 4 units")));
  });

  it("partial headroom leaves an explicit shortfall — never silently transferred", () => {
    // quantity 5, commitments a:2,b:2,c:2 ⇒ a=2,b=2,c=1. Withdraw a (2 units):
    // b has no headroom, c has 1 ⇒ c+1, 1 unit unplaceable.
    const previous = compute(
      [commitment(1, "a", 2), commitment(2, "b", 2), commitment(3, "c", 2)],
      { offer: offer({ quantity: 5, totalCost: 62.5, perMemberCost: 12.5 }) },
    );
    assert.deepEqual(
      previous.allocations.map((x) => [x.participant, x.units]),
      [
        ["a", 2],
        ["b", 2],
        ["c", 1],
      ],
    );
    const r = reallocateOnWithdrawal(previous, {
      request: request(),
      offer: offer({ quantity: 5, totalCost: 62.5, perMemberCost: 12.5 }),
      commitments: [commitment(2, "b", 2), commitment(3, "c", 2)],
      withdrawParticipant: "a",
      orderState: "ORDERED",
      now,
    });
    assert.equal(r.state, "COMPUTED");
    assert.equal(r.totalUnits, 4);
    assert.equal(r.shortfallUnits, 1);
    assert.ok(r.notes.some((n) => n.includes("1 withdrawn units could not be reallocated")));
    // Conservation: usable 4 + shortfall 1 == quantity 5.
    assert.equal(r.totalUnits + r.shortfallUnits, 5);
  });

  it("a withdrawal that drops below threshold makes remaining allocations UNUSABLE_SHORTFALL", () => {
    const previous = compute(
      [commitment(1, "a", 4), commitment(2, "b", 3), commitment(3, "c", 3)],
      { request: request({ threshold: 3 }) },
    );
    const r = reallocateOnWithdrawal(previous, {
      request: request({ threshold: 3 }),
      offer: offer(),
      commitments: [commitment(1, "a", 4), commitment(2, "b", 3)],
      withdrawParticipant: "c",
      orderState: "ORDERED",
      now,
    });
    assert.equal(r.state, "UNUSABLE_SHORTFALL");
    assert.equal(r.totalUnits, 0);
    assert.equal(r.shortfallUnits, 3);
    assert.ok(
      r.allocations
        .filter((x) => x.participant !== "c")
        .every((x) => x.status === "UNUSABLE_SHORTFALL"),
    );
    assert.equal(r.allocations.find((x) => x.participant === "c")?.status, "WITHDRAWN");
  });

  it("rejects withdrawal at/after fulfilment — dispute/refund terms own that path", () => {
    const r = reallocateOnWithdrawal(baseScenario(), {
      request: request(),
      offer: offer(),
      commitments: [commitment(2, "b", 6), commitment(3, "c", 6)],
      withdrawParticipant: "a",
      orderState: "FULFILLED",
      now,
    });
    assert.equal(r.state, "REJECTED");
    assert.ok(r.notes.some((n) => n.includes("only before fulfilment")));
  });

  it("rejects withdrawal while the participant still holds a live commitment", () => {
    const r = reallocateOnWithdrawal(baseScenario(), {
      request: request(),
      offer: offer(),
      commitments: [commitment(1, "a", 6), commitment(2, "b", 6), commitment(3, "c", 6)],
      withdrawParticipant: "a",
      orderState: "ORDERED",
      now,
    });
    assert.equal(r.state, "REJECTED");
    assert.ok(r.notes.some((n) => n.includes("still holds a live commitment")));
  });

  it("withdrawal does not apply to a non-COMPUTED allocation set", () => {
    const expired = compute([commitment(1, "a", 5)], {
      now: offer().expiry + 1,
    });
    const r = reallocateOnWithdrawal(expired, {
      request: request(),
      offer: offer(),
      commitments: [],
      withdrawParticipant: "a",
      orderState: "ORDERED",
      now: offer().expiry + 1,
    });
    assert.equal(r.state, "UNUSABLE_EXPIRED");
    assert.ok(r.notes.some((n) => n.includes("withdrawal does not apply")));
  });

  it("expiry at withdrawal time makes everything UNUSABLE_EXPIRED", () => {
    const r = reallocateOnWithdrawal(baseScenario(), {
      request: request(),
      offer: offer(),
      commitments: [commitment(2, "b", 6), commitment(3, "c", 6)],
      withdrawParticipant: "a",
      orderState: "ORDERED",
      now: offer().expiry + 1,
    });
    assert.equal(r.state, "UNUSABLE_EXPIRED");
    assert.ok(
      r.allocations
        .filter((x) => x.participant !== "a")
        .every((x) => x.status === "UNUSABLE_EXPIRED"),
    );
  });

  it("unknown participants change nothing", () => {
    const previous = baseScenario();
    const r = reallocateOnWithdrawal(previous, {
      request: request(),
      offer: offer(),
      commitments: [commitment(2, "b", 6), commitment(3, "c", 6)],
      withdrawParticipant: "zz",
      orderState: "ORDERED",
      now,
    });
    assert.equal(r.state, "COMPUTED");
    assert.deepEqual(r.allocations, previous.allocations);
    assert.ok(r.notes.some((n) => n.includes("holds no allocation")));
  });
});
