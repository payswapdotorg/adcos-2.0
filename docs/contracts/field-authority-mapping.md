# Field → Authority Mapping

Generated from `packages/adcos-contracts/src/authority-concerns.ts` (`FieldAuthorityMapping`) — the code table is the single source of truth; regenerate this document when the table changes. Each row maps one contract field to exactly one authority concern derived from `spec/authority-model.md`.

## Mapping principles

1. **Closed vocabulary** — every value is one of the `13` authority concerns below; anything else fails `validateFieldAuthorityMappings()`.
2. **No provider secrets in canonical entities** — the `provider-adapter` concern appears only on Port config fields (`ShareNetPort.auth.credentials`); canonical entity fields never carry provider credentials.
3. **Opaque payment references** — `PaymentReference` fields are payment-system references only, never a competing ledger.
4. **Full coverage** — every traversable field of every canonical schema has a row; stale rows (matching no real field path) also fail validation.
5. **Reference fields are leaves** — embedded exported schemas (e.g. `Message.envelope`) are references, not structural expansions.

## Authority concerns (vocabulary)

| Concern                        | Meaning (spec/authority-model.md row)                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `zcode-substrate`              | ZCode runtime/platform/tool/workflow APIs (inherited substrate until explicitly migrated)         |
| `product-domain`               | ADCOS 2.0 product domain (surfaces, preferences, control-plane records)                           |
| `identity-trust-authority`     | Approved identity/trust authority; principals, device enrollment, authorizations                  |
| `resource-owner`               | Resource owner (opt-in, schedule, limits, pause/revoke, contributor experience)                   |
| `provider-connectivity-domain` | Existing ADCOS provider/connectivity domain and providers                                         |
| `adcos-connectivity`           | payswapdotorg/ADCOS (ConnectivityIntent/Contract/ExecutionPlan, usage evidence — references only) |
| `provider-adapter`             | Underlying provider/adapter (native routing, subscriber state, credentials — PORT CONFIG ONLY)    |
| `sharenet`                     | payswapdotorg/ShareNet (circuits/routes/content semantics, contribution accounting)               |
| `roamlink`                     | payswapdotorg/RoamLink bounded-domain semantics (reference only)                                  |
| `unicom-commerce`              | payswapdotorg/UniCom group-buy discovery/commerce reference patterns                              |
| `lab-advisory`                 | ADCOS 2.0 Reality Lab advisory domain (strategies, Organizations, opportunities evidence)         |
| `payment-system`               | Authorized financial/payment system (actual transaction/finality — references only)               |
| `organization-contract`        | Organization/member authority defined by the accepted product contract                            |

## Complete field mapping

### ResourceProjectionReference

| Field                                    | Authority concern          |
| ---------------------------------------- | -------------------------- |
| `ResourceProjectionReference.id`         | `resource-owner`           |
| `ResourceProjectionReference.owner`      | `identity-trust-authority` |
| `ResourceProjectionReference.device`     | `identity-trust-authority` |
| `ResourceProjectionReference.type`       | `resource-owner`           |
| `ResourceProjectionReference.capability` | `resource-owner`           |
| `ResourceProjectionReference.modes`      | `resource-owner`           |
| `ResourceProjectionReference.limits`     | `resource-owner`           |
| `ResourceProjectionReference.status`     | `resource-owner`           |
| `ResourceProjectionReference.freshness`  | `resource-owner`           |
| `ResourceProjectionReference.evidence`   | `resource-owner`           |
| `ResourceProjectionReference.revoked`    | `resource-owner`           |

### InstanceIdentityReference

| Field                                    | Authority concern          |
| ---------------------------------------- | -------------------------- |
| `InstanceIdentityReference.id`           | `identity-trust-authority` |
| `InstanceIdentityReference.principal`    | `identity-trust-authority` |
| `InstanceIdentityReference.device`       | `identity-trust-authority` |
| `InstanceIdentityReference.type`         | `identity-trust-authority` |
| `InstanceIdentityReference.capabilities` | `identity-trust-authority` |

### CapabilityObservation

| Field                                              | Authority concern |
| -------------------------------------------------- | ----------------- |
| `CapabilityObservation.declared.capability`        | `resource-owner`  |
| `CapabilityObservation.declared.version`           | `resource-owner`  |
| `CapabilityObservation.declared.schedule.start`    | `resource-owner`  |
| `CapabilityObservation.declared.schedule.end`      | `resource-owner`  |
| `CapabilityObservation.declared.schedule.timezone` | `resource-owner`  |
| `CapabilityObservation.declared.limits`            | `resource-owner`  |
| `CapabilityObservation.declared.beneficiaries`     | `resource-owner`  |
| `CapabilityObservation.observed.capability`        | `resource-owner`  |
| `CapabilityObservation.observed.version`           | `resource-owner`  |
| `CapabilityObservation.observed.status`            | `resource-owner`  |
| `CapabilityObservation.observed.freshness`         | `resource-owner`  |
| `CapabilityObservation.observed.evidence`          | `resource-owner`  |
| `CapabilityObservation.evidenceClass`              | `product-domain`  |

### Envelope

| Field                       | Authority concern          |
| --------------------------- | -------------------------- |
| `Envelope.schema`           | `product-domain`           |
| `Envelope.eventId`          | `product-domain`           |
| `Envelope.commandId`        | `product-domain`           |
| `Envelope.sender`           | `identity-trust-authority` |
| `Envelope.receiver`         | `identity-trust-authority` |
| `Envelope.scope`            | `product-domain`           |
| `Envelope.issuedAt`         | `product-domain`           |
| `Envelope.expiresAt`        | `product-domain`           |
| `Envelope.correlationId`    | `product-domain`           |
| `Envelope.causationId`      | `product-domain`           |
| `Envelope.idempotencyKey`   | `product-domain`           |
| `Envelope.payloadDigest`    | `product-domain`           |
| `Envelope.authorizationRef` | `identity-trust-authority` |
| `Envelope.delegationRef`    | `identity-trust-authority` |
| `Envelope.policyEpoch`      | `product-domain`           |
| `Envelope.signature`        | `identity-trust-authority` |

### TaskLease

| Field                            | Authority concern |
| -------------------------------- | ----------------- |
| `TaskLease.deadline`             | `product-domain`  |
| `TaskLease.retryBudget`          | `product-domain`  |
| `TaskLease.cancellationDeadline` | `product-domain`  |
| `TaskLease.cancellationReason`   | `product-domain`  |

### Delegation

| Field                         | Authority concern          |
| ----------------------------- | -------------------------- |
| `Delegation.id`               | `product-domain`           |
| `Delegation.principal`        | `identity-trust-authority` |
| `Delegation.delegate`         | `identity-trust-authority` |
| `Delegation.scope`            | `product-domain`           |
| `Delegation.issuedAt`         | `product-domain`           |
| `Delegation.expiresAt`        | `product-domain`           |
| `Delegation.attenuation`      | `product-domain`           |
| `Delegation.revoked`          | `product-domain`           |
| `Delegation.revocationReason` | `product-domain`           |

### EventLifecycle

| Field                             | Authority concern |
| --------------------------------- | ----------------- |
| `EventLifecycle.state`            | `product-domain`  |
| `EventLifecycle.attempts`         | `product-domain`  |
| `EventLifecycle.lastAttemptAt`    | `product-domain`  |
| `EventLifecycle.nextRetryAt`      | `product-domain`  |
| `EventLifecycle.maxRetries`       | `product-domain`  |
| `EventLifecycle.ackState`         | `product-domain`  |
| `EventLifecycle.deadLetterReason` | `product-domain`  |

### Message

| Field               | Authority concern |
| ------------------- | ----------------- |
| `Message.id`        | `product-domain`  |
| `Message.envelope`  | `product-domain`  |
| `Message.payload`   | `product-domain`  |
| `Message.lifecycle` | `product-domain`  |
| `Message.createdAt` | `product-domain`  |
| `Message.updatedAt` | `product-domain`  |

### OrganizationCandidate

| Field                                | Authority concern       |
| ------------------------------------ | ----------------------- |
| `OrganizationCandidate.id`           | `organization-contract` |
| `OrganizationCandidate.name`         | `organization-contract` |
| `OrganizationCandidate.description`  | `organization-contract` |
| `OrganizationCandidate.principals`   | `organization-contract` |
| `OrganizationCandidate.requirements` | `organization-contract` |
| `OrganizationCandidate.capacity`     | `organization-contract` |
| `OrganizationCandidate.expiresAt`    | `organization-contract` |

### OrganizationMembership

| Field                                     | Authority concern       |
| ----------------------------------------- | ----------------------- |
| `OrganizationMembership.id`               | `organization-contract` |
| `OrganizationMembership.organization`     | `organization-contract` |
| `OrganizationMembership.principal`        | `organization-contract` |
| `OrganizationMembership.state`            | `organization-contract` |
| `OrganizationMembership.role`             | `organization-contract` |
| `OrganizationMembership.joinedAt`         | `organization-contract` |
| `OrganizationMembership.expiresAt`        | `organization-contract` |
| `OrganizationMembership.revoked`          | `organization-contract` |
| `OrganizationMembership.revocationReason` | `organization-contract` |

### OrganizationMandate

| Field                              | Authority concern       |
| ---------------------------------- | ----------------------- |
| `OrganizationMandate.id`           | `organization-contract` |
| `OrganizationMandate.organization` | `organization-contract` |
| `OrganizationMandate.principal`    | `organization-contract` |
| `OrganizationMandate.scope`        | `organization-contract` |
| `OrganizationMandate.permissions`  | `organization-contract` |
| `OrganizationMandate.issuedAt`     | `organization-contract` |
| `OrganizationMandate.expiresAt`    | `organization-contract` |
| `OrganizationMandate.revoked`      | `organization-contract` |

### GroupPurchaseRequest

| Field                               | Authority concern       |
| ----------------------------------- | ----------------------- |
| `GroupPurchaseRequest.id`           | `product-domain`        |
| `GroupPurchaseRequest.intent`       | `product-domain`        |
| `GroupPurchaseRequest.organization` | `organization-contract` |
| `GroupPurchaseRequest.requirements` | `product-domain`        |
| `GroupPurchaseRequest.participants` | `organization-contract` |
| `GroupPurchaseRequest.threshold`    | `organization-contract` |
| `GroupPurchaseRequest.expiresAt`    | `product-domain`        |

### GroupPurchaseOffer

| Field                                             | Authority concern              |
| ------------------------------------------------- | ------------------------------ |
| `GroupPurchaseOffer.id`                           | `product-domain`               |
| `GroupPurchaseOffer.request`                      | `product-domain`               |
| `GroupPurchaseOffer.supplier`                     | `unicom-commerce`              |
| `GroupPurchaseOffer.product`                      | `unicom-commerce`              |
| `GroupPurchaseOffer.capability`                   | `provider-connectivity-domain` |
| `GroupPurchaseOffer.region`                       | `product-domain`               |
| `GroupPurchaseOffer.quantity`                     | `product-domain`               |
| `GroupPurchaseOffer.perMemberCost`                | `payment-system`               |
| `GroupPurchaseOffer.totalCost`                    | `payment-system`               |
| `GroupPurchaseOffer.recurringCharges.amount`      | `payment-system`               |
| `GroupPurchaseOffer.recurringCharges.frequency`   | `payment-system`               |
| `GroupPurchaseOffer.recurringCharges.description` | `payment-system`               |
| `GroupPurchaseOffer.oneTimeCharges.amount`        | `payment-system`               |
| `GroupPurchaseOffer.oneTimeCharges.description`   | `payment-system`               |
| `GroupPurchaseOffer.term`                         | `product-domain`               |
| `GroupPurchaseOffer.limitations`                  | `product-domain`               |
| `GroupPurchaseOffer.expiry`                       | `product-domain`               |
| `GroupPurchaseOffer.provenance`                   | `unicom-commerce`              |

### GroupPurchaseCommitment

| Field                                 | Authority concern       |
| ------------------------------------- | ----------------------- |
| `GroupPurchaseCommitment.id`          | `product-domain`        |
| `GroupPurchaseCommitment.request`     | `product-domain`        |
| `GroupPurchaseCommitment.offer`       | `product-domain`        |
| `GroupPurchaseCommitment.participant` | `organization-contract` |
| `GroupPurchaseCommitment.allocation`  | `organization-contract` |
| `GroupPurchaseCommitment.acceptedAt`  | `organization-contract` |
| `GroupPurchaseCommitment.expiresAt`   | `product-domain`        |
| `GroupPurchaseCommitment.revoked`     | `organization-contract` |

### LabComparisonEvidence

| Field                                        | Authority concern |
| -------------------------------------------- | ----------------- |
| `LabComparisonEvidence.id`                   | `lab-advisory`    |
| `LabComparisonEvidence.intent`               | `lab-advisory`    |
| `LabComparisonEvidence.baseline`             | `lab-advisory`    |
| `LabComparisonEvidence.alternatives`         | `lab-advisory`    |
| `LabComparisonEvidence.noChange.cost`        | `lab-advisory`    |
| `LabComparisonEvidence.noChange.reliability` | `lab-advisory`    |
| `LabComparisonEvidence.noChange.utilization` | `lab-advisory`    |
| `LabComparisonEvidence.selected.strategy`    | `lab-advisory`    |
| `LabComparisonEvidence.selected.cost`        | `lab-advisory`    |
| `LabComparisonEvidence.selected.reliability` | `lab-advisory`    |
| `LabComparisonEvidence.selected.utilization` | `lab-advisory`    |
| `LabComparisonEvidence.selected.confidence`  | `lab-advisory`    |
| `LabComparisonEvidence.selected.assumptions` | `lab-advisory`    |
| `LabComparisonEvidence.comparison`           | `lab-advisory`    |
| `LabComparisonEvidence.evaluatedAt`          | `lab-advisory`    |
| `LabComparisonEvidence.expiresAt`            | `lab-advisory`    |

### OpportunityEvidence

| Field                                | Authority concern |
| ------------------------------------ | ----------------- |
| `OpportunityEvidence.id`             | `lab-advisory`    |
| `OpportunityEvidence.intent`         | `lab-advisory`    |
| `OpportunityEvidence.evidence`       | `lab-advisory`    |
| `OpportunityEvidence.confidence`     | `lab-advisory`    |
| `OpportunityEvidence.cost`           | `lab-advisory`    |
| `OpportunityEvidence.benefit`        | `lab-advisory`    |
| `OpportunityEvidence.risk`           | `lab-advisory`    |
| `OpportunityEvidence.recommendation` | `lab-advisory`    |
| `OpportunityEvidence.expiresAt`      | `lab-advisory`    |

### Status

| Field               | Authority concern |
| ------------------- | ----------------- |
| `Status.state`      | `product-domain`  |
| `Status.code`       | `product-domain`  |
| `Status.message`    | `product-domain`  |
| `Status.freshness`  | `product-domain`  |
| `Status.retryAfter` | `product-domain`  |
| `Status.reconcile`  | `product-domain`  |

### PaymentReference

| Field                        | Authority concern |
| ---------------------------- | ----------------- |
| `PaymentReference.id`        | `payment-system`  |
| `PaymentReference.type`      | `payment-system`  |
| `PaymentReference.authority` | `payment-system`  |
| `PaymentReference.created`   | `payment-system`  |
| `PaymentReference.expires`   | `payment-system`  |
| `PaymentReference.amount`    | `payment-system`  |
| `PaymentReference.currency`  | `payment-system`  |
| `PaymentReference.settled`   | `payment-system`  |

### ShareNetPort

| Field                           | Authority concern  |
| ------------------------------- | ------------------ |
| `ShareNetPort.endpoint`         | `sharenet`         |
| `ShareNetPort.capabilities`     | `sharenet`         |
| `ShareNetPort.auth.provider`    | `sharenet`         |
| `ShareNetPort.auth.credentials` | `provider-adapter` |

### AdcosPort

| Field                    | Authority concern |
| ------------------------ | ----------------- |
| `AdcosPort.version`      | `product-domain`  |
| `AdcosPort.capabilities` | `product-domain`  |
| `AdcosPort.endpoints`    | `product-domain`  |
| `AdcosPort.auth.methods` | `product-domain`  |
| `AdcosPort.auth.scopes`  | `product-domain`  |

## Validation

Run `validateFieldAuthorityMappings()` (exported from `@adcos/contracts`) or the package test suite; the meta-tests in `test/authority-mapping.test.ts` assert full coverage, no stale rows, closed vocabulary and the no-secrets boundary.
