/**
 * contracts 模块公开契约（ADCOS 2.0 canonical shared contracts）。
 * 对外只允许从这里（或包入口 index.ts）import；实现按域拆分在
 * schemas/、versioning.ts、authority-*.ts 中，均不回指本文件。
 */
import type { Envelope } from "./schemas/coordination.js";
import {
  ResourceProjectionReferenceSchema,
  InstanceIdentityReferenceSchema,
  CapabilityObservationSchema,
  EvidenceClassSchema,
} from "./schemas/resource.js";
import {
  EnvelopeSchema,
  TaskLeaseSchema,
  DelegationSchema,
  AckStateSchema,
  EventLifecycleSchema,
  MessageSchema,
} from "./schemas/coordination.js";
import {
  MembershipStateSchema,
  OrganizationCandidateSchema,
  OrganizationMembershipSchema,
  OrganizationMandateSchema,
  GroupPurchaseStateSchema,
  GroupPurchaseRequestSchema,
  GroupPurchaseOfferSchema,
  GroupPurchaseCommitmentSchema,
  OpportunityEvidenceSchema,
  StatusSchema,
  PaymentReferenceSchema,
} from "./schemas/economy.js";
import { LabComparisonEvidenceSchema } from "./schemas/lab.js";
import { ShareNetPortSchema, AdcosPortSchema } from "./schemas/ports.js";
import { SchemaVersionSchema, VersionedSchema } from "./versioning.js";

// Schema families and versioning surface
export * from "./schemas/resource.js";
export * from "./schemas/coordination.js";
export * from "./schemas/economy.js";
export * from "./schemas/lab.js";
export * from "./schemas/ports.js";
export * from "./versioning.js";

// Field→authority mapping surface
export { AUTHORITY_CONCERNS, FieldAuthorityMapping } from "./authority-concerns.js";
export type { AuthorityConcern } from "./authority-concerns.js";
export { validateFieldAuthorityMappings } from "./authority-mapping.js";
export type { FieldAuthorityMappingValidation } from "./authority-mapping.js";

// ============================================================================
// Schema registry (programmatic access to every schema family)
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
  AdcosPort: AdcosPortSchema,
  Versioned: VersionedSchema,
};

// ============================================================================
// Semantic predicates (envelope expiry / scope / replay)
// ============================================================================

/**
 * Check if an envelope is expired based on current time.
 * Envelopes without expiresAt do not expire.
 */
export const isEnvelopeExpired = (envelope: Envelope, now?: number): boolean => {
  const currentTime = now ?? Date.now();
  return envelope.expiresAt ? currentTime > envelope.expiresAt : false;
};

/**
 * Validate scope against allowed values. Envelope.scope is a free-form scope
 * identifier (spec/cross-device-coordination.md carries no closed scope
 * vocabulary), so conformance is enforced by the receiver's allowed list.
 */
export const validateScope = (scope: string, allowedScopes: string[]): boolean => {
  return allowedScopes.includes(scope);
};

/**
 * Bounded duplicate/replay guard for envelope processing.
 * Tracks idempotency keys (falling back to eventId when an envelope carries
 * none) with FIFO eviction so memory stays bounded under load.
 */
export interface ReplayGuard {
  /** Returns true when the envelope is first-seen (and is recorded); false on duplicate. */
  check(envelope: Envelope): boolean;
  /** Returns true when the key has been seen before; records it when new. */
  seen(key: string): boolean;
  /** Number of currently tracked keys (bounded by maxEntries). */
  readonly size: number;
}

export const createReplayGuard = (options?: { maxEntries?: number }): ReplayGuard => {
  const maxEntries = options?.maxEntries ?? 10_000;
  const seenKeys = new Set<string>();
  const queue: string[] = [];
  const record = (key: string): void => {
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    queue.push(key);
    if (queue.length > maxEntries) {
      const evicted = queue.shift();
      if (evicted !== undefined) {
        seenKeys.delete(evicted);
      }
    }
  };
  return {
    check(envelope: Envelope): boolean {
      const key = envelope.idempotencyKey ?? envelope.eventId;
      if (seenKeys.has(key)) {
        return false;
      }
      record(key);
      return true;
    },
    seen(key: string): boolean {
      if (seenKeys.has(key)) {
        return true;
      }
      record(key);
      return false;
    },
    get size(): number {
      return seenKeys.size;
    },
  };
};
