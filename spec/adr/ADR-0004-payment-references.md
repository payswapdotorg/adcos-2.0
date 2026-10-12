# ADR-0004: Payment/financial references — opaque typed references, rail selection deferred

- Status: ACCEPTED (TL decision 2026-10-12, resolving P0-W3 gap G-4; rail
  selection remains an open OPERATOR decision)
- Scope: P1-W1 value/reference types, P3-W1, P4-W2
- Authority: TL for the technical shape; payment-rail selection is a business
  decision reserved to the operator

## Context

No payment rail is selected or integrated anywhere in this repo or the
sibling set (verified in P0-W3's survey: UniCom `live_payments: NOT_AUTHORIZED`;
PaySwap adapters deferred; RoamLink commerce projection-only). The specs
reference "the authorized financial/payment authority" as a role
(`spec/authority-model.md`), with settlement references canonical in the
existing ADCOS domain.

## Decision

1. P1-W1 models every monetary/settlement value as an **opaque typed
   reference** (amount + currency + provenance + reference to "the
   authorized financial/payment authority" as a role) — no rail semantics in
   shared contracts, no provider secrets.
2. Live payment-rail selection is **deferred to the operator** and is not on
   the current roadmap's critical path: P2-W3 economics compute on reference
   values; P3-W1 composed purchases exercise the reference flow; P4-W2
   earnings reconciliation separates estimates from actuals (actuals require a
   rail).

## Consequences

- Any acceptance item that inherently requires live money movement is marked
  BLOCKED-ON-OPERATOR (rail selection) rather than approximated with fake
  success — per the handoff's "no fake physical/provider success" rule.
- When the operator selects a rail, a new ADR + work order will scope its
  adapter (PaySwap domain boundaries per the authority model).
