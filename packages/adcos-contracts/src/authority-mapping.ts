import { z } from "zod";
import {
  ResourceProjectionReferenceSchema,
  InstanceIdentityReferenceSchema,
  CapabilityObservationSchema,
} from "./schemas/resource.js";
import {
  EnvelopeSchema,
  TaskLeaseSchema,
  DelegationSchema,
  EventLifecycleSchema,
  MessageSchema,
} from "./schemas/coordination.js";
import {
  OrganizationCandidateSchema,
  OrganizationMembershipSchema,
  OrganizationMandateSchema,
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
import { AUTHORITY_CONCERNS, FieldAuthorityMapping } from "./authority-concerns.js";

// ============================================================================
// Field → Authority mapping validator (logic only; the data lives in
// ./authority-concerns.ts)
// ============================================================================

/**
 * Entities covered by the mapping (one entry per canonical schema family).
 * Reference schemas (schemas exported at package level and embedded by
 * reference, e.g. Message.envelope) are treated as leaf fields; only inline
 * structural objects and array-item objects are traversed deeper.
 */
const ENTITY_SCHEMAS: ReadonlyArray<{ entity: string; schema: z.ZodObject }> = [
  { entity: "ResourceProjectionReference", schema: ResourceProjectionReferenceSchema },
  { entity: "InstanceIdentityReference", schema: InstanceIdentityReferenceSchema },
  { entity: "CapabilityObservation", schema: CapabilityObservationSchema },
  { entity: "Envelope", schema: EnvelopeSchema },
  { entity: "TaskLease", schema: TaskLeaseSchema },
  { entity: "Delegation", schema: DelegationSchema },
  { entity: "EventLifecycle", schema: EventLifecycleSchema },
  { entity: "Message", schema: MessageSchema },
  { entity: "OrganizationCandidate", schema: OrganizationCandidateSchema },
  { entity: "OrganizationMembership", schema: OrganizationMembershipSchema },
  { entity: "OrganizationMandate", schema: OrganizationMandateSchema },
  { entity: "GroupPurchaseRequest", schema: GroupPurchaseRequestSchema },
  { entity: "GroupPurchaseOffer", schema: GroupPurchaseOfferSchema },
  { entity: "GroupPurchaseCommitment", schema: GroupPurchaseCommitmentSchema },
  { entity: "LabComparisonEvidence", schema: LabComparisonEvidenceSchema },
  { entity: "OpportunityEvidence", schema: OpportunityEvidenceSchema },
  { entity: "Status", schema: StatusSchema },
  { entity: "PaymentReference", schema: PaymentReferenceSchema },
  { entity: "ShareNetPort", schema: ShareNetPortSchema },
  { entity: "AdcosPort", schema: AdcosPortSchema },
];

/** Schemas that, when embedded as a field value, are references (leaves). */
const REFERENCE_SCHEMAS: ReadonlySet<z.ZodType> = new Set<z.ZodType>([
  ResourceProjectionReferenceSchema,
  InstanceIdentityReferenceSchema,
  CapabilityObservationSchema,
  SchemaVersionSchema,
  EnvelopeSchema,
  TaskLeaseSchema,
  DelegationSchema,
  EventLifecycleSchema,
  MessageSchema,
  OrganizationCandidateSchema,
  OrganizationMembershipSchema,
  OrganizationMandateSchema,
  GroupPurchaseRequestSchema,
  GroupPurchaseOfferSchema,
  GroupPurchaseCommitmentSchema,
  LabComparisonEvidenceSchema,
  OpportunityEvidenceSchema,
  StatusSchema,
  PaymentReferenceSchema,
  ShareNetPortSchema,
  AdcosPortSchema,
  VersionedSchema,
]);

/**
 * Collect the dotted field paths of a schema. Rules:
 * - inline structural objects are traversed (e.g. declared.schedule.start);
 * - array items that are inline objects are traversed under the array field
 *   (e.g. recurringCharges.amount);
 * - records, enums, primitives, optional/default wrappers and embedded
 *   reference schemas are leaves.
 */
function collectFieldPaths(schema: z.ZodObject, path = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(schema.shape)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (value instanceof z.ZodObject && !REFERENCE_SCHEMAS.has(value)) {
      paths.push(...collectFieldPaths(value, fieldPath));
    } else if (
      value instanceof z.ZodArray &&
      value.element instanceof z.ZodObject &&
      !REFERENCE_SCHEMAS.has(value.element)
    ) {
      paths.push(...collectFieldPaths(value.element, fieldPath));
    } else {
      paths.push(fieldPath);
    }
  }
  return paths;
}

export interface FieldAuthorityMappingValidation {
  /** True when missing, stale and invalid are all empty. */
  valid: boolean;
  /** Schema field paths with no mapping row. */
  missing: string[];
  /** Mapping rows that match no real schema field path. */
  stale: string[];
  /** Mapping rows whose value is not a spec-defined authority concern. */
  invalid: string[];
}

/**
 * Validate the field→authority mapping against the real zod schemas.
 */
export function validateFieldAuthorityMappings(): FieldAuthorityMappingValidation {
  const table: Record<string, string> = FieldAuthorityMapping;
  const known = new Set(Object.keys(table));
  const concerns = new Set<string>(AUTHORITY_CONCERNS);

  const missing: string[] = [];
  const traversed = new Set<string>();
  for (const { entity, schema } of ENTITY_SCHEMAS) {
    for (const fieldPath of collectFieldPaths(schema)) {
      const key = `${entity}.${fieldPath}`;
      traversed.add(key);
      if (!known.has(key)) {
        missing.push(key);
      }
    }
  }

  const stale: string[] = [];
  const invalid: string[] = [];
  for (const [key, concern] of Object.entries(table)) {
    if (!traversed.has(key)) {
      stale.push(key);
    }
    if (!concerns.has(concern)) {
      invalid.push(key);
    }
  }

  return {
    valid: missing.length === 0 && stale.length === 0 && invalid.length === 0,
    missing,
    stale,
    invalid,
  };
}
