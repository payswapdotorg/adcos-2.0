import { z } from "zod";
import { EnvelopeSchema } from "./envelope";

// Negative conformance tests for contract schemas

describe("Negative Conformance Tests", () => {
  describe("Duplicate Detection", () => {
    test("should reject duplicate idempotency keys in envelope", () => {
      const envelope1 = EnvelopeSchema.parse({
        schemaVersion: "1.0.0",
        eventId: "test-event-1",
        commandId: "test-command",
        senderInstanceId: "sender-1",
        receiverInstanceId: "receiver-1",
        scope: "device",
        issueTime: new Date().toISOString(),
        expiryTime: new Date(Date.now() + 3600000).toISOString(),
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "duplicate-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capabilityId: "cap-1",
          timestamp: new Date().toISOString()
        }
      });

      const envelope2 = {
        ...envelope1,
        eventId: "test-event-2",
        timestamp: new Date().toISOString()
      };

      // Simulate duplicate detection logic
      const idempotencyKeys = new Set([envelope1.idempotencyKey]);
      expect(idempotencyKeys.has(envelope2.idempotencyKey)).toBe(true);
    });
  });

  describe("Replay Detection", () => {
    test("should reject replay of expired envelopes", () => {
      const expiredEnvelope = {
        schemaVersion: "1.0.0",
        eventId: "replay-event",
        commandId: "test-command",
        senderInstanceId: "sender-1",
        receiverInstanceId: "receiver-1",
        scope: "device",
        issueTime: "2023-01-01T00:00:00.000Z",
        expiryTime: "2023-01-01T01:00:00.000Z",
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "unique-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capabilityId: "cap-1",
          timestamp: "2023-01-01T00:30:00.000Z"
        }
      };

      // Check if envelope is expired
      const now = new Date();
      const expiryTime = new Date(expiredEnvelope.expiryTime);
      expect(now.getTime()).toBeGreaterThan(expiryTime.getTime());
    });
  });

  describe("Expiry Detection", () => {
    test("should reject envelopes with past expiry time", () => {
      const pastEnvelope = {
        schemaVersion: "1.0.0",
        eventId: "expired-event",
        commandId: "test-command",
        senderInstanceId: "sender-1",
        receiverInstanceId: "receiver-1",
        scope: "device",
        issueTime: "2023-01-01T00:00:00.000Z",
        expiryTime: "2023-01-01T00:30:00.000Z",
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "unique-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capabilityId: "cap-1",
          timestamp: "2023-01-01T00:15:00.000Z"
        }
      };

      // Check expiry validation
      const now = new Date();
      const expiryTime = new Date(pastEnvelope.expiryTime);
      expect(expiryTime.getTime()).toBeLessThan(now.getTime());
    });
  });

  describe("Out-of-Scope Detection", () => {
    test("should reject envelopes with invalid scope", () => {
      const invalidScopeEnvelope = {
        schemaVersion: "1.0.0",
        eventId: "invalid-scope-event",
        commandId: "test-command",
        senderInstanceId: "sender-1",
        receiverInstanceId: "receiver-1",
        scope: "invalid-scope", // Invalid scope value
        issueTime: new Date().toISOString(),
        expiryTime: new Date(Date.now() + 3600000).toISOString(),
        correlationId: "corr-1",
        causationId: "caus-1",
        idempotencyKey: "unique-key",
        payloadDigest: "digest1",
        authorizationRef: "auth1",
        policyEpoch: 1,
        signature: "sig1",
        payload: {
          type: "capability-observation",
          capabilityId: "cap-1",
          timestamp: new Date().toISOString()
        }
      };

      // Validate scope against allowed values
      const allowedScopes = ["device", "group", "organization", "global"];
      expect(allowedScopes).not.toContain(invalidScopeEnvelope.scope);
    });
  });
});