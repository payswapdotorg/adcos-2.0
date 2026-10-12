# Work-Order Catalog

Every work order has one owner, owned paths, dependencies, outputs, tests, and committed acceptance evidence. The initial frontier is P0-W1, P0-W2, P0-W3.

## P0-W1 — Inherited ZCode baseline and migration inventory
Owner: Worker 1. Owned outputs: spec/UPSTREAM-ZCODE.md, docs/baseline/substrate-inventory.md, baseline reports.
Outputs: confirm upstream pin and history, public package map, module inventory, pinned Node/pnpm, baseline commands and exact exit codes, inherited/new/environmental issues, and a product identity migration proposal.
Acceptance: preserve licenses/notices; compare against upstream commit; inspect platform/UI/runtime/package boundaries; run available freshness, lint, typecheck and build checks. No unreviewed upgrades or feature edits.

## P0-W2 — Project-spec conformance and governance gate
Owner: Worker 2. Owned outputs: scripts/check-project-spec.mjs and explicitly assigned CI/checker files only.
Starter: scripts/check-project-spec.mjs is already committed by ARCH-BASELINE-001. Harden it rather than recreating it: validate required specs, current-state JSON, frontier references, unique work-order IDs, architecture version and required locked sections; add negative fixtures for a missing spec, invalid JSON, unknown frontier ID, and duplicate work-order ID. Wire the checker into the smallest appropriate existing CI/verification hook while preserving inherited architecture-policy behavior.
Acceptance: run node scripts/check-project-spec.mjs in an actual checkout; checker passes current documents and fails each negative fixture; relevant CI/verification command runs it; record actual commands/results.

## P0-W3 — Capability, integration, security and evidence inventory
Owner: Worker 3. Owned outputs: docs/baseline/capability-inventory.md, docs/research/ and proof/test-plan artifacts.
Outputs: map each product requirement to verified inherited capability, public integration surface, new work order, or gap; inspect ADCOS/ShareNet/RoamLink/UniCom/PaySwap public docs; list device/OS/operator proof cases and integration risks.
Acceptance: no claims that neighboring code is already integrated; every requirement and risk has evidence source and disposition.

## P1-W1 — Canonical shared contracts and public ports
Owner: TL assigns one worker exclusively. Owned paths: shared versioned domain schemas/ports and contract conformance tests.
Dependencies: P0-W1/P0-W2/P0-W3 accepted.
Outputs: resource/instance references, capability observation, cross-device envelope/task/delegation, inbox/outbox and event lifecycle, Organization candidate/membership/mandate, group request/offer/commitment, opportunity evidence and status/error/freshness types.
Acceptance: schema/runtime validation; compatibility/version tests; duplicate/replay/expiry/out-of-scope negatives; fields mapped to spec/authority-model.md; no provider secrets or parallel payment/connectivity authority.

## P2-W1 — Product surfaces and role experience
Owner: Worker 1. Owned paths: product Web/UI/Surface projections and user journey tests; no shared-contract edits.
Dependencies: P1-W1 accepted.
Outputs: customer, resource-provider, Organization member/admin, operator and developer journeys; device enrollment, permissions, capability limitations, opt-in/opt-out, group offer/approval, clear stale/unknown/degraded states.
Acceptance: real UI/browser flows, responsive/accessibility checks, role/tenant isolation, persisted state verified via public API/service, negative/error flows. Visual-only success is insufficient.

## P2-W2 — Instance coordination, provider resources and connectivity integration
Owner: Worker 2. Owned paths: device/edge/gateway runtime, coordination transport, provider adapters and adapter tests; no shared-contract edits.
Dependencies: P1-W1 accepted.
Outputs: authenticated multi-instance enrollment, capability discovery, scoped delegation, durable inbox/outbox, replay/revocation/offline semantics, low-infrastructure resource onboarding, observation/usage evidence, canonical ADCOS/ShareNet/RoamLink public integration.
Acceptance: two separate processes plus physical-device verification; positive and negative messaging; offline expiry and duplicate tests; a real supported gateway path for advertised forwarding. Explicitly fail closed or mark unsupported where platform/operator limits apply.

## P2-W3 — Reality Lab and collective provider economy
Owner: Worker 3. Owned paths: Lab, Strategy/Organization, economic calculations, group-buy workflows and simulations; no shared-contract edits.
Dependencies: P1-W1 accepted.
Outputs: baseline/no-change comparison, reproducible opportunity evaluation, group provider formation, pooled demand and attributable offer flow, member allocation, subscription/SIM/equipment recommendations, simulation/shadow harness.
Acceptance: reproducible decisions for fixed evidence snapshot, explicit costs and confidence, offer provenance/expiry, member threshold/consent, no action without authorization, shortfall/cancel/refund/reconciliation cases.

## P3-W1 — Integrated product and real-boundary dogfood
Owner: TL, delegating lane-specific fixes. Paths: integration tests and docs/reports/integration.
Dependencies: all P2 lanes accepted.
Outputs: customer requests service, resource owner shares an eligible connection, instances cooperate, ADCOS executes a contract, Lab forms/recommends an Organization, a real group offer obtains approved commitments, service and usage reconcile.
Acceptance: composed public APIs and actual user surface; durable evidence, idempotency/recovery; mocks clearly labeled; no fake physical/provider success.

## P4-W1 — Security and resilience hardening
Owner: TL assigns one accountable owner plus bounded support. Dependencies: P3.
Outputs: threat fixtures, tenant/resource isolation, abuse/rate/Sybil/collusion controls, secrets isolation, credential rotation/revocation, budget enforcement, dead-letter/reconciliation, backup/restore and load plan.
Acceptance: negative proofs and failure injection; stale/unknown/replay/partial failure; rollback/recovery evidence; unresolved limits documented.

## P4-W2 — Physical/provider proof and unit economics
Owner: Worker 2 lead under TL acceptance. Dependencies: supported gateway path and security baseline.
Outputs: authorized device/OS/operator combinations, link independence tests, measured direct/relay/failover behavior, operator terms checklist, real contribution/cost/earnings data with privacy guards.
Acceptance: report device/OS/topology/window/method/failures and safe provider-plan assumptions; live provider claims only where live evidence exists; estimates separated from actuals.

## P5-W1 — Deployment and production readiness
Owner: TL assigns deployment owner. Dependencies: P4 accepted.
Outputs: environment contracts, rollback, monitoring, incident/support operations, retention/privacy, cost bounds, onboarding runbooks, restore drill, staging and release gate.
Acceptance: staging tested through real UI, recovery drill passed, credentials isolated, target-specific hardware/provider limits documented. Serverless control-plane hosting is not evidence that persistent packet forwarding is deployed.
