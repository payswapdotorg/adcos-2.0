# Field to Authority Mapping

This document maps every field in the ADCOS contracts to its corresponding authority model row as defined in `spec/authority-model.md`.

## Mapping Principles

1. **No Provider Secrets**: Contract types carry no credential fields
2. **Opaque Payment References**: Payments are reference + provenance only
3. **Authority Separation**: Each field maps to exactly one authority row
4. **No Parallel Authority**: No field carries both payment and connectivity authority

## Complete Field Mapping

### Resource & Instance References

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| ResourceProjection.id | resource-identity | Stable ID for resource projection |
| ResourceProjection.owner | principal-identity | Owner principal reference |
| ResourceProjection.deviceRef | device-identity | Device instance reference |
| ResourceProjection.type | resource-classification | Type classification of resource |
| ResourceProjection.capability | capability-registry | Capability/version identifier |
| ResourceProjection.version | version-control | Version control for resource |
| ResourceProjection.modes | access-control | Access mode definitions |
| ResourceProjection.limits | resource-policy | Resource usage limits |
| ResourceProjection.status | resource-state | Current status of resource |
| ResourceProjection.freshness | freshness-guarantee | Freshness guarantee timestamp |
| ResourceProjection.evidenceRefs | evidence-chain | References to evidence |
| ResourceProjection.revocationState | revocation-registry | Revocation state tracking |
| InstanceIdentity.instanceId | instance-identity | Unique instance identifier |
| InstanceIdentity.principalRef | principal-identity | Associated principal |
| InstanceIdentity.deviceRef | device-identity | Device instance reference |
| InstanceIdentity.status | instance-state | Current instance state |

### Capability Observation

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| CapabilityObservation.declared | capability-declaration | Declared capability values |
| CapabilityObservation.observed | capability-measurement | Observed capability values |
| CapabilityObservation.evidenceClass | evidence-classification | Classification of evidence |
| CapabilityObservation.timestamp | event-timestamp | Observation timestamp |
| CapabilityObservation.freshness | freshness-guarantee | Freshness guarantee |

### Cross-Device Envelope

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| Envelope.schemaVersion | schema-version | Schema version identifier |
| Envelope.eventId | event-identity | Unique event identifier |
| Envelope.commandId | command-identity | Command identifier |
| Envelope.senderInstanceId | instance-identity | Sender instance reference |
| Envelope.receiverInstanceId | instance-identity | Receiver instance reference |
| Envelope.scope | scope-determination | Message scope classification |
| Envelope.issueTime | event-timestamp | Message issue timestamp |
| Envelope.expiryTime | expiry-control | Message expiry timestamp |
| Envelope.correlationId | correlation-tracking | Correlation identifier |
| Envelope.causationId | causation-tracking | Causation identifier |
| Envelope.idempotencyKey | idempotency-control | Idempotency key for dedup |
| Envelope.payloadDigest | integrity-check | Payload digest for integrity |
| Envelope.authorizationRef | authority-reference | Authorization reference |
| Envelope.policyEpoch | policy-version | Policy epoch identifier |
| Envelope.signature | authenticity-proof | Digital signature |

### Task Fields

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| Task.leaseDuration | time-boxing | Task lease duration |
| Task.deadline | deadline-enforcement | Task deadline |
| Task.retryBudget | retry-control | Retry budget management |
| Task.cancellation | cancellation-control | Cancellation control |
| Task.delegationRef | delegation-reference | Delegation reference |
| Task.attenuation | authority-attenuation | Authority attenuation |
| Task.revocation | revocation-control | Revocation control |

### Inbox/Outbox + Event Lifecycle

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| InboxMessage.ackStatus | acknowledgment-tracking | Acknowledgment status |
| InboxMessage.retryCount | retry-control | Retry counter |
| InboxMessage.dedupKey | deduplication-control | Deduplication key |
| InboxMessage.sequence | ordering-control | Message sequence number |
| InboxMessage.deadLetter | error-handling | Dead letter handling |
| InboxMessage.reconciliation | state-reconciliation | State reconciliation |
| OutboxMessage.status | transmission-status | Transmission status |
| OutboxMessage.attempts | retry-control | Attempt counter |
| OutboxMessage.lastAttempt | retry-timing | Last attempt timestamp |
| EventLifecycle.state | event-state | Event lifecycle state |
| EventLifecycle.transitions | state-transition | State transitions |
| EventLifecycle.effects | effect-tracking | Domain effects tracking |

### Organization

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| Organization.candidate | candidate-identity | Candidate identity |
| Organization.membership | membership-control | Membership control |
| Organization.mandate | authority-delegation | Mandate definition |

### Group Purchasing

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| GroupPurchase.state | purchase-state | Purchase state machine |
| GroupPurchase.threshold | threshold-control | Threshold requirements |
| GroupPurchase.expiry | expiry-control | Purchase expiry |
| GroupPurchase.withdrawal | withdrawal-control | Withdrawal control |
| GroupPurchase.cancellation | cancellation-control | Cancellation control |

### Opportunity Evidence

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| OpportunityEvidence.labComparison | evidence-comparison | Lab comparison evidence |
| OpportunityEvidence.noChangeOption | baseline-comparison | No-change baseline |
| OpportunityEvidence.cost | cost-assessment | Cost assessment |
| OpportunityEvidence.confidence | confidence-assessment | Confidence assessment |

### Status/Error/Freshness

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| Status.code | status-code | Status code |
| Status.message | status-message | Status message |
| Status.timestamp | event-timestamp | Status timestamp |
| Status.freshness | freshness-guarantee | Freshness guarantee |
| Status.details | status-details | Status details |
| Error.code | error-code | Error code |
| Error.message | error-message | Error message |
| Error.timestamp | event-timestamp | Error timestamp |
| Error.details | error-details | Error details |
| Error.recovery | recovery-strategy | Recovery strategy |
| PaymentReference.reference | payment-reference | Opaque payment reference |
| PaymentReference.provenance | provenance-tracking | Payment provenance |

### Public Ports

| Field | Authority Model Row | Description |
|-------|-------------------|-------------|
| Port.adapterId | adapter-identity | Adapter identifier |
| Port.capabilities | capability-interface | Capability interface |
| Port.version | version-control | Port version |
| Port.endpoints | endpoint-definition | Endpoint definitions |
| Port.security | security-profile | Security profile |

## Validation

All contract types have been validated against this mapping to ensure:
- No provider secrets are present
- No parallel payment or connectivity authority
- All fields map to exactly one authority row
- Opaque payment references are used throughout

## Compliance

This mapping satisfies the requirements from:
- ADR-0004: Opaque Payment References
- ADR-0001: Adapter-Facing Port
- ADR-0002: Authority-Agnostic Principals
- W3's five binding pins from P0-W3