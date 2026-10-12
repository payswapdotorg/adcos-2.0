import { z } from "zod";
import { LabComparisonEvidenceSchema } from "./lab.js";

// ============================================================================
// Organizations, Group Purchasing, Opportunity Evidence, Status, Payment
// ============================================================================

/**
 * Organization membership states
 */
export const MembershipStateSchema = z.enum([
  "CANDIDATE",
  "INVITED",
  "MEMBER",
  "SUSPENDED",
  "REVOKED",
]);

export type MembershipState = z.infer<typeof MembershipStateSchema>;

/**
 * Organization candidate
 */
export const OrganizationCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  principals: z.array(z.string()), // founding principals
  requirements: z.record(z.string(), z.unknown()).optional(),
  capacity: z.record(z.string(), z.number()).optional(),
  expiresAt: z.number().optional(),
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
  revocationReason: z.string().optional(),
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
  revoked: z.boolean().default(false),
});

export type OrganizationMandate = z.infer<typeof OrganizationMandateSchema>;

/**
 * Group purchasing state machine states
 */
export const GroupPurchaseStateSchema = z.enum([
  "DISCOVERED",
  "CANDIDATE",
  "INVITED",
  "OFFER_REQUESTED",
  "OFFER_RECEIVED",
  "VALIDATED",
  "COMMITMENT_OPEN",
  "THRESHOLD_MET",
  "AUTHORIZED",
  "ORDERED",
  "CONTRACTED",
  "FULFILLED",
  "RECONCILED",
  "EXPIRED",
  "THRESHOLD_NOT_MET",
  "WITHDRAWN",
  "REJECTED",
  "CANCELLED",
  "FULFILLMENT_FAILED",
  "REFUND_PENDING",
  "DISPUTED",
]);

export type GroupPurchaseState = z.infer<typeof GroupPurchaseStateSchema>;

/**
 * Group purchase request.
 * Threshold is the minimum number of commitments needed OVERALL; participants
 * grow at commitment time, so threshold may legitimately exceed the initial
 * participant list size (rejected only when nonsensical: below one).
 */
export const GroupPurchaseRequestSchema = z.object({
  id: z.string(),
  intent: z.string(), // intent reference
  organization: z.string().optional(), // proposed organization
  requirements: z.record(z.string(), z.unknown()),
  participants: z.array(z.string()), // participant IDs
  threshold: z.number().min(1), // minimum participants
  expiresAt: z.number(),
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
  recurringCharges: z.array(
    z.object({
      amount: z.number(),
      frequency: z.string(),
      description: z.string(),
    }),
  ),
  oneTimeCharges: z.array(
    z.object({
      amount: z.number(),
      description: z.string(),
    }),
  ),
  term: z.string(),
  limitations: z.array(z.string()),
  expiry: z.number(),
  provenance: z.string(),
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
  allocation: z.record(z.string(), z.number()), // participant-specific allocation
  acceptedAt: z.number(),
  expiresAt: z.number().optional(),
  revoked: z.boolean().default(false),
});

export type GroupPurchaseCommitment = z.infer<typeof GroupPurchaseCommitmentSchema>;

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
  expiresAt: z.number().optional(),
});

export type OpportunityEvidence = z.infer<typeof OpportunityEvidenceSchema>;

/**
 * Status/error states with UNKNOWN-before-FAILED and reconcile-before-retry
 */
export const StatusSchema = z.object({
  state: z.enum(["UNKNOWN", "STALE", "DEGRADED", "FAILED", "REJECTED", "TERMINATED"]),
  code: z.string().optional(),
  message: z.string().optional(),
  freshness: z.number().optional(),
  retryAfter: z.number().optional(),
  reconcile: z.boolean().default(false), // requires reconciliation before retry
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
  settled: z.boolean().default(false),
});

export type PaymentReference = z.infer<typeof PaymentReferenceSchema>;
