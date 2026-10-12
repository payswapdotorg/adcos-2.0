import type { Delegation } from "@adcos/contracts";

// ============================================================================
// Scoped delegation chain validation — attenuation containment, expiry,
// revocation. No authority is implied without a valid chain.
// ============================================================================

export interface DelegationCheck {
  authorized: boolean;
  reason?: string;
}

/**
 * Validate a delegation chain (leaf first: [leaf, ...ancestors]) for a scope
 * and action time. Rules:
 * - no delegation → not authorized (fail closed);
 * - any link revoked or expired → not authorized;
 * - every outer link's scope must cover the inner link's scope (attenuation
 *   only widens constraints, never narrows: 'device' authorizes
 *   'device.forwarding' but not the reverse);
 * - the request scope must be covered by the leaf's scope.
 */
export function checkDelegationChain(
  chain: readonly Delegation[],
  scope: string,
  now: number,
): DelegationCheck {
  if (chain.length === 0) {
    return { authorized: false, reason: "no delegation presented" };
  }
  for (const link of chain) {
    if (link.revoked) {
      return { authorized: false, reason: `delegation ${link.id} revoked` };
    }
    if (link.expiresAt !== undefined && now > link.expiresAt) {
      return { authorized: false, reason: `delegation ${link.id} expired` };
    }
  }
  const leaf = chain[0];
  if (leaf === undefined) {
    return { authorized: false, reason: "delegation chain is empty" };
  }
  if (!scopeCovered(leaf.scope, scope)) {
    return {
      authorized: false,
      reason: `leaf delegation scope '${leaf.scope}' does not cover '${scope}'`,
    };
  }
  for (let i = 1; i < chain.length; i++) {
    const outer = chain[i];
    const inner = chain[i - 1];
    if (outer === undefined || inner === undefined) {
      return { authorized: false, reason: "delegation chain is malformed" };
    }
    if (!scopeCovered(outer.scope, inner.scope)) {
      return {
        authorized: false,
        reason: `attenuation violation: outer delegation ${outer.id} scope '${outer.scope}' does not cover inner ${inner.id} scope '${inner.scope}'`,
      };
    }
  }
  return { authorized: true };
}

/**
 * Prefix-scope coverage on dot-separated segments (same semantics as the
 * organizations package's mandateCovers; duplicated deliberately — the two
 * modules share no imports by policy and the rule is part of each one's
 * public contract semantics).
 */
function scopeCovered(granted: string, requested: string): boolean {
  if (granted === requested) {
    return true;
  }
  return (
    granted.split(".").length < requested.split(".").length && requested.startsWith(`${granted}.`)
  );
}
