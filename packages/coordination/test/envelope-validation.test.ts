import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateEnvelope,
  createEnvelopeReplayGuard,
  type ValidationContext,
} from "../src/contract.js";
import type { Envelope } from "@adcos/contracts";

const now = 1_700_000_000_000;

const ctx = (overrides: Partial<ValidationContext> = {}): ValidationContext => ({
  allowedScopes: ["device.forwarding", "org.admin"],
  currentPolicyEpoch: 10,
  knownSenders: ["inst-alice"],
  requireKnownSender: true,
  maxPayloadDigestLength: 64,
  now,
  ...overrides,
});

const envelope = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: "evt-1",
  sender: "inst-alice",
  receiver: "inst-bob",
  scope: "device.forwarding",
  issuedAt: now - 1000,
  ...overrides,
});

describe("validateEnvelope", () => {
  it("accepts a clean envelope", () => {
    const r = validateEnvelope(envelope(), ctx());
    assert.equal(r.accepted, true);
    assert.deepEqual(r.failures, []);
  });

  it("rejects malformed input with a single MALFORMED failure", () => {
    const r = validateEnvelope({ eventId: 123 }, ctx());
    assert.equal(r.accepted, false);
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].code, "MALFORMED");
  });

  it("rejects expired envelopes (freshness/expiry gate)", () => {
    const r = validateEnvelope(envelope({ expiresAt: now - 1 }), ctx());
    assert.equal(r.accepted, false);
    assert.ok(r.failures.some((f) => f.code === "EXPIRED"));
  });

  it("rejects out-of-scope envelopes", () => {
    const r = validateEnvelope(envelope({ scope: "payment.settle" }), ctx());
    assert.equal(r.accepted, false);
    assert.ok(r.failures.some((f) => f.code === "OUT_OF_SCOPE"));
  });

  it("rejects stale policy epochs", () => {
    const r = validateEnvelope(envelope({ policyEpoch: 9 }), ctx());
    assert.equal(r.accepted, false);
    assert.ok(r.failures.some((f) => f.code === "STALE_POLICY_EPOCH"));
  });

  it("accepts the current policy epoch", () => {
    const r = validateEnvelope(envelope({ policyEpoch: 10 }), ctx());
    assert.equal(r.accepted, true);
  });

  it("fail-closes unknown senders when required", () => {
    const r = validateEnvelope(envelope({ sender: "inst-unknown" }), ctx());
    assert.equal(r.accepted, false);
    assert.ok(r.failures.some((f) => f.code === "UNKNOWN_SENDER"));
  });

  it("permits unknown senders in open-discovery mode (requireKnownSender=false)", () => {
    const r = validateEnvelope(
      envelope({ sender: "inst-unknown" }),
      ctx({ requireKnownSender: false }),
    );
    assert.equal(r.accepted, true);
  });

  it("rejects oversized payload digests (size gate)", () => {
    const r = validateEnvelope(envelope({ payloadDigest: "x".repeat(65) }), ctx());
    assert.equal(r.accepted, false);
    assert.ok(r.failures.some((f) => f.code === "OVERSIZED"));
  });

  it("rejects replays through the caller-owned guard", () => {
    const guard = createEnvelopeReplayGuard();
    const e = envelope({ idempotencyKey: "op-42" });
    assert.equal(validateEnvelope(e, ctx(), guard).accepted, true);
    const replay = validateEnvelope(
      envelope({ eventId: "evt-2", idempotencyKey: "op-42" }),
      ctx(),
      guard,
    );
    assert.equal(replay.accepted, false);
    assert.ok(replay.failures.some((f) => f.code === "REPLAY"));
  });

  it("aggregates multiple failures in order", () => {
    const r = validateEnvelope(
      envelope({ scope: "nope", policyEpoch: 1, sender: "inst-ghost" }),
      ctx(),
    );
    assert.deepEqual(
      r.failures.map((f) => f.code),
      ["OUT_OF_SCOPE", "STALE_POLICY_EPOCH", "UNKNOWN_SENDER"],
    );
  });
});
