# ADR-0001: ShareNet interop strategy — adapter behind our public boundary

- Status: ACCEPTED (TL decision 2026-10-12, resolving P0-W3 gap G-1)
- Scope: P1-W1 port shapes, P2-W2 integration scope
- Authority: TL (architecture decisions), per AGENTS.md

## Context

ShareNet's `AdcosClient` (observed at `sib/ShareNet@662fad6:connectivity-client/src/wire.rs:15-21`)
targets an unversioned, unauthenticated 7-endpoint mapping that does not
interoperate with the deployed canonical ADCOS v2.0 boundary: no `/api/2.0`
prefix, no `X-ADCOS-*` headers, and it expects a nonexistent execution route
(`connectivity-client/src/http.rs:188`).

## Decision

Build an **adapter inside ADCOS 2.0** (P2-W2 scope) that implements
`ConnectivityPort` semantics against the canonical, versioned, authenticated
ADCOS developer boundary, and talks to ShareNet surfaces through ShareNet's
public seams. We do NOT serve ShareNet's raw endpoint table as a
compatibility surface (it would import an unauthenticated wire shape into our
product), and we do NOT request ShareNet-side client changes (outside our
review control; cross-repo coordination cost).

## Consequences

- P1-W1 must include the adapter-facing port type in the shared contracts.
- P2-W2 owns the adapter plus conformance/interop tests against a real
  ShareNet instance; no "ShareNet integrated" claim may be recorded before
  those tests pass.
- ShareNet transport crates (`transport/linux`, `dtn/`) remain public
  integration surfaces consumed via their own APIs.
