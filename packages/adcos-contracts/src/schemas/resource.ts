import { z } from "zod";

// ============================================================================
// Resource & Instance References + Capability Observation
// ============================================================================

/**
 * Evidence class vocabulary - single closed vocabulary for ADCOS 2.0
 */
export const EvidenceClassSchema = z.enum([
  "OWNER_DECLARATION",
  "OBSERVATION",
  "PROVIDER_COMMITMENT",
  "DERIVED",
  "LAB_RESULT",
  "MEASUREMENT",
  "POLICY_EVAL",
]);

export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

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
  limits: z.record(z.string(), z.number()), // capacity/schedule limits
  status: z.enum(["UNKNOWN", "STALE", "DEGRADED", "FAILED", "REJECTED", "TERMINATED"]),
  freshness: z.number().optional(), // timestamp
  evidence: z.array(z.string()).optional(), // evidence reference list
  revoked: z.boolean().default(false),
});

export type ResourceProjectionReference = z.infer<typeof ResourceProjectionReferenceSchema>;

/**
 * Instance identity reference - distinct from principal
 */
export const InstanceIdentityReferenceSchema = z.object({
  id: z.string(), // stable instance ID
  principal: z.string(), // principal reference
  device: z.string(), // device reference
  type: z.enum(["USER", "ORGANIZATION", "AGENT", "DEVICE"]),
  capabilities: z.array(z.string()),
});

export type InstanceIdentityReference = z.infer<typeof InstanceIdentityReferenceSchema>;

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
      timezone: z.string().optional(),
    }),
    limits: z.record(z.string(), z.number()),
    beneficiaries: z.array(z.string()).optional(),
  }),
  observed: z.object({
    capability: z.string().optional(),
    version: z.string().optional(),
    status: z.enum(["UNKNOWN", "STALE", "DEGRADED", "FAILED", "REJECTED", "TERMINATED"]),
    freshness: z.number().optional(),
    evidence: z.array(z.string()).optional(),
  }),
  evidenceClass: EvidenceClassSchema,
});

export type CapabilityObservation = z.infer<typeof CapabilityObservationSchema>;
