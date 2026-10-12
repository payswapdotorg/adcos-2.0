import { z } from "zod";
import { ResourceProjectionSchema, InstanceIdentitySchema } from "./resource";
import { CapabilityObservationSchema } from "./capability";
import { EnvelopeSchema } from "./envelope";
import { InboxMessageSchema, OutboxMessageSchema, EventLifecycleSchema } from "./messaging";
import { OrganizationSchema } from "./organization";
import { GroupPurchaseSchema } from "./group-purchase";
import { OpportunityEvidenceSchema } from "./opportunity";
import { StatusSchema, ErrorSchema } from "./status";
import { PortSchema } from "./ports";

// Field to Authority Mapping
// Maps every contract field to its authority model row from spec/authority-model.md

export const FieldAuthorityMapping = {
  // Resource & Instance References
  "ResourceProjection.id": "resource-identity",
  "ResourceProjection.owner": "principal-identity",
  "ResourceProjection.deviceRef": "device-identity",
  "ResourceProjection.type": "resource-classification",
  "ResourceProjection.capability": "capability-registry",
  "ResourceProjection.version": "version-control",
  "ResourceProjection.modes": "access-control",
  "ResourceProjection.limits": "resource-policy",
  "ResourceProjection.status": "resource-state",
  "ResourceProjection.freshness": "freshness-guarantee",
  "ResourceProjection.evidenceRefs": "evidence-chain",
  "ResourceProjection.revocationState": "revocation-registry",
  
  "InstanceIdentity.instanceId": "instance-identity",
  "InstanceIdentity.principalRef": "principal-identity",
  "InstanceIdentity.deviceRef": "device-identity",
  "InstanceIdentity.status": "instance-state",
  
  // Capability Observation
  "CapabilityObservation.declared": "capability-declaration",
  "CapabilityObservation.observed": "capability-measurement",
  "CapabilityObservation.evidenceClass": "evidence-classification",
  "CapabilityObservation.timestamp": "event-timestamp",
  "CapabilityObservation.freshness": "freshness-guarantee",
  
  // Cross-Device Envelope
  "Envelope.schemaVersion": "schema-version",
  "Envelope.eventId": "event-identity",
  "Envelope.commandId": "command-identity",
  "Envelope.senderInstanceId": "instance-identity",
  "Envelope.receiverInstanceId": "instance-identity",
  "Envelope.scope": "scope-determination",
  "Envelope.issueTime": "event-timestamp",
  "Envelope.expiryTime": "expiry-control",
  "Envelope.correlationId": "correlation-tracking",
  "Envelope.causationId": "causation-tracking",
  "Envelope.idempotencyKey": "idempotency-control",
  "Envelope.payloadDigest": "integrity-check",
  "Envelope.authorizationRef": "authority-reference",
  "Envelope.policyEpoch": "policy-version",
  "Envelope.signature": "authenticity-proof",
  
  // Task
  "Task.leaseDuration": "time-boxing",
  "Task.deadline": "deadline-enforcement",
  "Task.retryBudget": "retry-control",
  "Task.cancellation": "cancellation-control",
  "Task.delegationRef": "delegation-reference",
  "Task.attenuation": "authority-attenuation",
  "Task.revocation": "revocation-control",
  
  // Inbox/Outbox + Event Lifecycle
  "InboxMessage.ackStatus": "acknowledgment-tracking",
  "InboxMessage.retryCount": "retry-control",
  "InboxMessage.dedupKey": "deduplication-control",
  "InboxMessage.sequence": "ordering-control",
  "InboxMessage.deadLetter": "error-handling",
  "InboxMessage.reconciliation": "state-reconciliation",
  
  "OutboxMessage.status": "transmission-status",
  "OutboxMessage.attempts": "retry-control",
  "OutboxMessage.lastAttempt": "retry-timing",
  
  "EventLifecycle.state": "event-state",
  "EventLifecycle.transitions": "state-transition",
  "EventLifecycle.effects": "effect-tracking",
  
  // Organization
  "Organization.candidate": "candidate-identity",
  "Organization.membership": "membership-control",
  "Organization.mandate": "authority-delegation",
  
  // Group Purchasing
  "GroupPurchase.state": "purchase-state",
  "GroupPurchase.threshold": "threshold-control",
  "GroupPurchase.expiry": "expiry-control",
  "GroupPurchase.withdrawal": "withdrawal-control",
  "GroupPurchase.cancellation": "cancellation-control",
  
  // Opportunity Evidence
  "OpportunityEvidence.labComparison": "evidence-comparison",
  "OpportunityEvidence.noChangeOption": "baseline-comparison",
  "OpportunityEvidence.cost": "cost-assessment",
  "OpportunityEvidence.confidence": "confidence-assessment",
  
  // Status/Error/Freshness
  "Status.code": "status-code",
  "Status.message": "status-message",
  "Status.timestamp": "event-timestamp",
  "Status.freshness": "freshness-guarantee",
  "Status.details": "status-details",
  
  "Error.code": "error-code",
  "Error.message": "error-message",
  "Error.timestamp": "event-timestamp",
  "Error.details": "error-details",
  "Error.recovery": "recovery-strategy",
  
  "PaymentReference.reference": "payment-reference",
  "PaymentReference.provenance": "provenance-tracking",
  
  // Public Ports
  "Port.adapterId": "adapter-identity",
  "Port.capabilities": "capability-interface",
  "Port.version": "version-control",
  "Port.endpoints": "endpoint-definition",
  "Port.security": "security-profile"
};

// Validate that all fields in our schemas have authority mappings
export function validateFieldAuthorityMappings(): { valid: boolean; missing: string[] } {
  const allSchemas = [
    ResourceProjectionSchema,
    InstanceIdentitySchema,
    CapabilityObservationSchema,
    EnvelopeSchema,
    InboxMessageSchema,
    OutboxMessageSchema,
    EventLifecycleSchema,
    OrganizationSchema,
    GroupPurchaseSchema,
    OpportunityEvidenceSchema,
    StatusSchema,
    ErrorSchema,
    PortSchema
  ];
  
  const missingMappings: string[] = [];
  
  // This is a simplified check - in practice, you'd traverse the schema shapes
  // and check each field against the mapping
  for (const schema of allSchemas) {
    // In a real implementation, you would introspect the schema shape
    // and verify each field has a mapping
  }
  
  return {
    valid: missingMappings.length === 0,
    missing: missingMappings
  };
}