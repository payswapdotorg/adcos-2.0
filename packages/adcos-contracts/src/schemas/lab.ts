import { z } from "zod";

// ============================================================================
// Reality Lab comparison evidence
// ============================================================================

/**
 * Lab comparison evidence
 */
export const LabComparisonEvidenceSchema = z.object({
  id: z.string(),
  intent: z.string(),
  baseline: z.string(), // baseline strategy reference
  alternatives: z.array(z.string()), // alternative strategy references
  noChange: z.object({
    cost: z.number(),
    reliability: z.number().optional(),
    utilization: z.number().optional(),
  }),
  selected: z.object({
    strategy: z.string(),
    cost: z.number(),
    reliability: z.number().optional(),
    utilization: z.number().optional(),
    confidence: z.number(),
    assumptions: z.array(z.string()),
  }),
  comparison: z.record(z.string(), z.unknown()), // comparison results
  evaluatedAt: z.number(),
  expiresAt: z.number().optional(),
});

export type LabComparisonEvidence = z.infer<typeof LabComparisonEvidenceSchema>;
