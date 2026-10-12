import type { ResourceProjectionReference, CapabilityObservation } from "@adcos/contracts";

// ============================================================================
// Capability discovery — declared vs observed matching over resource
// projections. Discovery is read-only: it never mutates projections and
// treats UNKNOWN/STALE/DEGRADED resources per the status doctrine.
// ============================================================================

export interface DiscoveryQuery {
  /** Capability id required (exact match on the declared capability). */
  capability: string;
  /** Modes the requester needs (all must be offered). */
  modes?: readonly string[];
  /** Minimum acceptable freshness (epoch ms); resources without freshness
   *  are treated as UNKNOWN and excluded. */
  minFreshness?: number;
  /** Exclude resources in these states (defaults to the unusable set). */
  excludedStatuses?: readonly ResourceProjectionReference["status"][];
}

export interface DiscoveredResource {
  resource: ResourceProjectionReference;
  /** Observed status of the capability (UNKNOWN when never observed). */
  observationStatus: CapabilityObservation["observed"]["status"];
  /** Why this resource matched (evidence for the discovery decision). */
  matchedOn: readonly string[];
}

const DEFAULT_EXCLUDED: readonly ResourceProjectionReference["status"][] = [
  "FAILED",
  "REJECTED",
  "TERMINATED",
];

/**
 * Match resources against a discovery query. Rules:
 * - revoked resources never match;
 * - declared capability must match exactly; requested modes must all be
 *   offered; freshness must be present and recent enough;
 * - resources whose observed status is excluded are skipped with the status
 *   as the reason (observed beats declared — trust the measurement);
 * - the result carries the matched-on evidence, never a silent pass.
 */
export function discoverResources(
  resources: readonly ResourceProjectionReference[],
  observations: readonly CapabilityObservation[],
  query: DiscoveryQuery,
  now: number,
): readonly DiscoveredResource[] {
  const excluded = new Set(query.excludedStatuses ?? DEFAULT_EXCLUDED);
  const results: DiscoveredResource[] = [];

  for (const resource of resources) {
    if (resource.revoked) {
      continue;
    }
    if (resource.capability !== query.capability) {
      continue;
    }
    const matchedOn: string[] = [`capability:${resource.capability}`];

    if (query.modes && !query.modes.every((m) => resource.modes.includes(m))) {
      continue;
    }
    if (query.modes) {
      matchedOn.push(`modes:${query.modes.join("+")}`);
    }

    if (query.minFreshness !== undefined) {
      if (resource.freshness === undefined || resource.freshness < query.minFreshness) {
        continue;
      }
      matchedOn.push(`freshness:${resource.freshness}`);
    }

    const observation = observations.find((o) => o.declared.capability === resource.capability);
    const observationStatus = observation?.observed.status ?? "UNKNOWN";
    if (excluded.has(observationStatus)) {
      continue;
    }
    if (observation) {
      matchedOn.push(`observed:${observationStatus}`);
    }

    results.push({ resource, observationStatus, matchedOn });
  }

  return results;
}
