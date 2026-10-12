# ADR-0002: Identity bootstrap — authority-agnostic principals on substrate OAuth

- Status: ACCEPTED (TL decision 2026-10-12, resolving P0-W3 gap G-2)
- Scope: P1-W1 principal reference types, P2-W1 login/role flows
- Authority: TL, per AGENTS.md

## Context

`spec/authority-model.md` row 3 assigns product principals to an "approved
identity/trust authority" without naming one. The inherited substrate ships
ZAI/BigModel OAuth machinery for the ZCode product identity
(`packages/web/src/auth/`, `packages/services/src/oauth/`).

## Decision

1. P1-W1 principal reference types are **authority-agnostic**: opaque
   principal identifiers plus proof/credential references — no IdP vendor
   semantics inside the shared contracts.
2. The **initial approved authority** is the substrate's ZAI/BigModel OAuth
   machinery, reused through its public surface (no new IdP integration in
   P1/P2). "Approved identity/trust authority" is a role, not a vendor; a
   future ADR may approve additional authorities.

## Consequences

- P2-W1 login/role switching builds on the substrate OAuth machinery.
- Contract types stay portable across authority changes.
- Instance/device identity (distinct from principal identity, per
  `spec/cross-device-coordination.md`) is defined by P1-W1 independently of
  this decision.
