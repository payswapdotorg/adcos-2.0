import { z } from "zod";
import { SchemaVersionSchema } from "../versioning.js";

// ============================================================================
// Public Ports (Adapter-Facing)
// ============================================================================

/**
 * ShareNet adapter port
 */
export const ShareNetPortSchema = z.object({
  endpoint: z.string(),
  capabilities: z.array(z.string()),
  auth: z.object({
    provider: z.string(),
    credentials: z.record(z.string(), z.unknown()),
  }),
});

export type ShareNetPort = z.infer<typeof ShareNetPortSchema>;

/**
 * Canonical ADCOS developer-boundary port
 */
export const AdcosPortSchema = z.object({
  version: SchemaVersionSchema,
  capabilities: z.array(z.string()),
  endpoints: z.record(z.string(), z.string()),
  auth: z.object({
    methods: z.array(z.string()),
    scopes: z.array(z.string()),
  }),
});

export type AdcosPort = z.infer<typeof AdcosPortSchema>;
