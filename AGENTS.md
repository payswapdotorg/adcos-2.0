# ADCOS 2.0 — Engineering and Agent Rules

## Source of truth and read order

This repository is the only implementation authority. Chat history, model memory, PR descriptions, screenshots without provenance, and worker claims are non-authoritative unless the underlying requirement or evidence is committed here.

Read: README.md; spec/architecture/ADCOS-2.0.md; spec/architecture/INVARIANTS.md; spec/authority-model.md; the relevant domain specifications; spec/dependency-graph.md; spec/work-orders.md; spec/development-state/current-state.json; docs/LLM-ARCHITECT-HANDOFF.md; and spec/UPSTREAM-ZCODE.md.

## Governance and concurrency

- One Tech Lead orchestrates exactly three direct worker lanes. The TL is not a fourth implementation worker.
- Use the current-state frontier and work-order dependencies. Workers may start concurrently only when their owned paths and contracts are disjoint.
- The architecture baseline is accepted before feature work. Shared schemas and public ports are serialized through a single work order/owner. After they are frozen, independent product, runtime, and Lab lanes should work concurrently.
- Never have multiple workers edit the same shared types, root manifests, migrations, workflow, or test fixture concurrently. Use isolated branches/worktrees, small commits, frequent integration, and lane-specific checks.
- The TL owns architecture decisions, dependency gates, public-contract review, merge/integration, and acceptance. If an architecture change is required, use spec/adr/ and update the architecture, dependency graph, work orders, and current-state.
- Every work order needs one accountable owner, paths, prerequisites, outputs, tests, and committed evidence. A green lint/CI result alone does not prove product correctness.

## Non-negotiable boundaries

- The existing payswapdotorg/ADCOS domain remains authoritative for connectivity offers, eligibility, ConnectivityContract, ExecutionPlan, path/session state, usage evidence, assurance, and connectivity settlement references. ADCOS 2.0 stores references/projections and uses public commands; no shadow authority.
- ShareNet owns its peer/gateway protocol and contribution-accounting semantics. RoamLink owns its experience-domain semantics. UniCom and PaySwap 3.0 are references for group commerce and Lab patterns, not license to import private internals.
- Device/user/org identity, software instance identity, resource ownership, organization membership, provider trust, and transaction proof are distinct concepts.
- A device owner may deny a remote command even from a linked or trusted peer. Remote connectivity does not grant local execution, resource, financial, or administrative authority.
- Models and the Lab propose. Deterministic eligibility, policy, budgets, owner consent, connectivity authority, and authorized payment/financial authority decide and commit.
- UNKNOWN, STALE, DEGRADED, FAILED, REJECTED, and TERMINATED are distinct. Never infer success from submission, timeout, catalog presence, simulation, or provider marketing claims.
- Keep provider-native credentials, subscriber secrets, private topology, and raw user traffic out of core contracts, prompts, shared telemetry, and logs.
- Respect applicable law and operator plans. Never bypass tethering, resale, spectrum/radio, or service restrictions. A device's theoretical resource is not an eligible offer until feasibility is verified.
- Use established protocols and public package boundaries. Do not invent cryptography, duplicate contract or settlement authorities, or overstate platform abilities.

## Required verification

Use pinned versions from mise.toml and package.json. Baseline commands include:
- node scripts/check-project-spec.mjs
- node scripts/check-workspace-freshness.mjs
- pnpm typecheck
- pnpm lint
- pnpm fmt:check
- pnpm verify:pre-push

Record commands actually run and their real results. Add unit/domain, contract, negative-proof, security, failure simulation, browser/E2E, multi-instance, physical-device, gateway, and live-provider tests as appropriate. If a command cannot be run, state why; do not fabricate a pass.

## Inherited ZCode constraints

Preserve the existing workspace and public package boundaries. Business state belongs in domain/service layers, not UI components. Platform differences use existing public abstractions and dependency injection. Keep Desktop, Web, remote workspace, and mobile protocol semantics distinct. Consult DESIGN.md and module context before inherited UI changes. Keep secrets out of logs. ZCode upstream history, LICENSE, and THIRD-PARTY-NOTICES.md remain intact.
