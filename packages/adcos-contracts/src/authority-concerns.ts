// ============================================================================
// Field → Authority mapping: vocabulary + table (data only, no schema imports)
// ============================================================================
// Every field of every canonical contract schema maps to exactly one
// authority concern derived from spec/authority-model.md. The values form a
// CLOSED vocabulary: a mapping row referencing anything outside
// AUTHORITY_CONCERNS is invalid by definition. The table is validated
// against the real zod schemas by ./authority-mapping.ts (validator).

/**
 * Closed vocabulary of authority concerns — one per row of the authority
 * model in spec/authority-model.md.
 */
export const AUTHORITY_CONCERNS = [
  "zcode-substrate", // ZCode runtime/platform/tool/workflow APIs
  "product-domain", // ADCOS 2.0 product domain (surfaces, prefs, control-plane records)
  "identity-trust-authority", // principals, device enrollment, authorizations
  "resource-owner", // resource sharing preferences/limits/opt-in/revocation
  "provider-connectivity-domain", // provider capabilities/offers/eligibility
  "adcos-connectivity", // ConnectivityIntent/Contract/ExecutionPlan/usage evidence (ADCOS)
  "provider-adapter", // provider-native routing/state/credentials — PORT CONFIG ONLY
  "sharenet", // ShareNet circuits/routes/contribution accounting
  "roamlink", // RoamLink bounded-domain semantics (reference only)
  "unicom-commerce", // group-buy discovery/commerce reference patterns
  "lab-advisory", // Reality Lab strategies/Organizations/opportunities evidence
  "payment-system", // actual payment transaction/finality (references only)
  "organization-contract", // group membership and member mandate
] as const;

export type AuthorityConcern = (typeof AUTHORITY_CONCERNS)[number];

/**
 * Field → authority-concern table. Keys are `Entity.field[.subfield…]`
 * paths matching the real zod schema shapes (validated, not trusted).
 */
export const FieldAuthorityMapping: Record<string, AuthorityConcern> = {
  // Resource & Instance References
  "ResourceProjectionReference.id": "resource-owner",
  "ResourceProjectionReference.owner": "identity-trust-authority",
  "ResourceProjectionReference.device": "identity-trust-authority",
  "ResourceProjectionReference.type": "resource-owner",
  "ResourceProjectionReference.capability": "resource-owner",
  "ResourceProjectionReference.modes": "resource-owner",
  "ResourceProjectionReference.limits": "resource-owner",
  "ResourceProjectionReference.status": "resource-owner",
  "ResourceProjectionReference.freshness": "resource-owner",
  "ResourceProjectionReference.evidence": "resource-owner",
  "ResourceProjectionReference.revoked": "resource-owner",

  "InstanceIdentityReference.id": "identity-trust-authority",
  "InstanceIdentityReference.principal": "identity-trust-authority",
  "InstanceIdentityReference.device": "identity-trust-authority",
  "InstanceIdentityReference.type": "identity-trust-authority",
  "InstanceIdentityReference.capabilities": "identity-trust-authority",

  // Capability Observation (declared by owner vs observed)
  "CapabilityObservation.declared.capability": "resource-owner",
  "CapabilityObservation.declared.version": "resource-owner",
  "CapabilityObservation.declared.schedule.start": "resource-owner",
  "CapabilityObservation.declared.schedule.end": "resource-owner",
  "CapabilityObservation.declared.schedule.timezone": "resource-owner",
  "CapabilityObservation.declared.limits": "resource-owner",
  "CapabilityObservation.declared.beneficiaries": "resource-owner",
  "CapabilityObservation.observed.capability": "resource-owner",
  "CapabilityObservation.observed.version": "resource-owner",
  "CapabilityObservation.observed.status": "resource-owner",
  "CapabilityObservation.observed.freshness": "resource-owner",
  "CapabilityObservation.observed.evidence": "resource-owner",
  "CapabilityObservation.evidenceClass": "product-domain",

  // Cross-Device Envelope
  "Envelope.schema": "product-domain",
  "Envelope.eventId": "product-domain",
  "Envelope.commandId": "product-domain",
  "Envelope.sender": "identity-trust-authority",
  "Envelope.receiver": "identity-trust-authority",
  "Envelope.scope": "product-domain",
  "Envelope.issuedAt": "product-domain",
  "Envelope.expiresAt": "product-domain",
  "Envelope.correlationId": "product-domain",
  "Envelope.causationId": "product-domain",
  "Envelope.idempotencyKey": "product-domain",
  "Envelope.payloadDigest": "product-domain",
  "Envelope.authorizationRef": "identity-trust-authority",
  "Envelope.delegationRef": "identity-trust-authority",
  "Envelope.policyEpoch": "product-domain",
  "Envelope.signature": "identity-trust-authority",

  // Task Lease
  "TaskLease.deadline": "product-domain",
  "TaskLease.retryBudget": "product-domain",
  "TaskLease.cancellationDeadline": "product-domain",
  "TaskLease.cancellationReason": "product-domain",

  // Delegation
  "Delegation.id": "product-domain",
  "Delegation.principal": "identity-trust-authority",
  "Delegation.delegate": "identity-trust-authority",
  "Delegation.scope": "product-domain",
  "Delegation.issuedAt": "product-domain",
  "Delegation.expiresAt": "product-domain",
  "Delegation.attenuation": "product-domain",
  "Delegation.revoked": "product-domain",
  "Delegation.revocationReason": "product-domain",

  // Event Lifecycle
  "EventLifecycle.state": "product-domain",
  "EventLifecycle.attempts": "product-domain",
  "EventLifecycle.lastAttemptAt": "product-domain",
  "EventLifecycle.nextRetryAt": "product-domain",
  "EventLifecycle.maxRetries": "product-domain",
  "EventLifecycle.ackState": "product-domain",
  "EventLifecycle.deadLetterReason": "product-domain",

  // Message (inbox/outbox)
  "Message.id": "product-domain",
  "Message.envelope": "product-domain",
  "Message.payload": "product-domain",
  "Message.lifecycle": "product-domain",
  "Message.createdAt": "product-domain",
  "Message.updatedAt": "product-domain",

  // Organization Candidate
  "OrganizationCandidate.id": "organization-contract",
  "OrganizationCandidate.name": "organization-contract",
  "OrganizationCandidate.description": "organization-contract",
  "OrganizationCandidate.principals": "organization-contract",
  "OrganizationCandidate.requirements": "organization-contract",
  "OrganizationCandidate.capacity": "organization-contract",
  "OrganizationCandidate.expiresAt": "organization-contract",

  // Organization Membership
  "OrganizationMembership.id": "organization-contract",
  "OrganizationMembership.organization": "organization-contract",
  "OrganizationMembership.principal": "organization-contract",
  "OrganizationMembership.state": "organization-contract",
  "OrganizationMembership.role": "organization-contract",
  "OrganizationMembership.joinedAt": "organization-contract",
  "OrganizationMembership.expiresAt": "organization-contract",
  "OrganizationMembership.revoked": "organization-contract",
  "OrganizationMembership.revocationReason": "organization-contract",

  // Organization Mandate
  "OrganizationMandate.id": "organization-contract",
  "OrganizationMandate.organization": "organization-contract",
  "OrganizationMandate.principal": "organization-contract",
  "OrganizationMandate.scope": "organization-contract",
  "OrganizationMandate.permissions": "organization-contract",
  "OrganizationMandate.issuedAt": "organization-contract",
  "OrganizationMandate.expiresAt": "organization-contract",
  "OrganizationMandate.revoked": "organization-contract",

  // Group Purchase Request
  "GroupPurchaseRequest.id": "product-domain",
  "GroupPurchaseRequest.intent": "product-domain",
  "GroupPurchaseRequest.organization": "organization-contract",
  "GroupPurchaseRequest.requirements": "product-domain",
  "GroupPurchaseRequest.participants": "organization-contract",
  "GroupPurchaseRequest.threshold": "organization-contract",
  "GroupPurchaseRequest.expiresAt": "product-domain",

  // Group Purchase Offer
  "GroupPurchaseOffer.id": "product-domain",
  "GroupPurchaseOffer.request": "product-domain",
  "GroupPurchaseOffer.supplier": "unicom-commerce",
  "GroupPurchaseOffer.product": "unicom-commerce",
  "GroupPurchaseOffer.capability": "provider-connectivity-domain",
  "GroupPurchaseOffer.region": "product-domain",
  "GroupPurchaseOffer.quantity": "product-domain",
  "GroupPurchaseOffer.perMemberCost": "payment-system",
  "GroupPurchaseOffer.totalCost": "payment-system",
  "GroupPurchaseOffer.recurringCharges.amount": "payment-system",
  "GroupPurchaseOffer.recurringCharges.frequency": "payment-system",
  "GroupPurchaseOffer.recurringCharges.description": "payment-system",
  "GroupPurchaseOffer.oneTimeCharges.amount": "payment-system",
  "GroupPurchaseOffer.oneTimeCharges.description": "payment-system",
  "GroupPurchaseOffer.term": "product-domain",
  "GroupPurchaseOffer.limitations": "product-domain",
  "GroupPurchaseOffer.expiry": "product-domain",
  "GroupPurchaseOffer.provenance": "unicom-commerce",

  // Group Purchase Commitment
  "GroupPurchaseCommitment.id": "product-domain",
  "GroupPurchaseCommitment.request": "product-domain",
  "GroupPurchaseCommitment.offer": "product-domain",
  "GroupPurchaseCommitment.participant": "organization-contract",
  "GroupPurchaseCommitment.allocation": "organization-contract",
  "GroupPurchaseCommitment.acceptedAt": "organization-contract",
  "GroupPurchaseCommitment.expiresAt": "product-domain",
  "GroupPurchaseCommitment.revoked": "organization-contract",

  // Lab Comparison Evidence
  "LabComparisonEvidence.id": "lab-advisory",
  "LabComparisonEvidence.intent": "lab-advisory",
  "LabComparisonEvidence.baseline": "lab-advisory",
  "LabComparisonEvidence.alternatives": "lab-advisory",
  "LabComparisonEvidence.noChange.cost": "lab-advisory",
  "LabComparisonEvidence.noChange.reliability": "lab-advisory",
  "LabComparisonEvidence.noChange.utilization": "lab-advisory",
  "LabComparisonEvidence.selected.strategy": "lab-advisory",
  "LabComparisonEvidence.selected.cost": "lab-advisory",
  "LabComparisonEvidence.selected.reliability": "lab-advisory",
  "LabComparisonEvidence.selected.utilization": "lab-advisory",
  "LabComparisonEvidence.selected.confidence": "lab-advisory",
  "LabComparisonEvidence.selected.assumptions": "lab-advisory",
  "LabComparisonEvidence.comparison": "lab-advisory",
  "LabComparisonEvidence.evaluatedAt": "lab-advisory",
  "LabComparisonEvidence.expiresAt": "lab-advisory",

  // Opportunity Evidence
  "OpportunityEvidence.id": "lab-advisory",
  "OpportunityEvidence.intent": "lab-advisory",
  "OpportunityEvidence.evidence": "lab-advisory",
  "OpportunityEvidence.confidence": "lab-advisory",
  "OpportunityEvidence.cost": "lab-advisory",
  "OpportunityEvidence.benefit": "lab-advisory",
  "OpportunityEvidence.risk": "lab-advisory",
  "OpportunityEvidence.recommendation": "lab-advisory",
  "OpportunityEvidence.expiresAt": "lab-advisory",

  // Status
  "Status.state": "product-domain",
  "Status.code": "product-domain",
  "Status.message": "product-domain",
  "Status.freshness": "product-domain",
  "Status.retryAfter": "product-domain",
  "Status.reconcile": "product-domain",

  // Payment Reference (opaque references only — never a competing ledger)
  "PaymentReference.id": "payment-system",
  "PaymentReference.type": "payment-system",
  "PaymentReference.authority": "payment-system",
  "PaymentReference.created": "payment-system",
  "PaymentReference.expires": "payment-system",
  "PaymentReference.amount": "payment-system",
  "PaymentReference.currency": "payment-system",
  "PaymentReference.settled": "payment-system",

  // ShareNet Port (adapter config — credentials legitimately live HERE only)
  "ShareNetPort.endpoint": "sharenet",
  "ShareNetPort.capabilities": "sharenet",
  "ShareNetPort.auth.provider": "sharenet",
  "ShareNetPort.auth.credentials": "provider-adapter",

  // ADCOS Port (our own public developer boundary)
  "AdcosPort.version": "product-domain",
  "AdcosPort.capabilities": "product-domain",
  "AdcosPort.endpoints": "product-domain",
  "AdcosPort.auth.methods": "product-domain",
  "AdcosPort.auth.scopes": "product-domain",
};
