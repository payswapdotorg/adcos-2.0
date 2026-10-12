import { z } from "zod";
import { SchemaVersionSchema } from "../versioning.js";

// ============================================================================
// Cross-Device Envelope / Task / Delegation + Inbox/Outbox & Event Lifecycle
// ============================================================================

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
  signature: z.string().optional(), // signature placeholder
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

/**
 * Task lease/deadline/retry-budget/cancellation
 */
export const TaskLeaseSchema = z.object({
  deadline: z.number(), // absolute deadline timestamp
  retryBudget: z.number().optional(), // remaining retry attempts
  cancellationDeadline: z.number().optional(), // when task can be cancelled
  cancellationReason: z.string().optional(), // reason for cancellation
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
  attenuation: z.record(z.string(), z.string()).optional(), // restrictions on delegated authority
  revoked: z.boolean().default(false),
  revocationReason: z.string().optional(),
});

export type Delegation = z.infer<typeof DelegationSchema>;

/**
 * Acknowledgement states
 */
export const AckStateSchema = z.enum(["PENDING", "ACKNOWLEDGED", "REJECTED", "FAILED"]);

export type AckState = z.infer<typeof AckStateSchema>;

/**
 * Event lifecycle states
 */
export const EventLifecycleSchema = z.object({
  state: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REJECTED", "CANCELLED"]),
  attempts: z.number().default(0),
  lastAttemptAt: z.number().optional(),
  nextRetryAt: z.number().optional(),
  maxRetries: z.number().default(3),
  ackState: AckStateSchema.optional(),
  deadLetterReason: z.string().optional(),
});

export type EventLifecycle = z.infer<typeof EventLifecycleSchema>;

/**
 * Inbox/outbox message
 */
export const MessageSchema = z.object({
  id: z.string(),
  envelope: EnvelopeSchema,
  payload: z.record(z.string(), z.unknown()),
  lifecycle: EventLifecycleSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Message = z.infer<typeof MessageSchema>;
