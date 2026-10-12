import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EnvelopeSchema,
  isEnvelopeExpired,
  validateScope,
  createReplayGuard,
  type Envelope,
} from "../src/index.js";

// Negative conformance tests for contract schemas: expiry, duplicate/replay
// and out-of-scope rejection, proven against the real envelope fields.

const baseEnvelope = (overrides: Record<string, unknown> = {}): Envelope =>
  EnvelopeSchema.parse({
    schema: { major: 1, minor: 0, patch: 0 },
    eventId: "evt-1",
    sender: "inst-sender",
    receiver: "inst-receiver",
    scope: "device.forwarding",
    issuedAt: 1_000,
    ...overrides,
  });

describe("Negative conformance (expiry / duplicate / replay / out-of-scope)", () => {
  describe("expiry", () => {
    it("flags envelopes whose expiresAt is in the past", () => {
      const expired = baseEnvelope({ expiresAt: 500 });
      assert.equal(isEnvelopeExpired(expired, 1_000), true);
    });

    it("accepts envelopes whose expiresAt is in the future", () => {
      const live = baseEnvelope({ expiresAt: 2_000 });
      assert.equal(isEnvelopeExpired(live, 1_000), false);
    });

    it("treats envelopes without expiresAt as non-expiring", () => {
      assert.equal(isEnvelopeExpired(baseEnvelope(), 1_000), false);
    });
  });

  describe("duplicate/replay", () => {
    it("accepts the first sighting and rejects duplicates by idempotencyKey", () => {
      const guard = createReplayGuard();
      const first = baseEnvelope({ idempotencyKey: "op-42" });
      const replay = baseEnvelope({ eventId: "evt-2", idempotencyKey: "op-42" });
      assert.equal(guard.check(first), true);
      assert.equal(guard.check(replay), false);
    });

    it("falls back to eventId when no idempotencyKey is present", () => {
      const guard = createReplayGuard();
      assert.equal(guard.check(baseEnvelope()), true);
      assert.equal(guard.check(baseEnvelope()), false);
    });

    it("tracks distinct keys independently", () => {
      const guard = createReplayGuard();
      assert.equal(guard.check(baseEnvelope({ idempotencyKey: "op-a" })), true);
      assert.equal(guard.check(baseEnvelope({ idempotencyKey: "op-b" })), true);
      assert.equal(guard.check(baseEnvelope({ idempotencyKey: "op-a" })), false);
    });

    it("evicts the oldest entries beyond maxEntries (bounded memory)", () => {
      const guard = createReplayGuard({ maxEntries: 2 });
      guard.seen("k1");
      guard.seen("k2");
      guard.seen("k3"); // evicts k1
      assert.equal(guard.size, 2);
      assert.equal(guard.seen("k1"), false); // k1 was evicted → first sight again
      assert.equal(guard.seen("k3"), true); // k3 is still tracked
    });

    it("rejects malformed envelopes before guard-checking them", () => {
      const result = EnvelopeSchema.safeParse({ eventId: 123 });
      assert.equal(result.success, false);
    });
  });

  describe("out-of-scope", () => {
    it("accepts scope values present in the allowed list", () => {
      assert.equal(validateScope("device.forwarding", ["device.forwarding", "org.admin"]), true);
    });

    it("rejects scope values absent from the allowed list", () => {
      assert.equal(validateScope("payment.settle", ["device.forwarding", "org.admin"]), false);
    });

    it("rejects when the allowed list is empty", () => {
      assert.equal(validateScope("device.forwarding", []), false);
    });
  });
});
