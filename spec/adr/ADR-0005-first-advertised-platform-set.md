# ADR-0005: First advertised forwarding platform set — Linux gateway

- Status: ACCEPTED (TL decision 2026-10-12, resolving P0-W3 gap G-5)
- Scope: P2-W2 exit criteria, P4-W2 authorized combinations
- Authority: TL, per AGENTS.md

## Context

P2-W2 acceptance requires "a real supported gateway path for advertised
forwarding"; P4-W2 requires authorized device/OS/operator combinations. No
work order or spec selected the first advertised set. ShareNet's public
transport surfaces: `transport/linux/` (TUN/UDP appliance, most mature),
`transport/android/` (Kotlin), `transport/ios/` (Swift). The architecture
notes ordinary iOS apps cannot become general-purpose routers.

## Decision

The **first advertised forwarding platform set is the Linux gateway/router
path** (x86_64 and aarch64): device-wide forwarding via TUN, policy routing,
multi-WAN as specified in `spec/connectivity-resource-provider.md`, delivered
through the ShareNet linux transport seam + our P2-W2 gateway runtime.

Android and iOS are **explicitly not in the first advertised set**: their
contribution paths are app-level where the platform permits (fail-closed
elsewhere) and are advertised as such. Adding a platform requires a new ADR
with its authorized device/operator proof per `docs/research/proof-plan.md`.

## Consequences

- P2-W2 exit criteria are pinned to the Linux gateway path (real, tested).
- P4-W2 authorized combinations start with Linux gateways; mobile platform
  expansions follow their own proof plans.
- The product's support-matrix surface (P2-W1) must display this set exactly
  and never imply universal phone/browser forwarding (INVARIANTS).
