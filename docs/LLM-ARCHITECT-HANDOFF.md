# LLM Architect and Tech Lead Handoff — ADCOS 2.0

This document and linked repository specifications are the complete handoff. Do not depend on chat history. Architecture and current-state documents are authoritative if another document conflicts.

## Mission

Build a ZCode-derived Connectivity OS with customer/provider experiences, permissioned low-infrastructure resource contribution, secure cooperation between independently running device instances, canonical connectivity integration, a Reality Engineering Lab, dynamic provider Organizations, and collective purchasing.

## Read first

README.md; AGENTS.md; spec/architecture/ADCOS-2.0.md; spec/architecture/INVARIANTS.md; spec/authority-model.md; spec/connectivity-resource-provider.md; spec/cross-device-coordination.md; spec/reality-lab.md; spec/group-organizations-and-purchasing.md; spec/dependency-graph.md; spec/work-orders.md; spec/development-state/current-state.json; spec/UPSTREAM-ZCODE.md.

## Verified starting point and limitations

The repository main baseline is ZCode v3.14.3 at commit 29628c9acdb81b703bbd4080c207a0e7ce5e276e. Preserve license/third-party notices. Upstream main was observed on 2026-10-12 at aac4755666d09fdcd70272fcf063c077a639015f / v3.15.1; this is not approval to upgrade. This setup records architecture and governance only. It does not claim the target capabilities, tests, device gateways or provider integrations are already implemented.

## Architecture at a glance

- ZCode remains the application/agent substrate.
- Existing payswapdotorg/ADCOS owns canonical offers, eligibility, ConnectivityContract, execution plans, paths/sessions, usage evidence, assurance and settlement references.
- ShareNet owns peer/gateway protocol and contribution accounting.
- RoamLink owns its bounded experience/device context semantics.
- UniCom is the group-commerce reference; PaySwap 3.0 is the Lab/Organization reference.
- Device instances have independent identity and local authority. Remote collaboration is authenticated, scoped, replay-protected, revocable, observable and idempotent.
- The resource owner controls sharing, constraints, budget and revocation. Operator/legal restrictions are respected.
- Lab recommendations compare against no change, disclose evidence/costs/risks/confidence, and remain advisory until all authorities approve.
- Group organizations and collective buys require real offers, member consent, thresholds, cancellation/exit terms, exact allocation and reconciliation.

## Dispatch the three concurrent workers

The TL is orchestrator/reviewer, not a fourth worker. Read current-state and dispatch P0-W1, P0-W2 and P0-W3 concurrently because the owned paths are disjoint.

- Worker 1 / P0-W1: inherited baseline, package/module inventory, toolchain and test/build evidence, migration impact. Own baseline/migration report paths only.
- Worker 2 / P0-W2: harden the already-committed scripts/check-project-spec.mjs starter, add negative fixtures for missing spec, malformed state JSON, unknown frontier ID, and duplicate work-order ID, and wire it into the smallest appropriate existing verification/CI hook. Own checker/CI artifacts only; preserve inherited architecture policy.
- Worker 3 / P0-W3: capability and integration inventory, gap/evidence matrix, device/operator proof plan and test-harness plan. Own baseline/research paths only.

Each returns commits, exact commands and exit codes, tests/evidence, environmental limitations, and handoff notes. TL verifies artifacts rather than accepting claims.

After all P0 accepted, serialize P1-W1 for canonical versioned shared contracts and public ports; one accountable owner edits shared schemas. Once P1 is reviewed and accepted, dispatch P2-W1, P2-W2 and P2-W3 concurrently against stable contracts:
- W1 surfaces and role UX.
- W2 instance coordination, resource/gateway runtime, and integrations.
- W3 Lab, Organizations, group economics and simulations.

Then TL composes P3, followed by security/physical validation P4 and production readiness P5. Continue independent work when a lane is blocked, recording blocked dependency edges. Do not bypass a dependency with a duplicate authority.

## Concurrency without quality loss

- Use isolated branches/worktrees; one accountable owner per work order and non-overlapping file paths.
- No concurrent edits to shared contracts, root manifests, workflow files, migrations or the same fixture.
- Freeze contracts first; parallelize implementations against public interfaces and shared test fixtures.
- Integrate small commits, run lane checks, then composed gates. TL reviews authority boundaries, threat model, security, UI truth, failure recovery and evidence provenance.
- Shared-contract change requires TL coordination and, if architecture-changing, an ADR before dependent coding continues.
- Update current-state with every frontier/status change. Record commit evidence and tests, not unsupported claims.

## Required proof

- Project-spec checker passes and has negative fixtures.
- Real UI journeys exercise persisted services, not visual-only mock success.
- Cross-device support uses independent instances and later physical devices.
- Gateway forwarding is tested per advertised platform/device/network type.
- Sandbox provider results are distinct from live-provider evidence.
- Group-buy cases include threshold not met, expiry, withdrawal, duplicate order, unknown result, partial fulfillment, cancellation/refund and reconciliation.
- Lab recommendations are reproducible for a fixed evidence snapshot and include a no-change option.
- Security tests revoked/untrusted peers, malformed/replayed commands, local denial, expired offline tasks, data/budget limits, isolation, and recovery.
- Production readiness requires staging through the real UI, restore/rollback evidence, operating runbooks and target-specific proof.

## Next action

Start with the P0 frontier. Do not begin broad feature implementation until the inherited baseline, spec checker and capability/gap inventory are committed and accepted. The repository is sufficient to proceed without the user or any prior chat, except for genuinely new product decisions.
