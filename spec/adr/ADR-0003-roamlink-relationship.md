# ADR-0003: RoamLink relationship — pattern reference only in the current roadmap

- Status: ACCEPTED (TL decision 2026-10-12, resolving P0-W3 gap G-3)
- Scope: P2-W1 / P3-W1 integration-test scope
- Authority: TL, per AGENTS.md

## Context

RoamLink owns customer identity/device context/ExperienceIntent in its own
product and consumes the same canonical ADCOS boundary
(`sib/RoamLink@2284134:spec/authority-model.md`, ADR-0001 in that repo). Its
`/v1` HTTP API exists. `spec/authority-model.md` row 13 in this repo assigns
RoamLink the role of authority/model reference.

## Decision

Treat RoamLink as a **pattern and authority-model reference only** for the
current roadmap (P2/P3). It is not a live integration target: ADCOS 2.0
journeys integrate the canonical ADCOS boundary, not RoamLink's product
surface. RoamLink-boundary integration tests are out of scope for P2-W1 and
P3-W1.

## Consequences

- No RoamLink runtime dependency in any P2 lane.
- RoamLink's evidence-class discipline and authority-table design inform our
  contract vocabulary (reflected in P1-W1 handoff notes from P0-W3).
- Live RoamLink integration, if wanted later, requires a new work order and
  ADR (operator decision).
