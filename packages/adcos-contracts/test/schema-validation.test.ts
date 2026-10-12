import { describe, it, expect } from 'node:test';
import {
  ResourceProjectionReferenceSchema,
  InstanceIdentityReferenceSchema,
  CapabilityObservationSchema,
  EnvelopeSchema,
  MessageSchema,
  OrganizationMembershipSchema,
  GroupPurchaseRequestSchema,
  StatusSchema,
  PaymentReferenceSchema,
  ShareNetPortSchema,
  AdcosPortSchema
} from '../src/index.js';

// ============================================================================
// Schema/Runtime Validation Tests
// ============================================================================

describe('Schema/Runtime Validation', () => {
  describe('ResourceProjectionReference', () => {
    it('should parse valid resource projection reference', () => {
      const validResource = {
        id: 'res-123',
        owner: 'user-456',
        device: 'device-789',
        type: 'phone',
        capability: 'forwarding-v1',
        modes: ['local', 'relay'],
        limits: { maxData: 1000 },
        status: 'ACTIVE',
        freshness: Date.now()
      };

      const result = ResourceProjectionReferenceSchema.safeParse(validResource);
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const invalidResource = {
        id: 'res-123',
        owner: 'user-456'
        // Missing required fields
      };

      const result = ResourceProjectionReferenceSchema.safeParse(invalidResource);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(5); // Missing device, type, capability, modes, status
      }
    });

    it('should reject invalid status values', () => {
      const invalidResource = {
        id: 'res-123',
        owner: 'user-456',
        device: 'device-789',
        type: 'phone',
        capability: 'forwarding-v1',
        modes: ['local', 'relay'],
        limits: { maxData: 1000 },
        status: 'INVALID_STATUS'
      };

      const result = ResourceProjectionReferenceSchema.safeParse(invalidResource);
      expect(result.success).toBe(false);
    });
  });

  describe('InstanceIdentityReference', () => {
    it('should parse valid instance identity reference', () => {
      const validInstance = {
        id: 'inst-123',
        principal: 'user-456',
        device: 'device-789',
        type: 'USER',
        capabilities: ['capability1', 'capability2']
      };

      const result = InstanceIdentityReferenceSchema.safeParse(validInstance);
      expect(result.success).toBe(true);
    });

    it('should reject invalid type values', () => {
      const invalidInstance = {
        id: 'inst-123',
        principal: 'user-456',
        device: 'device-789',
        type: 'INVALID_TYPE',
        capabilities: ['capability1', 'capability2']
      };

      const result = InstanceIdentityReferenceSchema.safeParse(invalidInstance);
      expect(result.success).toBe(false);
    });
  });

  describe('CapabilityObservation', () => {
    it('should parse valid capability observation', () => {
      const validObservation = {
        declared: {
          capability: 'forwarding-v1',
          version: '1.0.0',
          schedule: { start: Date.now() },
          limits: { maxData: 1000 }
        },
        observed: {
          status: 'ACTIVE',
          freshness: Date.now()
        },
        evidenceClass: 'OBSERVATION'
      };

      const result = CapabilityObservationSchema.safeParse(validObservation);
      expect(result.success).toBe(true);
    });

    it('should reject invalid evidence class', () => {
      const invalidObservation = {
        declared: {
          capability: 'forwarding-v1',
          version: '1.0.0'
        },
        observed: {
          status: 'ACTIVE'
        },
        evidenceClass: 'INVALID_CLASS'
      };

      const result = CapabilityObservationSchema.safeParse(invalidObservation);
      expect(result.success).toBe(false);
    });
  });

  describe('Envelope', () => {
    it('should parse valid envelope', () => {
      const validEnvelope = {
        schema: { major: 1, minor: 0, patch: 0 },
        eventId: 'evt-123',
        sender: 'sender-456',
        receiver: 'receiver-789',
        scope: 'scope-abc',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        correlationId: 'corr-123',
        causationId: 'caus-456',
        idempotencyKey: 'idemp-789',
        payloadDigest: 'digest-abc',
        authorizationRef: 'auth-123',
        delegationRef: 'deleg-456',
        policyEpoch: 12345,
        signature: 'sig-789'
      };

      const result = EnvelopeSchema.safeParse(validEnvelope);
      expect(result.success).toBe(true);
    });

    it('should parse envelope without optional fields', () => {
      const minimalEnvelope = {
        schema: { major: 1, minor: 0, patch: 0 },
        eventId: 'evt-123',
        sender: 'sender-456',
        receiver: 'receiver-789',
        scope: 'scope-abc',
        issuedAt: Date.now()
      };

      const result = EnvelopeSchema.safeParse(minimalEnvelope);
      expect(result.success).toBe(true);
    });
  });

  describe('Message', () => {
    it('should parse valid message', () => {
      const validMessage = {
        id: 'msg-123',
        envelope: {
          schema: { major: 1, minor: 0, patch: 0 },
          eventId: 'evt-123',
          sender: 'sender-456',
          receiver: 'receiver-789',
          scope: 'scope-abc',
          issuedAt: Date.now()
        },
        payload: { data: 'test' },
        lifecycle: {
          state: 'PENDING',
          attempts: 0,
          maxRetries: 3
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const result = MessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });
  });

  describe('OrganizationMembership', () => {
    it('should parse valid organization membership', () => {
      const validMembership = {
        id: 'mem-123',
        organization: 'org-456',
        principal: 'user-789',
        state: 'MEMBER',
        role: 'ADMIN',
        joinedAt: Date.now()
      };

      const result = OrganizationMembershipSchema.safeParse(validMembership);
      expect(result.success).toBe(true);
    });

    it('should reject invalid membership state', () => {
      const invalidMembership = {
        id: 'mem-123',
        organization: 'org-456',
        principal: 'user-789',
        state: 'INVALID_STATE',
        role: 'ADMIN',
        joinedAt: Date.now()
      };

      const result = OrganizationMembershipSchema.safeParse(invalidMembership);
      expect(result.success).toBe(false);
    });
  });

  describe('GroupPurchaseRequest', () => {
    it('should parse valid group purchase request', () => {
      const validRequest = {
        id: 'req-123',
        intent: 'intent-456',
        requirements: { type: 'bandwidth', amount: 1000 },
        participants: ['user-1', 'user-2'],
        threshold: 3,
        expiresAt: Date.now() + 86400000
      };

      const result = GroupPurchaseRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject threshold greater than participants', () => {
      const invalidRequest = {
        id: 'req-123',
        intent: 'intent-456',
        requirements: { type: 'bandwidth', amount: 1000 },
        participants: ['user-1', 'user-2'],
        threshold: 5,
        expiresAt: Date.now() + 86400000
      };

      const result = GroupPurchaseRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('Status', () => {
    it('should parse valid status with reconcile flag', () => {
      const validStatus = {
        state: 'FAILED',
        code: 'ERR_TIMEOUT',
        message: 'Operation timed out',
        freshness: Date.now(),
        reconcile: true
      };

      const result = StatusSchema.safeParse(validStatus);
      expect(result.success).toBe(true);
    });

    it('should accept minimal valid status', () => {
      const minimalStatus = {
        state: 'UNKNOWN'
      };

      const result = StatusSchema.safeParse(minimalStatus);
      expect(result.success).toBe(true);
    });
  });

  describe('PaymentReference', () => {
    it('should parse valid payment reference', () => {
      const validPayment = {
        id: 'pay-123',
        type: 'stripe',
        authority: 'stripe-456',
        created: Date.now(),
        amount: 1000,
        currency: 'USD',
        settled: false
      };

      const result = PaymentReferenceSchema.safeParse(validPayment);
      expect(result.success).toBe(true);
    });

    it('should accept payment reference without optional fields', () => {
      const minimalPayment = {
        id: 'pay-123',
        type: 'stripe',
        authority: 'stripe-456',
        created: Date.now()
      };

      const result = PaymentReferenceSchema.safeParse(minimalPayment);
      expect(result.success).toBe(true);
    });
  });

  describe('ShareNetPort', () => {
    it('should parse valid ShareNet port', () => {
      const validPort = {
        endpoint: 'https://api.sharenet.com/v1',
        capabilities: ['forwarding', 'measurement'],
        auth: {
          provider: 'oauth',
          credentials: { token: 'abc123' }
        }
      };

      const result = ShareNetPortSchema.safeParse(validPort);
      expect(result.success).toBe(true);
    });
  });

  describe('AdcosPort', () => {
    it('should parse valid ADCOS port', () => {
      const validPort = {
        version: { major: 1, minor: 0, patch: 0 },
        capabilities: ['resource', 'execution'],
        endpoints: { resource: '/api/v1/resource', execution: '/api/v1/execute' },
        auth: {
          methods: ['oauth', 'api-key'],
          scopes: ['resource:read', 'resource:write']
        }
      };

      const result = AdcosPortSchema.safeParse(validPort);
      expect(result.success).toBe(true);
    });
  });
});