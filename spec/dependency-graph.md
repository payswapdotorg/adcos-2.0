# Dependency Graph and Delivery Waves

Current frontier is defined only by spec/development-state/current-state.json. Work orders and state change together.

## Ordered graph

Architecture lock + invariants + authority model + upstream pin
-> P0 baseline, governance checker, and capability/test-harness inventory
-> P1 canonical versioned shared contracts and public ports (serialized; one owner)
-> P2-W1 product surfaces and role experiences
-> P2-W2 cross-device coordination, resource contribution, gateway runtime, and ADCOS/ShareNet/RoamLink integration
-> P2-W3 Reality Lab, Organizations, economic opportunity, group providers and collective purchasing
-> P3 composed end-to-end journeys through real public boundaries
-> P4 security/resilience hardening plus authorized device/operator and economics validation
-> P5 deployment, operational readiness, staging and release gates.

P2-W1, P2-W2 and P2-W3 have stable shared contracts as their common prerequisite and should run concurrently on disjoint owned paths. P3 requires all three. Physical/provider validation follows working implementations; it cannot be replaced by mocks.

## Three direct lanes

- Worker 1: inherited ZCode substrate/migration, product surfaces, provider/customer/admin experience and role switching.
- Worker 2: cross-device trust/transport/runtime, gateway/resource contribution, connectivity adapters, and integration with canonical ADCOS/ShareNet/RoamLink.
- Worker 3: Lab/Strategy/Organization, economic calculations, group-provider formation, collective purchasing, simulations and economic evidence.

The TL is orchestrator, architecture reviewer, contract authority, integrator and acceptance owner, not a fourth implementation worker.

## Safe concurrency

1. P0 work can run in parallel because each work order has disjoint outputs.
2. Serialize shared schemas, public ports, root manifests, migrations, architecture locks and common test fixtures through one accountable owner.
3. After P1 contracts are reviewed and accepted, dispatch all three P2 lanes concurrently using versioned contracts and fixtures.
4. Each lane owns its production paths and package-local tests. Workers submit cross-lane needs as contract proposals, not simultaneous edits.
5. Integrate small commits frequently and run lane checks before composition. The TL runs composed gates and checks architecture, security, UX truth, recovery, and evidence provenance.
6. Continue independent lanes when one is blocked; record the dependency edge and exact required evidence. Never bypass by duplicating another domain's authority.
7. Update current-state in the same change that alters the frontier or acceptance status.

## Verification ladder

Spec checker/architecture direction -> unit/domain invariants -> public contract/adapter conformance -> replay/duplicate/reordering/delay/partition/revocation/unknown simulations -> real UI/browser flow -> two independent runtime instances -> physical device tests -> supported gateway forwarding -> authorized live provider/operator tests -> load, security, cost, restore and deployment gates.

Every report distinguishes mock/simulation, real-device, sandbox provider, and live-provider evidence.
