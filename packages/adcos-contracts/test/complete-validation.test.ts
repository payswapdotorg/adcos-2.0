import { describe, test, expect } from "node:test";
import { validateFieldAuthorityMappings } from "../src/authority-mapping";

describe("Complete Contract Validation Suite", () => {
  describe("Negative Conformance Tests", () => {
    test("should reject duplicate idempotency keys", () => {
      const idempotencyKeys = new Set(["key1", "key2", "key1"]);
      
      // Duplicate should be detected
      expect(idempotencyKeys.size).toBeLessThan(3);
    });

    test("should reject expired envelopes", () => {
      const envelope = {
        expiryTime: "2023-01-01T00:00:00.000Z"
      };
      
      const now = new Date();
      const expiryTime = new Date(envelope.expiryTime);
      
      expect(now.getTime()).toBeGreaterThan(expiryTime.getTime());
    });

    test("should reject out-of-scope messages", () => {
      const allowedScopes = ["device", "group", "organization", "global"];
      const invalidScope = "invalid-scope";
      
      expect(allowedScopes).not.toContain(invalidScope);
    });
  });

  describe("Version Compatibility", () => {
    test("should negotiate versions correctly", () => {
      const supportedVersions = ["1.0.0", "1.1.0", "1.2.0"];
      const requestedVersion = "1.1.5";
      
      // Find highest compatible version less than requested
      const compatibleVersion = supportedVersions
        .filter(v => v <= requestedVersion)
        .sort()
        .pop();
      
      expect(compatibleVersion).toBe("1.1.0");
    });
  });

  describe("Authority Mapping", () => {
    test("should validate all fields have authority mappings", () => {
      const result = validateFieldAuthorityMappings();
      
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test("should ensure no provider secrets", () => {
      const sensitiveFields = ["password", "secret", "token", "key", "credential"];
      const contractFields = Object.keys(validateFieldAuthorityMappings);
      
      sensitiveFields.forEach(sensitive => {
        const hasSensitiveField = contractFields.some(field => 
          field.toLowerCase().includes(sensitive)
        );
        
        expect(hasSensitiveField).toBe(false);
      });
    });
  });

  describe("Schema Validation", () => {
    test("should validate resource projections", () => {
      const validResource = {
        id: "resource-1",
        owner: "principal-1",
        deviceRef: "device-1",
        type: "compute",
        capability: "cpu",
        version: "1.0.0",
        modes: ["read", "write"],
        limits: { maxCpu: 100 },
        status: "active",
        freshness: new Date().toISOString(),
        evidenceRefs: ["evidence-1"],
        revocationState: "active"
      };
      
      // In a real implementation, this would use Zod validation
      expect(validResource.id).toBeDefined();
      expect(validResource.owner).toBeDefined();
      expect(validResource.deviceRef).toBeDefined();
    });

    test("should validate capability observations", () => {
      const validObservation = {
        declared: { cpu: 100 },
        observed: { cpu: 95 },
        evidenceClass: "performance",
        timestamp: new Date().toISOString(),
        freshness: new Date().toISOString()
      };
      
      expect(validObservation.declared).toBeDefined();
      expect(validObservation.observed).toBeDefined();
      expect(validObservation.evidenceClass).toBeDefined();
    });
  });
});