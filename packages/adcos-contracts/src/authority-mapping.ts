import { z } from "zod";
import {
  ResourceProjectionReferenceSchema,
  InstanceIdentityReferenceSchema,
  CapabilityObservationSchema,
  EnvelopeSchema,
  MessageSchema,
  EventLifecycleSchema,
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
  SchemaVersionSchema
} from "./index";

// Field to Authority Mapping
// Maps every contract field to its authority model row from spec/authority-model.md

export const FieldAuthorityMapping = {
  // Resource & Instance References
  "ResourceProjectionReference.id": "resource-identity",
  "ResourceProjectionReference.owner": "principal-identity",
  "ResourceProjectionReference.device": "device-identity",
  "ResourceProjectionReference.type": "resource-classification",
  "ResourceProjectionReference.capability": "capability-registry",
  "ResourceProjectionReference.modes": "access-control",
  "ResourceProjectionReference.limits": "resource-policy",
  "ResourceProjectionReference.status": "resource-state",
  "ResourceProjectionReference.freshness": "freshness-guarantee",
  "ResourceProjectionReference.evidence": "evidence-chain",
  "ResourceProjectionReference.revoked": "revocation-registry",
  
  "InstanceIdentityReference.id": "instance-identity",
  "InstanceIdentityReference.principal": "principal-identity",
  "InstanceIdentityReference.device": "device-identity",
  "InstanceIdentityReference.type": "instance-classification",
  "InstanceIdentityReference.capabilities": "capability-interface",
  
  // Capability Observation
  "CapabilityObservation.declared.capability": "capability-declaration",
  "CapabilityObservation.declared.version": "version-control",
  "CapabilityObservation.declared.schedule": "time-boxing",
  "CapabilityObservation.declared.limits": "resource-policy",
  "CapabilityObservation.declared.beneficiaries": "beneficiary-control",
  
  "CapabilityObservation.observed.capability": "capability-measurement",
  "CapabilityObservation.observed.version": "version-control",
  "CapabilityObservation.observed.status": "capability-state",
  "CapabilityObservation.observed.freshness": "freshness-guarantee",
  "CapabilityObservation.observed.evidence": "evidence-chain",
  
  "CapabilityObservation.evidenceClass": "evidence-classification",
  
  // Cross-Device Envelope
  "Envelope.schema": "schema-version",
  "Envelope.eventId": "event-identity",
  "Envelope.commandId": "command-identity",
  "Envelope.sender": "instance-identity",
  "Envelope.receiver": "instance-identity",
  "Envelope.scope": "scope-determination",
  "Envelope.issuedAt": "event-timestamp",
  "Envelope.expiresAt": "expiry-control",
  "Envelope.correlationId": "correlation-tracking",
  "Envelope.causationId": "causation-tracking",
  "Envelope.idempotencyKey": "idempotency-control",
  "Envelope.payloadDigest": "integrity-check",
  "Envelope.authorizationRef": "authority-reference",
  "Envelope.delegationRef": "delegation-reference",
  "Envelope.policyEpoch": "policy-version",
  "Envelope.signature": "authenticity-proof",
  
  // Task Lease
  "TaskLease.deadline": "deadline-enforcement",
  "TaskLease.retryBudget": "retry-control",
  "TaskLease.cancellationDeadline": "cancellation-control",
  "TaskLease.cancellationReason": "cancellation-control",
  
  // Delegation
  "Delegation.id": "delegation-identity",
  "Delegation.principal": "principal-identity",
  "Delegation.delegate": "principal-identity",
  "Delegation.scope": "scope-determination",
  "Delegation.issuedAt": "event-timestamp",
  "Delegation.expiresAt": "expiry-control",
  "Delegation.attenuation": "authority-attenuation",
  "Delegation.revoked": "revocation-control",
  "Delegation.revocationReason": "revocation-control",
  
  // Message
  "Message.id": "message-identity",
  "Message.envelope": "envelope-reference",
  "Message.payload": "message-content",
  "Message.lifecycle": "event-lifecycle",
  "Message.createdAt": "event-timestamp",
  "Message.updatedAt": "event-timestamp",
  
  // Event Lifecycle
  "EventLifecycle.state": "event-state",
  "EventLifecycle.attempts": "retry-control",
  "EventLifecycle.lastAttemptAt": "retry-timing",
  "EventLifecycle.nextRetryAt": "retry-timing",
  "EventLifecycle.maxRetries": "retry-control",
  "EventLifecycle.ackState": "acknowledgment-tracking",
  "EventLifecycle.deadLetterReason": "error-handling",
  
  // Organization Candidate
  "OrganizationCandidate.id": "organization-identity",
  "OrganizationCandidate.name": "organization-name",
  "OrganizationCandidate.description": "organization-description",
  "OrganizationCandidate.principals": "principal-membership",
  "OrganizationCandidate.requirements": "organization-policy",
  "OrganizationCandidate.capacity": "resource-policy",
  "OrganizationCandidate.expiresAt": "expiry-control",
  
  // Organization Membership
  "OrganizationMembership.id": "membership-identity",
  "OrganizationMembership.organization": "organization-identity",
  "OrganizationMembership.principal": "principal-identity",
  "OrganizationMembership.state": "membership-state",
  "OrganizationMembership.role": "role-assignment",
  "OrganizationMembership.joinedAt": "event-timestamp",
  "OrganizationMembership.expiresAt": "expiry-control",
  "OrganizationMembership.revoked": "revocation-control",
  "OrganizationMembership.revocationReason": "revocation-control",
  
  // Organization Mandate
  "OrganizationMandate.id": "mandate-identity",
  "OrganizationMandate.organization": "organization-identity",
  "OrganizationMandate.principal": "principal-identity",
  "OrganizationMandate.scope": "scope-determination",
  "OrganizationMandate.permissions": "authority-delegation",
  "OrganizationMandate.issuedAt": "event-timestamp",
  "OrganizationMandate.expiresAt": "expiry-control",
  "OrganizationMandate.revoked": "revocation-control",
  
  // Group Purchase Request
  "GroupPurchaseRequest.id": "request-identity",
  "GroupPurchaseRequest.intent": "intent-reference",
  "GroupPurchaseRequest.organization": "organization-identity",
  "GroupPurchaseRequest.requirements": "requirement-specification",
  "GroupPurchaseRequest.participants": "participant-identity",
  "GroupPurchaseRequest.threshold": "threshold-control",
  "GroupPurchaseRequest.expiresAt": "expiry-control",
  
  // Group Purchase Offer
  "GroupPurchaseOffer.id": "offer-identity",
  "GroupPurchaseOffer.request": "request-reference",
  "GroupPurchaseOffer.supplier": "supplier-identity",
  "GroupPurchaseOffer.product": "product-identity",
  "GroupPurchaseOffer.capability": "capability-interface",
  "GroupPurchaseOffer.region": "geographic-scope",
  "GroupPurchaseOffer.quantity": "quantity-control",
  "GroupPurchaseOffer.perMemberCost": "cost-assessment",
  "GroupPurchaseOffer.totalCost": "cost-assessment",
  "GroupPurchaseOffer.recurringCharges.amount": "cost-assessment",
  "GroupPurchaseOffer.recurringCharges.frequency": "billing-frequency",
  "GroupPurchaseOffer.recurringCharges.description": "cost-description",
  "GroupPurchaseOffer.oneTimeCharges.amount": "cost-assessment",
  "GroupPurchaseOffer.oneTimeCharges.description": "cost-description",
  "GroupPurchaseOffer.term": "term-control",
  "GroupPurchaseOffer.limitations": "usage-restrictions",
  "GroupPurchaseOffer.expiry": "expiry-control",
  "GroupPurchaseOffer.provenance": "provenance-tracking",
  
  // Group Purchase Commitment
  "GroupPurchaseCommitment.id": "commitment-identity",
  "GroupPurchaseCommitment.request": "request-reference",
  "GroupPurchaseCommitment.offer": "offer-reference",
  "GroupPurchaseCommitment.participant": "participant-identity",
  "GroupPurchaseCommitment.allocation": "allocation-control",
  "GroupPurchaseCommitment.acceptedAt": "event-timestamp",
  "GroupPurchaseCommitment.expiresAt": "expiry-control",
  "GroupPurchaseCommitment.revoked": "revocation-control",
  
  // Lab Comparison Evidence
  "LabComparisonEvidence.id": "evidence-identity",
  "LabComparisonEvidence.intent": "intent-reference",
  "LabComparisonEvidence.baseline": "baseline-reference",
  "LabComparisonEvidence.alternatives": "alternative-reference",
  "LabComparisonEvidence.noChange.cost": "cost-assessment",
  "LabComparisonEvidence.noChange.reliability": "reliability-assessment",
  "LabComparisonEvidence.noChange.utilization": "utilization-assessment",
  "LabComparisonEvidence.selected.strategy": "strategy-selection",
  "LabComparisonEvidence.selected.cost": "cost-assessment",
  "LabComparisonEvidence.selected.reliability": "reliability-assessment",
  "LabComparisonEvidence.selected.utilization": "utilization-assessment",
  "LabComparisonEvidence.selected.confidence": "confidence-assessment",
  "LabComparisonEvidence.selected.assumptions": "assumption-tracking",
  "LabComparisonEvidence.comparison": "comparison-results",
  "LabComparisonEvidence.evaluatedAt": "event-timestamp",
  "LabComparisonEvidence.expiresAt": "expiry-control",
  
  // Opportunity Evidence
  "OpportunityEvidence.id": "evidence-identity",
  "OpportunityEvidence.intent": "intent-reference",
  "OpportunityEvidence.evidence": "evidence-reference",
  "OpportunityEvidence.confidence": "confidence-assessment",
  "OpportunityEvidence.cost": "cost-assessment",
  "OpportunityEvidence.benefit": "benefit-assessment",
  "OpportunityEvidence.risk": "risk-assessment",
  "OpportunityEvidence.recommendation": "recommendation",
  "OpportunityEvidence.expiresAt": "expiry-control",
  
  // Status
  "Status.state": "status-state",
  "Status.code": "status-code",
  "Status.message": "status-message",
  "Status.freshness": "freshness-guarantee",
  "Status.retryAfter": "retry-timing",
  "Status.reconcile": "reconciliation-control",
  
  // Payment Reference
  "PaymentReference.id": "payment-reference",
  "PaymentReference.type": "payment-system",
  "PaymentReference.authority": "payment-authority",
  "PaymentReference.created": "event-timestamp",
  "PaymentReference.expires": "expiry-control",
  "PaymentReference.amount": "cost-assessment",
  "PaymentReference.currency": "currency-control",
  "PaymentReference.settled": "settlement-control",
  
  // ShareNet Port
  "ShareNetPort.endpoint": "endpoint-definition",
  "ShareNetPort.capabilities": "capability-interface",
  "ShareNetPort.auth.provider": "auth-provider",
  "ShareNetPort.auth.credentials": "auth-credentials",
  
  // Adcos Port
  "AdcosPort.version": "version-control",
  "AdcosPort.capabilities": "capability-interface",
  "AdcosPort.endpoints": "endpoint-definition",
  "AdcosPort.auth.methods": "auth-methods",
  "AdcosPort.auth.scopes": "scope-control"
};

// Validate that all fields in our schemas have authority mappings
export function validateFieldAuthorityMappings(): { valid: boolean; missing: string[] } {
  const allSchemas = [
    ResourceProjectionReferenceSchema,
    InstanceIdentityReferenceSchema,
    CapabilityObservationSchema,
    EnvelopeSchema,
    MessageSchema,
    EventLifecycleSchema,
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
    AdcosPortSchema
  ];
  
  const missingMappings: string[] = [];
  const mappingKeys = Object.keys(FieldAuthorityMapping);
  
  // Helper function to recursively collect all field paths from a schema
  function collectFieldPaths(schema: z.ZodType, path: string[] = []): string[] {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      return Object.entries(shape).flatMap(([key, value]) => {
        const currentPath = [...path, key];
        
        if (value instanceof z.ZodObject) {
          return collectFieldPaths(value, currentPath);
        } else if (value instanceof z.ZodArray) {
          const itemSchema = value._def.type;
          if (itemSchema instanceof z.ZodObject) {
            return collectFieldPaths(itemSchema, [...currentPath, "*"]);
          }
          return [currentPath.join(".")];
        } else if (value instanceof z.ZodRecord) {
          const valueSchema = value._def.valueType;
          if (valueSchema instanceof z.ZodObject) {
            return collectFieldPaths(valueSchema, [...currentPath, "*"]);
          }
          return [currentPath.join(".")];
        } else {
          return [currentPath.join(".")];
        }
      });
    }
    return [];
  }
  
  // Check each schema
  for (const schema of allSchemas) {
    const fieldPaths = collectFieldPaths(schema);
    
    for (const fieldPath of fieldPaths) {
      // Handle array indices by replacing them with wildcards
      const normalizedPath = fieldPath.replace(/\.\d+(\.|$)/g, ".*$1");
      
      if (!mappingKeys.includes(normalizedPath)) {
        missingMappings.push(normalizedPath);
      }
    }
  }
  
  return {
    valid: missingMappings.length === 0,
    missing: missingMappings
  };
}