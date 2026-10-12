import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beginProcessing, recordOutcome, isDeadLettered } from "../src/contract.js";
import type { Message, EventLifecycle } from "@adcos/contracts";

const now = 1_700_000_000_000;

const message = (lifecycle: Partial<EventLifecycle> = {}): Message => ({
  id: "msg-1",
  envelope: {
    schema: { major: 1, minor: 2, patch: 0 },
    eventId: "evt-1",
    sender: "inst-alice",
    receiver: "inst-bob",
    scope: "device.forwarding",
    issuedAt: now - 1000,
  },
  payload: { kind: "forward" },
  lifecycle: {
    state: "PENDING",
    attempts: 0,
    maxRetries: 3,
    ...lifecycle,
  },
  createdAt: now - 1000,
  updatedAt: now - 1000,
});

describe("beginProcessing", () => {
  it("moves PENDING to PROCESSING without consuming the budget", () => {
    const t = beginProcessing(message(), now);
    assert.deepEqual(t, { state: "PROCESSING", attempts: 0, applied: true });
  });

  it("retries FAILED messages within the budget", () => {
    const t = beginProcessing(message({ state: "FAILED", attempts: 1 }), now);
    assert.deepEqual(t, { state: "PROCESSING", attempts: 2, applied: true });
  });

  it("refuses retries once the budget is exhausted", () => {
    const t = beginProcessing(message({ state: "FAILED", attempts: 3 }), now);
    assert.equal(t.applied, false);
    assert.match(t.reason ?? "", /retry budget exhausted/);
  });

  it("blocks retries while reconciliation is required (reconcile-before-retry)", () => {
    const t = beginProcessing(message({ state: "FAILED", attempts: 1 }), now, {
      reconcileRequired: true,
    });
    assert.equal(t.applied, false);
    assert.match(t.reason ?? "", /reconciliation required/);
  });

  it("rejects transitions from terminal states", () => {
    for (const state of ["COMPLETED", "REJECTED", "CANCELLED"] as const) {
      const t = beginProcessing(message({ state }), now);
      assert.equal(t.applied, false);
      assert.match(t.reason ?? "", /terminal/);
    }
  });
});

describe("recordOutcome", () => {
  it("completes from PROCESSING", () => {
    const t = recordOutcome(message({ state: "PROCESSING" }), "COMPLETED", now);
    assert.deepEqual(t, { state: "COMPLETED", attempts: 0, applied: true });
  });

  it("failure consumes the budget and attaches the dead-letter reason at exhaustion", () => {
    const t = recordOutcome(message({ state: "PROCESSING", attempts: 2 }), "FAILED", now);
    assert.equal(t.state, "FAILED");
    assert.equal(t.attempts, 3);
    assert.match(t.deadLetterReason ?? "", /retry budget exhausted/);
  });

  it("rejects outcomes outside PROCESSING", () => {
    const t = recordOutcome(message({ state: "PENDING" }), "COMPLETED", now);
    assert.equal(t.applied, false);
    assert.match(t.reason ?? "", /only be recorded while PROCESSING/);
  });
});

describe("isDeadLettered", () => {
  it("dead-letters exhausted failures", () => {
    assert.equal(isDeadLettered({ state: "FAILED", attempts: 3, maxRetries: 3 }), true);
  });

  it("dead-letters failures pending reconciliation", () => {
    assert.equal(isDeadLettered({ state: "FAILED", attempts: 1, maxRetries: 3 }, true), true);
  });

  it("does not dead-letter in-budget failures without reconciliation", () => {
    assert.equal(isDeadLettered({ state: "FAILED", attempts: 1, maxRetries: 3 }), false);
    assert.equal(isDeadLettered({ state: "PENDING", attempts: 0, maxRetries: 3 }), false);
  });
});
