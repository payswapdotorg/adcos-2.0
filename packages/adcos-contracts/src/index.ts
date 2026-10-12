/**
 * Core types and schemas for ADCOS 2.0 canonical contracts
 * @packageDocumentation
 */

import { z } from 'zod';

// ============================================================================
// Resource & Instance References
// ============================================================================

/**
 * Resource projection reference - stable identifier for a resource without provider credentials
 */
export const ResourceProjectionReferenceSchema = z.object({
  id: z.string(), // stable resource ID
  owner: z.string(), // principal reference
  device: z.string(), // device/instance reference
  type: z.string(), // resource type (phone/computer/router/etc.)
  capability: z.string(), // capability/version
  modes: z.array(z.string()), // supported modes
  limits: z.record(z.number()), // capacity/schedule limits
  status: z.enum(['UNKNOWN', 'STALE', 'DEGRADED', 'FAILED', 'REJECTED', 'TERMINATED']),
  freshness: z.number().optional(), // timestamp
  evidence: z.array(z.string()).optional(), // evidence reference list
  revoked: z.boolean().default(false)
});

export type ResourceProjectionReference = z.infer<typeof ResourceProjectionReferenceSchema>;

/**
 * Instance identity reference - distinct from principal
 */
export const InstanceIdentityReferenceSchema = z.object({
  id: z.string(), // stable instance ID
  principal: z.string(), // principal reference
  device: z.string(), // device reference
  type: z.enum(['USER', 'ORGANIZATION', 'AGENT', 'DEVICE']),
  capabilities: z.array(z.string())
});

export type InstanceIdentityReference = z.infer<typeof InstanceIdentityReferenceSchema>;

// ============================================================================
// Capability Observation
// ============================================================================

/**
 * Evidence class vocabulary - single closed vocabulary for ADCOS 2.0
 */
export const EvidenceClassSchema = z.enum([
  'OWNER_DECLARATION',
  'OBSERVATION',
  'PROVIDER_COMMITMENT',
  'DERIVED',
  'LAB_RESULT',
  'MEASUREMENT',
  'POLICY_EVAL'
]);

export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

/**
 * Capability observation - declared vs observed separation
 */
export const CapabilityObservationSchema = z.object({
  declared: z.object({
    capability: z.string(),
    version: z.string(),
    schedule: z.object({
      start: z.number().optional(),
      end: z.number().optional(),
      timezone: z.string().optional()
    }),
    limits: z.record(z.number()),
    beneficiaries: z.array(z.string()).optional()
  }),
  observed: z.object({
    capability: z.string().optional(),
    version: z.string().optional(),
    status: z.enum(['UNKNOWN', 'STALE', 'DEGRADED', 'FAILED', 'REJECTED', 'TERMINATED']),
    freshness: z.number().optional(),
    evidence: z.array(z.string()).optional()
  }),
  evidenceClass: EvidenceClassSchema
});

export type CapabilityObservation = z.infer<typeof CapabilityObservationSchema>;

// ============================================================================
// Cross-Device Envelope / Task / Delegation
// ============================================================================

/**
 * Schema version and compatibility info
 */
export const SchemaVersionSchema = z.object({
  major: z.number(),
  minor: z.number(),
  patch: z.number()
});

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;

/**
 * Full envelope field list from cross-device-coordination.md
 */
export const EnvelopeSchema = z.object({
  schema: SchemaVersionSchema,
  eventId: z.string(), // unique event identifier
  commandId: z.string().optional(), // command identifier (if command)
  sender: z.string(), // sender instance ID
  receiver: z.string(), // receiver instance ID
  scope: z.string(), // scope identifier
  issuedAt: z.number(), // timestamp
  expiresAt: z.number().optional(), // expiration timestamp
  correlationId: z.string().optional(), // correlation identifier
  causationId: z.string().optional(), // causation identifier
  idempotencyKey: z.string().optional(), // idempotency key
  payloadDigest: z.string().optional(), // payload digest
  authorizationRef: z.string().optional(), // authorization reference
  delegationRef: z.string().optional(), // delegation reference
  policyEpoch: z.number().optional(), // policy epoch
  signature: z.string().optional() // signature placeholder
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

/**
 * Task lease/deadline/retry-budget/cancellation
 */
export const TaskLeaseSchema = z.object({
  deadline: z.number(), // absolute deadline timestamp
  retryBudget: z.number().optional(), // remaining retry attempts
  cancellationDeadline: z.number().optional(), // when task can be cancelled
  cancellationReason: z.string().optional() // reason for cancellation
});

export type TaskLease = z.infer<typeof TaskLeaseSchema>;

/**
 * Scoped delegation with attenuation and revocation semantics
 */
export const DelegationSchema = z.object({
  id: z.string(),
  principal: z.string(), // delegating principal
  delegate: z.string(), // delegated principal
  scope: z.string(),
  issuedAt: z.number(),
  expiresAt: z.number().optional(),
  attenuation: z.record(z.string()).optional(), // restrictions on delegated authority
  revoked: z.boolean().default(false),
  revocationReason: z.string().optional()
});

export type Delegation = z.infer<typeof DelegationSchema>;

// ============================================================================
// Inbox/Outbox + Event Lifecycle
// ============================================================================

/**
 * Acknowledgement states
 */
export const AckStateSchema = z.enum(['PENDING', 'ACKNOWLEDGED', 'REJECTED', 'FAILED']);

export type AckState = z.infer<typeof AckStateSchema>;

/**
 * Event lifecycle states
 */
export const EventLifecycleSchema = z.object({
  state: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED']),
  attempts: z.number().default(0),
  lastAttemptAt: z.number().optional(),
  nextRetryAt: z.number().optional(),
  maxRetries: z.number().default(3),
  ackState: AckStateSchema.optional(),
  deadLetterReason: z.string().optional()
});

export type EventLifecycle = z.infer<typeof EventLifecycleSchema>;

/**
 * Inbox/outbox message
 */
export const MessageSchema = z.object({
  id: z.string(),
  envelope: EnvelopeSchema,
  payload: z.record(z.unknown()),
  lifecycle: EventLifecycleSchema,
  createdAt: z.number(),
  updatedAt: z.number()
});

export type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// Organization Types
// ============================================================================

/**
 * Organization membership states
 */
export const MembershipStateSchema = z.enum(['CANDIDATE', 'INVITED', 'MEMBER', 'SUSPENDED', 'REVOKED']);

export type MembershipState = z.infer<typeof MembershipStateSchema>;

/**
 * Organization candidate
 */
export const OrganizationCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  principals: z.array(z.string()), // founding principals
  requirements: z.record(z.unknown()).optional(),
  capacity: z.record(z.number()).optional(),
  expiresAt: z.number().optional()
});

export type OrganizationCandidate = z.infer<typeof OrganizationCandidateSchema>;

/**
 * Organization membership
 */
export const OrganizationMembershipSchema = z.object({
  id: z.string(),
  organization: z.string(),
  principal: z.string(),
  state: MembershipStateSchema,
  role: z.string(),
  joinedAt: z.number(),
  expiresAt: z.number().optional(),
  revoked: z.boolean().default(false),
  revocationReason: z.string().optional()
});

export type OrganizationMembership = z.infer<typeof OrganizationMembershipSchema>;

/**
 * Organization mandate
 */
export const OrganizationMandateSchema = z.object({
  id: z.string(),
  organization: z.string(),
  principal: z.string(),
  scope: z.string(), // scope of authority
  permissions: z.array(z.string()),
  issuedAt: z.number(),
  expiresAt: z.number().optional(),
  revoked: z.boolean().default(false)
});

export type OrganizationMandate = z.infer<typeof OrganizationMandateSchema>;

// ============================================================================
// Group Purchasing Types
// ============================================================================

/**
 * Group purchasing state machine states
 */
export const GroupPurchaseStateSchema = z.enum([
  'DISCOVERED',
  'CANDIDATE',
  'INVITED',
  'OFFER_REQUESTED',
  'OFFER_RECEIVED',
  'VALIDATED',
  'COMMITMENT_OPEN',
  'THRESHOLD_MET',
  'AUTHORIZED',
  'ORDERED',
  'CONTRACTED',
  'FULFILLED',
  'RECONCILED',
  'EXPIRED',
  'THRESHOLD_NOT_MET',
  'WITHDRAWN',
  'REJECTED',
  'CANCELLED',
  'FULFILLMENT_FAILED',
  'REFUND_PENDING',
  'DISPUTED'
]);

export type GroupPurchaseState = z.infer<typeof GroupPurchaseStateSchema>;

/**
 * Group purchase request
 */
export const GroupPurchaseRequestSchema = z.object({
  id: z.string(),
  intent: z.string(), // intent reference
  organization: z.string().optional(), // proposed organization
  requirements: z.record(z.unknown()),
  participants: z.array(z.string()), // participant IDs
  threshold: z.number(), // minimum participants
  expiresAt: z.number()
});

export type GroupPurchaseRequest = z.infer<typeof GroupPurchaseRequestSchema>;

/**
 * Group purchase offer
 */
export const GroupPurchaseOfferSchema = z.object({
  id: z.string(),
  request: z.string(),
  supplier: z.string(),
  product: z.string(),
  capability: z.string(),
  region: z.string(),
  quantity: z.number(),
  perMemberCost: z.number(),
  totalCost: z.number(),
  recurringCharges: z.array(z.object({
    amount: z.number(),
    frequency: z.string(),
    description: z.string()
  })),
  oneTimeCharges: z.array(z.object({
    amount: number,
    description: string
  })),
  term: z.string(),
  limitations: z.array(z.string()),
  expiry: z.number(),
  provenance: z.string()
});

export type GroupPurchaseOffer = z.infer<typeof GroupPurchaseOfferSchema>;

/**
 * Group purchase commitment
 */
export const GroupPurchaseCommitmentSchema = z.object({
  id: z.string(),
  request: z.string(),
  offer: z.string(),
  participant: z.string(),
  allocation: z.record(z.number()), // participant-specific allocation
  acceptedAt: z.number(),
  expiresAt: z.number().optional(),
  revoked: z.boolean().default(false)
});

export type GroupPurchaseCommitment = z.infer<typeof GroupPurchaseCommitmentSchema>;

// ============================================================================
// Opportunity Evidence
// ============================================================================

/**
 * Lab comparison evidence
 */
export const LabComparisonEvidenceSchema = z.object({
  id: z.string(),
  intent: z.string(),
  baseline: z.string(), // baseline strategy reference
  alternatives: z.array(z.string()), // alternative strategy references
  noChange: z.object({
    cost: z.number(),
    reliability: z.number().optional(),
    utilization: z.number().optional()
  }),
  selected: z.object({
    strategy: z.string(),
    cost: z.number(),
    reliability: z.number().optional(),
    utilization: z.number().optional(),
    confidence: z.number(),
    assumptions: z.array(z.string())
  }),
  comparison: z.record(z.unknown()), // comparison results
  evaluatedAt: z.number(),
  expiresAt: z.number().optional()
});

export type LabComparisonEvidence = z.infer<typeof LabComparisonEvidenceSchema>;

/**
 * Opportunity evidence
 */
export const OpportunityEvidenceSchema = z.object({
  id: z.string(),
  intent: z.string(),
  evidence: LabComparisonEvidenceSchema,
  confidence: z.number(), // 0-1 scale
  cost: z.number(),
  benefit: z.number().optional(),
  risk: z.number().optional(),
  recommendation: z.string().optional(),
  expiresAt: z.number().optional()
});

export type OpportunityEvidence = z.infer<typeof OpportunityEvidenceSchema>;

// ============================================================================
// Status/Error/Freshness
// ============================================================================

/**
 * Status/error states with UNKNOWN-before-FAILED and reconcile-before-retry
 */
export const StatusSchema = z.object({
  state: z.enum(['UNKNOWN', 'STALE', 'DEGRADED', 'FAILED', 'REJECTED', 'TERMINATED']),
  code: z.string().optional(),
  message: z.string().optional(),
  freshness: z.number().optional(),
  retryAfter: z.number().optional(),
  reconcile: z.boolean().default(false) // requires reconciliation before retry
});

export type Status = z.infer<typeof StatusSchema>;

/**
 * Opaque payment reference per ADR-0004
 */
export const PaymentReferenceSchema = z.object({
  id: z.string(), // opaque payment reference
  type: z.string(), // payment system type
  authority: z.string(), // payment authority reference
  created: z.number(),
  expires: z.number().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  settled: z.boolean().default(false)
});

export type PaymentReference = z.infer<typeof PaymentReferenceSchema>;

// ============================================================================
// Public Ports (Adapter-Facing)
// ============================================================================

/**
 * ShareNet adapter port
 */
export const ShareNetPortSchema = z.object({
  endpoint: z.string(),
  capabilities: z.array(z.string()),
  auth: z.object({
    provider: z.string(),
    credentials: z.record(z.unknown())
  })
});

export type ShareNetPort = z.infer<typeof ShareNetPortSchema>;

/**
 * Canonical ADCOS developer-boundary port
 */
export const AdcosPortSchema = z.object({
  version: SchemaVersionSchema,
  capabilities: z.array(z.string()),
  endpoints: z.record(z.string()),
  auth: z.object({
    methods: z.array(z.string()),
    scopes: z.array(z.string())
  })
});

export type AdcosPort = z.infer<typeof AdcosPortSchema>;

// ============================================================================
// Versioning Scheme
// ============================================================================

/**
 * Version negotiation function
 */
export const negotiateVersion = (client: SchemaVersion, server: SchemaVersion): SchemaVersion => {
  // Simple major version matching with minor preference to client
  if (client.major !== server.major) {
    throw new Error(`Incompatible major versions: client ${client.major}, server ${server.major}`);
  }
  
  return {
    major: server.major,
    minor: Math.max(client.minor, server.minor),
    patch: 0 // Reset patch on version negotiation
  };
};

// ============================================================================
// Export all schemas and types
// ============================================================================

export const Schemas = {
  ResourceProjectionReference: ResourceProjectionReferenceSchema,
  InstanceIdentityReference: InstanceIdentityReferenceSchema,
  EvidenceClass: EvidenceClassSchema,
  CapabilityObservation: CapabilityObservationSchema,
  SchemaVersion: SchemaVersionSchema,
  Envelope: EnvelopeSchema,
  TaskLease: TaskLeaseSchema,
  Delegation: DelegationSchema,
  AckState: AckStateSchema,
  EventLifecycle: EventLifecycleSchema,
  Message: MessageSchema,
  MembershipState: MembershipStateSchema,
  OrganizationCandidate: OrganizationCandidateSchema,
  OrganizationMembership: OrganizationMembershipSchema,
  OrganizationMandate: OrganizationMandateSchema,
  GroupPurchaseState: GroupPurchaseStateSchema,
  GroupPurchaseRequest: GroupPurchaseRequestSchema,
  GroupPurchaseOffer: GroupPurchaseOfferSchema,
  GroupPurchaseCommitment: GroupPurchaseCommitmentSchema,
  LabComparisonEvidence: LabComparisonEvidenceSchema,
  OpportunityEvidence: OpportunityEvidenceSchema,
  Status: StatusSchema,
  PaymentReference: PaymentReferenceSchema,
  ShareNetPort: ShareNetPortSchema,
  AdcosPort: AdcosPortSchema
};

// Re-export types for convenience
export type {
  ResourceProjectionReference,
  InstanceIdentityReference,
  EvidenceClass,
  CapabilityObservation,
  SchemaVersion,
  Envelope,
  TaskLease,
  Delegation,
  AckState,
  EventLifecycle,
  Message,
  MembershipState,
  OrganizationCandidate,
  OrganizationMembership,
  OrganizationMandate,
  GroupPurchaseState,
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  LabComparisonEvidence,
  OpportunityEvidence,
  Status,
  PaymentReference,
  ShareNetPort,
  AdcosPort
};