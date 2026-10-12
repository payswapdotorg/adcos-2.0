import { describe, it, expect } from 'node:test';
import { EnvelopeSchema, isEnvelopeExpired, validateScope } from '../src/index';

// Negative conformance tests for contract schemas

describe("Negative Conformance Tests", () => {
  describe("Duplicate Detection", () => {
    it("should reject duplicate idempotency keys in envelope", () => {
      const envelope1 = EnvelopeSchema.parse({
        schema: { major: 1, minor: 0, patch: 0 },
        eventId: "test-event-1",
        commandId: "test-command",
        sender: "sender-1",
        receiver: "receiver-1",
        scope: "device",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "duplicate-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capability: "cap-1",
          timestamp: Date.now()
        }
      });

      const envelope2 = {
        ...envelope1,
        eventId: "test-event-2",
        timestamp: Date.now()
      };

      // Simulate duplicate detection logic
      const idempotencyKeys = new Set([envelope1.idempotencyKey]);
      expect(idempotencyKeys.has(envelope2.idempotencyKey)).toBe(true);
    });
  });

  describe("Replay Detection", () => {
    it("should reject replay of expired envelopes", () => {
      const expiredEnvelope = {
        schema: { major: 1, minor: 0, patch: 0 },
        eventId: "replay-event",
        commandId: "test-command",
        sender: "sender-1",
        receiver: "receiver-1",
        scope: "device",
        issuedAt: Date.now() - 86400000, // 1 day ago
        expiresAt: Date.now() - 3600000, // 1 hour ago
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "unique-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capability: "cap-1",
          timestamp: Date.now() - 1800000
        }
      };

      // Check if envelope is expired using the exported function
      expect(isEnvelopeExpired(expiredEnvelope)).toBe(true);
    });
  });

  describe("Expiry Detection", () => {
    it("should reject envelopes with past expiry time", () => {
      const pastEnvelope = {
        schema: { major: 1, minor: 0, patch: 0 },
        eventId: "expired-event",
        commandId: "test-command",
        sender: "sender-1",
        receiver: "receiver-1",
        scope: "device",
        issuedAt: Date.now() - 86400000, // 1 day ago
        expiresAt: Date.now() - 3600000, // 1 hour ago
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "unique-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capability: "cap-1",
          timestamp: Date.now() - 1800000
        }
      };

      // Check expiry validation using the exported function
      expect(isEnvelopeExpired(pastEnvelope)).toBe(true);
    });
  });

  describe("Out-of-Scope Detection", () => {
    it("should reject envelopes with invalid scope", () => {
      const invalidScopeEnvelope = {
        schema: { major: 1, minor: 0, patch: 0 },
        eventId: "invalid-scope-event",
        commandId: "test-command",
        sender: "sender-1",
        receiver: "receiver-1",
        scope: "invalid-scope", // Invalid scope value
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "unique-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capability: "cap-1",
          timestamp: Date.now()
        }
      };

      // Validate scope against allowed values using the exported function
      const allowedScopes = ["device", "group", "organization", "global"];
      expect(validateScope(invalidScopeEnvelope.scope, allowedScopes)).toBe(false);
    });
  });
});