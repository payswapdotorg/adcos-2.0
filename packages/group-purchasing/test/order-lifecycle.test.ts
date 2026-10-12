import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { advanceOrder, refundAdmissible } from "../src/contract.js";
import type { PaymentReference } from "@adcos/contracts";

const now = 1_700_000_000_000;

const paymentRef: PaymentReference = {
  id: "pay-1",
  type: "mobile-money",
  authority: "authorized-psp",
  created: now,
  settled: false,
};

const guards = (
  overrides: Partial<{
    authorizationGranted: boolean;
    paymentReference?: PaymentReference;
    usageEvidenceComplete: boolean;
  }> = {},
) => ({
  authorizationGranted: false,
  usageEvidenceComplete: false,
  ...overrides,
});

describe("advanceOrder (order lifecycle)", () => {
  it("walks the golden path: THRESHOLD_MET → … → RECONCILED", () => {
    assert.deepEqual(
      advanceOrder("THRESHOLD_MET", "AUTHORIZE", guards({ authorizationGranted: true })),
      { state: "AUTHORIZED", applied: true },
    );
    assert.deepEqual(
      advanceOrder("AUTHORIZED", "PLACE_ORDER", guards({ paymentReference: paymentRef })),
      { state: "ORDERED", applied: true },
    );
    assert.deepEqual(advanceOrder("ORDERED", "CONFIRM_CONTRACT", guards()), {
      state: "CONTRACTED",
      applied: true,
    });
    assert.deepEqual(advanceOrder("CONTRACTED", "MARK_FULFILLED", guards()), {
      state: "FULFILLED",
      applied: true,
    });
    assert.deepEqual(
      advanceOrder("FULFILLED", "RECONCILE", guards({ usageEvidenceComplete: true })),
      { state: "RECONCILED", applied: true },
    );
  });

  it("blocks AUTHORIZE without granted authorization", () => {
    const r = advanceOrder("THRESHOLD_MET", "AUTHORIZE", guards());
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /authorization not granted/);
  });

  it("blocks PLACE_ORDER without an opaque payment reference (ADR-0004)", () => {
    const r = advanceOrder("AUTHORIZED", "PLACE_ORDER", guards());
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /payment reference required/);
  });

  it("blocks RECONCILE without complete usage evidence", () => {
    const r = advanceOrder("FULFILLED", "RECONCILE", guards());
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /usage evidence incomplete/);
  });

  it("handles fulfillment failure and re-order", () => {
    assert.deepEqual(advanceOrder("CONTRACTED", "REPORT_FULFILLMENT_FAILURE", guards()), {
      state: "FULFILLMENT_FAILED",
      applied: true,
    });
    assert.deepEqual(
      advanceOrder("FULFILLMENT_FAILED", "PLACE_ORDER", guards({ paymentReference: paymentRef })),
      { state: "ORDERED", applied: true },
    );
  });

  it("handles disputes and dispute resolution through reconciliation", () => {
    assert.deepEqual(advanceOrder("FULFILLED", "OPEN_DISPUTE", guards()), {
      state: "DISPUTED",
      applied: true,
    });
    assert.deepEqual(
      advanceOrder("DISPUTED", "RECONCILE", guards({ usageEvidenceComplete: true })),
      { state: "RECONCILED", applied: true },
    );
  });

  it("cancels pre-order states only; withdrawal from the open phase", () => {
    assert.deepEqual(advanceOrder("THRESHOLD_MET", "CANCEL", guards()), {
      state: "CANCELLED",
      applied: true,
    });
    assert.deepEqual(advanceOrder("COMMITMENT_OPEN", "WITHDRAW", guards()), {
      state: "WITHDRAWN",
      applied: true,
    });
    const late = advanceOrder("ORDERED", "CANCEL", guards());
    // ORDERED may cancel per the table (supplier cancellation path)
    assert.deepEqual(late, { state: "CANCELLED", applied: true });
    const tooLate = advanceOrder("CONTRACTED", "CANCEL", guards());
    assert.equal(tooLate.applied, false);
  });

  it("rejects events illegal in the current state", () => {
    const r = advanceOrder("DISCOVERED", "PLACE_ORDER", guards({ paymentReference: paymentRef }));
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /not legal in state DISCOVERED/);
  });

  it("terminal states admit nothing", () => {
    for (const state of ["RECONCILED", "WITHDRAWN", "CANCELLED"] as const) {
      const r = advanceOrder(state, "AUTHORIZE", guards({ authorizationGranted: true }));
      assert.equal(r.applied, false);
      assert.match(r.reason ?? "", /terminal/);
    }
  });
});

describe("refundAdmissible", () => {
  it("admits refunds only in failure/dispute/cancelled states", () => {
    assert.equal(refundAdmissible("FULFILLMENT_FAILED"), true);
    assert.equal(refundAdmissible("DISPUTED"), true);
    assert.equal(refundAdmissible("CANCELLED"), true);
    assert.equal(refundAdmissible("FULFILLED"), false);
    assert.equal(refundAdmissible("RECONCILED"), false);
    assert.equal(refundAdmissible("ORDERED"), false);
  });
});
