# Capability, Integration, Security and Evidence Inventory — ADCOS 2.0 (P0-W3)

Status: BASELINE INVENTORY — research artifact. **This inventory asserts no product capability
of ADCOS 2.0 is implemented or integrated.** The repository state at baseline
`6ba5dcdd03339a657951750c100a7b446a6d5624` is `ARCHITECTURE_BASELINE_COMMITTED;
IMPLEMENTATION_NOT_STARTED` (`spec/development-state/current-state.json`). Existence of a
capability in the inherited substrate or of a public surface in a sibling repository is never
integration status of this product.

## Method and evidence conventions

- Requirements are enumerated from the authoritative specs (read list: `README.md`,
  `spec/architecture/ADCOS-2.0.md`, `spec/architecture/INVARIANTS.md`, `spec/authority-model.md`,
  `spec/connectivity-resource-provider.md`, `spec/cross-device-coordination.md`,
  `spec/reality-lab.md`, `spec/group-organizations-and-purchasing.md`,
  `spec/dependency-graph.md`, `spec/work-orders.md`, `docs/LLM-ARCHITECT-HANDOFF.md`).
- Every row is classified **exactly one** of:
  - **VERIFIED-INHERITED** — capability exists in the pinned ZCode v3.14.3 substrate in this
    repository; evidence is a package/file path inspected in this checkout (prefix `substrate:`).
  - **PUBLIC-INTEGRATION** — owned by a sibling authority domain; evidence is a public
    surface actually observed in that sibling's repository (prefixes `sib/ADCOS@d7db35e:`,
    `sib/ShareNet@662fad6:`, `sib/RoamLink@2284134:`, `sib/UniCom@1c003ec:`,
    `sib/PaySwap@b5f20d6:` — all shallow-cloned and inspected 2026-10-12; see
    `docs/research/integration-survey.md` for full surveys).
  - **NEW-WORK-ORDER** — neither exists; must be built. Mapped to the P1–P5 work orders in
    `spec/work-orders.md`, or flagged when no work order covers it.
  - **GAP** — unclear/unowned; requires a TL/architecture decision. The required decision is
    stated precisely (collected in §"Gaps requiring TL decisions").
- Design references (UniCom, PaySwap-3.0) are **not** integration targets: both are
  private-package monorepos with no served API (verified in the integration survey §4.3, §5.3).
  They appear only as pattern evidence inside NEW-WORK-ORDER rows and never soften a
  classification.

## Requirement → capability matrix

### A. Experience plane (customer, contributor, organization, operator, developer journeys)

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| A1 | Customer journey: express connectivity outcome, discover/recommend, arrange authorized connectivity | ADCOS-2.0.md §Mission, §Logical planes 1; README §Product thesis | NEW-WORK-ORDER | substrate: `packages/web` (React 19+Vite app, `packages/web/package.json`), `packages/desktop` (Electron 41, `packages/desktop/package.json`), `apps/zcode-cli` — inherited *surfaces* only; no ADCOS journey code exists anywhere in this repo | P2-W1 (surfaces + role experience). Transport/auth primitives reused from substrate; journeys are new |
| A2 | Contributor journey: opt-in, declare capability/schedule/limits/beneficiaries/privacy, pause/revoke | connectivity-resource-provider.md §Provider workflow steps 1–2, 8 | NEW-WORK-ORDER | No substrate or sibling implements our contributor experience. RoamLink device/capability model is a pattern reference (`sib/RoamLink@2284134:packages/domain-experience/src/device/`) | P2-W1; contract types in P1-W1 |
| A3 | Organization member/admin journey (roles, commitments, allocations) | group-organizations-and-purchasing.md §1; ADCOS-2.0.md §Logical planes 1 | NEW-WORK-ORDER | No implementation; UniCom agent plane is a pattern reference (`sib/UniCom@1c003ec:packages/agent/src/groupbuy.ts`) | P2-W1 |
| A4 | Operator journey (provider operations, terms, incidents) | ADCOS-2.0.md §Logical planes 1 | NEW-WORK-ORDER | None anywhere | P2-W1 |
| A5 | Developer journey on public package/platform interfaces | authority-model.md row 1 | NEW-WORK-ORDER (product developer surface) — substrate agent/CLI surface is VERIFIED-INHERITED machinery (K4) | substrate: `apps/zcode-cli` (CLI+TUI+SEA, `apps/zcode-cli/package.json`), `packages/services/src/zcode-agent/`, `packages/services/src/zcode-session/` inspected | P2-W1 for the ADCOS product developer surface; substrate agent runtime reused as-is |
| A6 | UX reports verified support, limitations, alternatives; never implies universal phone/browser forwarding | ADCOS-2.0.md §Resource contribution para 2; connectivity-resource-provider.md §Low-infrastructure policy | NEW-WORK-ORDER | No support-matrix surface exists; platform capability data will come from P2-W2 adapter evidence | P2-W1 (display) fed by P2-W2 (adapter-verified support matrix); first platform set = GAP G-5 |
| A7 | Distinct UI states: UNKNOWN/STALE/DEGRADED/FAILED/REJECTED/TERMINATED | INVARIANTS #5; work-orders.md P2-W1 acceptance | NEW-WORK-ORDER | Pattern reference implemented in sibling: `sib/RoamLink@2284134:packages/domain-experience/src/decision/evidence-weight.ts` (STALE/UNKNOWN weigh zero) | P2-W1; status types pinned in P1-W1 |

### B. Identity and trust plane

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| B1 | Product principals (customer/provider/admin) + references; scoped commands | authority-model.md rows 2–3 | NEW-WORK-ORDER | substrate ships OAuth login machinery for the ZCode product (`substrate:packages/web/src/auth/` — ZAI/BigModel OAuth, `browserOAuthCredentialRepo.ts`; `packages/services/src/oauth/`) — machinery, not our tenant/role model | P1-W1 (principal reference types) + P2-W1 (surfaces). Identity-authority selection = GAP G-2 |
| B2 | Device/instance enrollment; instance distinct from user/org/agent-body/device | cross-device-coordination.md §Identity and trust; ADCOS-2.0.md §Cross-device cooperation para 1 | NEW-WORK-ORDER | substrate primitives inspected: `substrate:packages/shared/src/handshake.ts` (hello/ack, zod-validated), `packages/zcode-server-cli/src/server-core/serverIdentity.ts`, `packages/shared/src/serviceAuthority.ts` (3 authority modes) — none model ADCOS instance identity/enrollment | P2-W2 (enrollment); instance reference type in P1-W1 |
| B3 | Scoped delegation, policy epochs, revocation enforcement; offline queues cannot extend permissions | INVARIANTS #12; cross-device-coordination.md §Message and task contract | NEW-WORK-ORDER | No substrate implementation. Implemented pattern reference: `sib/PaySwap@b5f20d6:packages/trust/src/` (mandates, delegation attenuation, epochs, security blocks) | P2-W2; envelope/delegation types in P1-W1 |
| B4 | Authenticated pairing; proximity/shared account confers nothing | INVARIANTS #8; cross-device-coordination.md §Identity and trust para 2 | NEW-WORK-ORDER | None | P2-W2 |
| B5 | Revocation blocks future consequential commands within defined expiry | cross-device-coordination.md §Identity and trust para 2; §Acceptance case 5 | NEW-WORK-ORDER | None; negative-proof required by P2-W2 acceptance | P2-W2 (+P4-W1 hardening) |

### C. Resource and capability plane (contribution)

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| C1 | Resource projection object: stable ID, owner, device/instance ref, type, capability/version, modes, limits, status/freshness, evidence refs, revocation state; no provider credentials | connectivity-resource-provider.md §Resource projection | NEW-WORK-ORDER | None; P1-W1 lists "resource/instance references, capability observation" as outputs | P1-W1 (schema) + P2-W2 (runtime) |
| C2 | Declared vs observed capability kept separate; owner assertions are not measurements | INVARIANTS #17; connectivity-resource-provider.md §Resource projection last para | NEW-WORK-ORDER | Closed-vocabulary pattern implemented in sibling: `sib/RoamLink@2284134:packages/domain-experience/src/capability/device-capability-name.ts` (11-name vocabulary, evidence-tagged snapshots) | P1-W1 (evidence classes) + P2-W2 (observation) |
| C3 | Eligibility: owner authorization + technical compatibility + provider/operator terms + law | INVARIANTS #15; ADCOS-2.0.md §Logical planes 3 | PUBLIC-INTEGRATION | Canonical eligibility is ADCOS-internal (`sib/ADCOS@d7db35e:eligibility/` — M004, 103/103 battery per its README) and reached through the public intent→offers boundary (`sib/ADCOS@d7db35e:developerapi/gateway.py` ROUTES: `POST intents/{}/offers`) | Integrate via ADCOS developer API (P2-W2 adapter). Resource-side inputs (owner consent, device feasibility) are NEW (C1/C2, P2-W2) |
| C4 | Low-infrastructure onboarding: begin with supported phone/computer + existing connection | connectivity-resource-provider.md §Low-infrastructure policy; ADCOS-2.0.md §Resource contribution | NEW-WORK-ORDER | Explicitly a P2-W2 output ("low-infrastructure resource onboarding"). Adjacent sibling surfaces: `sib/ShareNet@662fad6:transport/android/` (Kotlin), `transport/ios/` (Swift), `transport/linux/` | P2-W2 |
| C5 | Supported Linux gateway/router path when device-wide forwarding, TUN, policy routing, multi-WAN needed | connectivity-resource-provider.md §Low-infrastructure policy bullet 3 | NEW-WORK-ORDER (product gateway runtime) | ShareNet ships a public gateway appliance crate (Rust): `sib/ShareNet@662fad6:transport/linux/` (TUN/UDP appliance) — sibling surface exists, no wiring here | P2-W2 gateway runtime; ShareNet-path integration is D11/G-1. First advertised platform set = GAP G-5 |
| C6 | Resource/path measurement: reachability, uptime, latency, loss, jitter, throughput, usage, scoped to method/path/time | connectivity-resource-provider.md §Measurements and failures | NEW-WORK-ORDER (product measurement service) — link-observation primitive is VERIFIED-INHERITED | substrate: `substrate:packages/rpc/src/network-telemetry-middleware.ts` (NetworkObservation middleware exported from `packages/rpc/src/index.ts`); `packages/shared/src/processResourceTelemetry.ts`, `remoteUsageTelemetry.ts` | P2-W2 observation/usage-evidence service built on inherited telemetry primitives |
| C7 | Contributor compensation: service unit, measurement authority, dedupe, credit/penalty, dispute, reversal; forecast/accrued/disputed/settled labeled separately | connectivity-resource-provider.md §Measurements, compensation and failures | NEW-WORK-ORDER | None. Patterns: `sib/PaySwap@b5f20d6:packages/protocol/src/settlement/` (finality/reconciliation/evidence); `sib/ShareNet@662fad6:economics/` (Civic Points valuation/ledger) | P2-W3 (allocation math) + P4-W2 (live earnings/cost validation). Settlement references stay canonical (D8) |
| C8 | Owner pause/revoke stops future use immediately | connectivity-resource-provider.md §Provider workflow step 8; INVARIANTS #20 | NEW-WORK-ORDER | None | P2-W2 |

### D. Connectivity exchange (canonical ADCOS domain) — projection/reference consumption only

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| D1 | ConnectivityIntent creation (references/projections only; canonical changes via public commands) | authority-model.md row 10; INVARIANTS #1–2 | PUBLIC-INTEGRATION | `sib/ADCOS@d7db35e:developerapi/gateway.py` ROUTES `POST intents`; header contract `X-ADCOS-API-Version/X-ADCOS-Application/X-ADCOS-Credential/X-ADCOS-Idempotency-Key` (`runtime/asgi.py`); deployed at `https://adcos.vercel.app` (`docs/deployment/acceptance-record.md:32`) | P2-W2 builds the TS client/projections against this boundary. No parallel intent authority (INVARIANTS #2) |
| D2 | Offer discovery/acceptance (opaque typed references) | ADCOS-2.0.md §Canonical lifecycle; authority-model.md row 9 | PUBLIC-INTEGRATION | ROUTES `POST intents/{}/offers`; offers domain M003 behind boundary (`sib/ADCOS@d7db35e:offers/`); RoamLink's verified client mirror: `sib/RoamLink@2284134:packages/adcos/src/routes.ts:58-85` | P2-W2 adapter; Lab consumes offer data as evidence (P2-W3) |
| D3 | ConnectivityContract lifecycle: activate/inspect/terminate | INVARIANTS #1; ADCOS-2.0.md §Canonical lifecycle | PUBLIC-INTEGRATION | ROUTES `POST intents/{}/activation`, `GET contracts/{}`, `POST contracts/{}/termination`; canonical domain `sib/ADCOS@d7db35e:contracts/` (M002) | P2-W2 |
| D4 | Execution plan/status consumption | ADCOS-2.0.md §Logical planes 4 | PUBLIC-INTEGRATION | Execution status is contract-state-derived — no dedicated route (`sib/ADCOS@d7db35e:developerapi/gateway.py:233` `execution_status_reported_from_contract_state`); executionplans domain M006 behind boundary; opaque `execution-scope`/`execution-artifact` refs (LOCK-114/117 discipline in `developerapi/__init__.py`) | P2-W2 projections. Note: ShareNet's expected `GET /contracts/{id}/execution` does not exist — see D11/G-1 |
| D5 | Usage evidence consumption | INVARIANTS #4; ADCOS-2.0.md §Logical planes 4 | PUBLIC-INTEGRATION | ROUTES `GET contracts/{}/usage` (opaque `usage-pricing-terms` reference); usage/commercial domains M009 (`sib/ADCOS@d7db35e:usage/`, `commercial/`) | P2-W2 (usage evidence to reconcile contributor/Lab economics in P2-W3) |
| D6 | Assurance consumption | ADCOS-2.0.md §Logical planes 4 | PUBLIC-INTEGRATION | ROUTES `GET contracts/{}/assurance`; assurance domain M005 (`sib/ADCOS@d7db35e:assurance/`, 97/97 battery per its README) | P2-W2 |
| D7 | Failover/replan observation | ADCOS-2.0.md §Canonical lifecycle (assurance/replan/recovery) | PUBLIC-INTEGRATION | replan domain M008 (`sib/ADCOS@d7db35e:replan/`); `failover_replan` is a frozen observation kind in `sib/ShareNet@662fad6:spec/protocol-registry.yaml:137-146` and in ADCOS's webhook event set | P2-W2 webhook/projection handling |
| D8 | Settlement references (store references/reconciled projections, no competing ledger) | authority-model.md row 16; INVARIANTS #1 | PUBLIC-INTEGRATION | ADCOS commercial/payment domains M009 (`sib/ADCOS@d7db35e:commercial/`, `payment/`, `allocation/`) behind the canonical boundary | P2-W2 reference storage; P2-W3 reconciled projections. Payment rails beyond ADCOS references = GAP G-4 |
| D9 | Contract-scoped leases (grant/renew/revoke) | authority-model.md row 10 | PUBLIC-INTEGRATION | ROUTES `POST contracts/{}/leases`, `GET leases/{}`, `POST leases/{}/renewal`, `POST leases/{}/revocation` | P2-W2 |
| D10 | Signed webhook observation channel | ADCOS-2.0.md §Logical planes 4 (usage evidence/assurance delivery) | PUBLIC-INTEGRATION | `sib/ADCOS@d7db35e:developerapi/webhooks.py` (signed, observation-only, durable delivery obligation); ROUTES `webhook-endpoints` + `deliveries`; RoamLink consumer reference: `sib/RoamLink@2284134:packages/webhook-inbox/src/verifier.ts` | P2-W2 inbound webhook inbox + reconciliation loop |
| D11 | ShareNet paths as a delivery mode for coordination/gateway traffic | ADCOS-2.0.md §Cross-device cooperation ("or ShareNet paths"); authority-model.md row 12 | PUBLIC-INTEGRATION | Sanctioned seam: `sib/ShareNet@662fad6:connectivity/src/port.rs` (`ConnectivityPort`) + `spec/integrations/adcos.md`. **Verified drift:** ShareNet's wire client speaks raw paths without version prefix/auth headers and expects a nonexistent execution route (`connectivity-client/src/wire.rs:15-21`, `http.rs:188`) — does not interoperate with deployed ADCOS v2.0 as-is | P2-W2 adapter work + GAP G-1 (TL decision on who adapts) |
| D12 | RoamLink: reuse its authority/integration model; no duplicate connectivity authority | authority-model.md row 13 | PUBLIC-INTEGRATION (model reuse; no runtime dependency required) | `sib/RoamLink@2284134:spec/authority-model.md` (17-row authority table, 7 evidence classes, command/observation + conflict rules); ADR-0001 ADCOS public boundary | Experience-plane relationship decision = GAP G-3 |

### E. Cross-device coordination plane

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| E1 | Authenticated instance transports (TLS/QUIC/WebSocket/WebTransport/platform channels/approved relays) | cross-device-coordination.md §Transport and routing; ADCOS-2.0.md §Cross-device cooperation para 2 | VERIFIED-INHERITED (transport machinery) — the *instance-authenticated* channel semantics on top are E2/B-plane work | substrate: `substrate:packages/rpc/src/remote.ts` (WebSocketRemoteConnection, RemoteAgentConnection, RemoteAuthorityResolverService — exported in `packages/rpc/src/index.ts` Layer 6); `packages/client/src/websocket.ts` (connectViaWebSocket); `packages/server/src/http.ts` (Hono HTTP + WS upgrade wrapping rpc SocketProtocol); remote backends SSH/Docker/WSL in `packages/server/src/remote/` | Reuse inherited transports in P2-W2; instance authentication/delegation built on top (E2/B3) |
| E2 | Message envelope: schema/version, event/command IDs, sender/receiver instance IDs, scope, issue/expiry, correlation/causation, idempotency key, payload digest, authorization/delegation ref, policy epoch, signature | cross-device-coordination.md §Message and task contract para 1; INVARIANTS #10 | NEW-WORK-ORDER | None (substrate wire protocol v4 is an internal precedent, not this contract: `substrate:packages/shared/src/zcode-protocol-v4/wire.ts` — V4_WIRE_PROTOCOL_VERSION=3, checksummed fragments, deliveryKind initial/online/recovery) | P1-W1 (explicit output: "cross-device envelope/task/delegation"); P2-W2 enforcement |
| E3 | Durable inbox/outbox, ack, bounded retries, idempotent handlers, dedup, ordering, dead-letter, reconciliation; effectively-once domain effects | cross-device-coordination.md §Message and task contract para 3; INVARIANTS #11 | NEW-WORK-ORDER | None in substrate. Pattern references implemented in siblings: `sib/RoamLink@2284134:packages/webhook-inbox/` (durable inbox + fail-closed verifier), `sib/ShareNet@662fad6:dtn/` (custody store, TTL-gated priority, dedup, atomic flush) | P1-W1 (lifecycle types) + P2-W2 (durable implementation) |
| E4 | Task owner/lease/deadline/retry budget/cancellation; stale former owner cannot commit after lease handoff | cross-device-coordination.md §Message and task contract para 3 | NEW-WORK-ORDER | None | P2-W2 |
| E5 | Offline queues with quotas/expiry; expired delegated work must not execute offline without renewed authorization | INVARIANTS #12; cross-device-coordination.md §Acceptance case 4 | NEW-WORK-ORDER | None; RoamLink edge offline outbox is a pattern reference (`sib/RoamLink@2284134:packages/edge/`) | P2-W2 (offline expiry/duplicate tests are P2-W2 acceptance) |
| E6 | Store-carry-forward only for delay-tolerant intents | ADCOS-2.0.md §Cross-device cooperation para 2; cross-device-coordination.md §Transport and routing | PUBLIC-INTEGRATION | `sib/ShareNet@662fad6:dtn/` (custody store; TTL-gates-priority; dedup by (content_id, slot); atomic flush); BPv7 interop is a future adapter there (`spec/architecture.md:260`) | Delay-tolerance classification is our NEW policy work (P2-W2); transport via ShareNet boundary (D11/G-1) |
| E7 | Capability discovery: minimal, permissioned, opt-in metadata only; no broadcast of task payloads/credentials/traffic | cross-device-coordination.md §Identity and trust para 3; INVARIANTS #13 | NEW-WORK-ORDER | None | P2-W2 |
| E8 | Coordination channel ≠ VPN/general packet forwarding; relays have narrowly scoped authority only | INVARIANTS #14; cross-device-coordination.md §Transport and routing para 2 | NEW-WORK-ORDER | None (design constraint to encode in P2-W2 architecture + negative tests) | P2-W2 |
| E9 | Cross-device acceptance cases 1–8 (two-process authentication, negative messages, duplicate/reorder convergence, offline expiry, revocation blocking, local denial, path-loss degradation) | cross-device-coordination.md §Acceptance cases | NEW-WORK-ORDER | P2-W2 acceptance requires two separate processes + physical devices later | P2-W2; automation design in `docs/research/test-harness-plan.md`; physical proof in `docs/research/proof-plan.md` |

### F. Reality Engineering Lab plane

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| F1 | Lab search space: providers, resource combinations, timing, task allocation, Strategy/Organization structures, group purchasing, plan upgrades, second SIM/independent link, equipment investment, no-change baseline | reality-lab.md §Purpose and search space | NEW-WORK-ORDER | No Lab code anywhere. Reference is spec-only: `sib/PaySwap@b5f20d6:spec/architecture/PAYSWAP-3.0.md` §Lab (grep for Lab/Director/canary/counterfactual across its packages: zero code hits; `packages/economic/src/candidate.ts:7` "NOT the EEG") | P2-W3 (explicit output: "baseline/no-change comparison, reproducible opportunity evaluation") |
| F2 | Strategy vs Organization separation (what vs who/what executes) | reality-lab.md §1; ADCOS-2.0.md §Lab and economic coordination | NEW-WORK-ORDER | Spec-only in reference (`sib/PaySwap@b5f20d6:spec/architecture/PAYSWAP-3.0.md:56`) | P2-W3; shared types in P1-W1 (Organization candidate/membership/mandate) |
| F3 | Opportunity economics: baseline/alternatives, incremental benefits, recurring/one-time costs, payback, confidence, expiry, approvals, post-action metrics; gross/contribution/accrued/settled distinguished | reality-lab.md §Opportunity economics | NEW-WORK-ORDER | Implemented analogues in reference: `sib/PaySwap@b5f20d6:packages/surface/src/quote-terms.ts` (fees/rate provenance/expiry/guarantee-vs-estimate), `packages/economic/src/versioned-input.ts` (pinned evidence snapshots) | P2-W3 |
| F4 | Deterministic, reproducible evaluation for a pinned evidence snapshot | reality-lab.md §Lab evaluation ladder step 3; work-orders.md P2-W3 acceptance | NEW-WORK-ORDER | Reference determinism machinery implemented: `sib/PaySwap@b5f20d6:packages/economic/src/compiler.ts:210` (compileEconomicGoal; declared algorithm/version, content-derived ids) | P2-W3 (reproducible-decision acceptance) |
| F5 | Replay of available history; synthetic/fault injection distinctly labeled | reality-lab.md §Lab evaluation ladder step 4 | NEW-WORK-ORDER | Spec-only in reference (its P6-W1); no replay engine code exists there | P2-W3 |
| F6 | Shadow evaluation without external effect | reality-lab.md §Lab evaluation ladder step 5 | NEW-WORK-ORDER | Spec-only in reference | P2-W3 |
| F7 | Bounded canary with owner/operator consent, budget, duration, stop/rollback | reality-lab.md §Lab evaluation ladder step 6 | NEW-WORK-ORDER | Approval machinery implemented in reference: `sib/PaySwap@b5f20d6:packages/trust/src/approval-artifacts.ts`, `scoped-gate.ts` | P2-W3 |
| F8 | Post-action measurement, cost/usage reconciliation, prediction-vs-reality deviations | reality-lab.md §Lab evaluation ladder step 7 | NEW-WORK-ORDER | Actuals arrive via canonical ADCOS usage/assurance (D5/D6) | P2-W3 (+ P3-W1 composed flow) |
| F9 | Hard constraints cannot be traded away by weighted reward | INVARIANTS #22; reality-lab.md §Hard constraints | NEW-WORK-ORDER | Implemented pattern: `sib/UniCom@1c003ec:packages/agent/src/intent.ts` (hard constraints checked before soft optimization) | P2-W3 |
| F10 | Anti-abuse: Sybil groups, fake utilization, collusive ratings, inflated demand, reward gaming, manipulated measurements | reality-lab.md §Hard constraints, learning and abuse para 3 | NEW-WORK-ORDER | Implemented patterns: `sib/ShareNet@662fad6:economics/src/antigaming.rs` (deterministic detection: cap saturation, reciprocal rings via SCC); `sib/UniCom@1c003ec:packages/agent/src/demand-aggregation.ts` (k-anonymity ≥3, leak detection) | Detection design in P2-W3; adversarial hardening in P4-W1 |
| F11 | Lab advisory-only: cannot create resource access, order upgrades, bind members, authorize payouts | reality-lab.md §2 last para; INVARIANTS #21 | NEW-WORK-ORDER | Constraint to encode in P2-W3 gates; reference law: `sib/PaySwap@b5f20d6:README.md:24` ("intelligence proposes; deterministic authorities decide and commit") | P2-W3 (+ P3-W1 gates) |

### G. Group provider Organizations and collective purchasing

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| G1 | Group provider Organization proposal/formation: roles, authority, commitments, obligations, allocation, join/withdraw/termination | group-organizations-and-purchasing.md §1 | NEW-WORK-ORDER | Implemented formation machine as design reference: `sib/UniCom@1c003ec:packages/commerce/src/domain/groupbuy.ts` (PENDING→COUNTERED→…→FORMED→CLOSED transition table lines 137-154; dual threshold; consent terms; withdrawal before formation) | P2-W3 (shared types in P1-W1: "Organization candidate/membership/mandate") |
| G2 | Candidate ≠ member agreement; nothing committed without owner consent + eligibility + mandate | group-organizations-and-purchasing.md §1 para 2; INVARIANTS #24 | NEW-WORK-ORDER | Pattern: `sib/UniCom@1c003ec:packages/agent/src/groupbuy.ts` ("INTEREST IS NEVER COMMITMENT"; commitment records as the only join path, no silent enrollment) | P2-W3 |
| G3 | Pool compatible demand for real offers (plans, bandwidth, hardware, backhaul, maintenance) | group-organizations-and-purchasing.md §2 | NEW-WORK-ORDER | None (demand pooling is ours); provider offers themselves come from the canonical boundary (D2) | P2-W3 |
| G4 | Real attributable offer with supplier, terms, threshold, cost, expiry, cancellation/refund, provenance; estimates labeled; hypothetical discount never a live quote | group-organizations-and-purchasing.md §2 para 2; INVARIANTS #23 | NEW-WORK-ORDER (offer *data* is PUBLIC-INTEGRATION via D2; the attributable-offer record + validation is ours) | Offer provenance/expiry pattern implemented: `sib/PaySwap@b5f20d6:packages/surface/src/quote-terms.ts`; canonical provider offers via `sib/ADCOS@d7db35e:offers/` behind the public boundary | P2-W3 |
| G5 | Group state machine: DISCOVERED→CANDIDATE→INVITED→OFFER_REQUESTED→OFFER_RECEIVED→VALIDATED→COMMITMENT_OPEN→THRESHOLD_MET→AUTHORIZED→ORDERED/CONTRACTED→FULFILLED→RECONCILED; failure states incl. EXPIRED, THRESHOLD_NOT_MET, WITHDRAWN, REFUND_PENDING, DISPUTED | group-organizations-and-purchasing.md §State machine and commitments | NEW-WORK-ORDER | Our spec's states are defined in-repo; no implementation. UniCom's implemented machines use a different vocabulary (PROPOSED/MERCHANT_REVIEW/HELD/FORMED…) — semantic mapping required, not name reuse (`sib/UniCom@1c003ec:packages/agent/src/groupbuy.ts:32-42`) | P1-W1 (state types) + P2-W3 (transitions; authoritative event/evidence required, not UI/model claims) |
| G6 | Member mandates: allowed service/amount/beneficiary scope, expiry, revocation; refusal/withdrawal handled per terms | group-organizations-and-purchasing.md §3 | NEW-WORK-ORDER | Mandate machinery implemented in reference: `sib/PaySwap@b5f20d6:packages/trust/src/` (mandates, attenuation) | P2-W3 (types in P1-W1) |
| G7 | Exact, versioned, auditable, reconciled allocations; estimated ≠ settled earnings | group-organizations-and-purchasing.md §3; INVARIANTS #25 | NEW-WORK-ORDER | Implemented reconciliation/finality pattern: `sib/PaySwap@b5f20d6:packages/protocol/src/settlement/{reconciliation,finality}.ts` (UNKNOWN sole-resolver; "SUBMITTED IS NOT FINALITY") | P2-W3 |
| G8 | Money movement delegated to authorized financial/payment authority; references + reconciled projections only | group-organizations-and-purchasing.md §3; authority-model.md row 16 | GAP (G-4) | No concrete payment authority is named, integrated, or selected anywhere in our specs or work orders; UniCom's payment domain is fixture-only (`sib/UniCom@1c003ec:docs/development-state/deployment-readiness-state.json`: `live_payments: NOT_AUTHORIZED`) | TL decision required: select payment authority + timing. Reference storage design proceeds in P2-W3 regardless |
| G9 | Matching by footprint/performance/window/customer type/cost cap/term/privacy/risk; no pooling of incompatible intents; no unnecessary demand exposure | group-organizations-and-purchasing.md §Matching and acceptance cases | NEW-WORK-ORDER | Privacy pattern: `sib/UniCom@1c003ec:packages/agent/src/demand-aggregation.ts` (k-anonymity, order-statistic bands, leak detection) | P2-W3 |
| G10 | Duplicate order prevention; UNKNOWN order/payment outcomes require reconciliation before retry; shortfall/partial fulfillment reconcile to participant level | group-organizations-and-purchasing.md §Acceptance cases; LLM-ARCHITECT-HANDOFF.md §Required proof | NEW-WORK-ORDER | UNKNOWN discipline pattern: `sib/PaySwap@b5f20d6:packages/provider-runtime/src/{idempotency,retrieval}.ts` (BEGIN/REPLAY/CONFLICT/AMBIGUOUS; reconcile-before-retry) | P2-W3; composed negative cases at P3-W1 |

### H. Commercial plane

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| H1 | Quotes/costs, group commitments, member allocation, invoice/payout projections | ADCOS-2.0.md §Logical planes 7 | NEW-WORK-ORDER | None; PaySwap surface/protocol packages are the pattern source (integer-minor-unit exact money: `sib/PaySwap@b5f20d6:packages/protocol/src/`) | P2-W3 |
| H2 | External payment references (not a competing ledger) | ADCOS-2.0.md §Logical planes 7; INVARIANTS #1 | GAP (G-4) | No payment rails exist in substrate or siblings (verified: UniCom live payments NOT_AUTHORIZED; PaySwap adapters deferred to its P5-W3; RoamLink commerce is projection-only) | Same decision as G8: authority selection + timing |

### I. Operations and assurance plane

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| I1 | Telemetry and freshness observation | ADCOS-2.0.md §Logical planes 8 | VERIFIED-INHERITED (telemetry primitives) — product-level freshness semantics are P1-W1 types + P2 lanes | substrate: `substrate:packages/shared/src/telemetry.ts`, `remoteUsageTelemetry.ts`, `telemetryRedaction.ts`; `packages/rpc/src/network-telemetry-middleware.ts`; sibling pattern: RoamLink projection freshness (`fresh_until`, `freshness_state`, `sib/RoamLink@2284134:spec/adcos-integration.md` §8) | P1-W1 (freshness types) + P2-W2/P2-W3 wiring |
| I2 | Incidents, audit, support operations | ADCOS-2.0.md §Logical planes 8 | NEW-WORK-ORDER | None in substrate; RoamLink implements notifications/support/audit patterns (`sib/RoamLink@2284134:packages/notifications/`, `packages/audit/src/audit-log.ts` tamper-evident chain) | P5-W1 (incident/support operations); audit-record design lands with P1-W1/P2 lanes |
| I3 | Recovery (durable state, restart, reconciliation) | ADCOS-2.0.md §Logical planes 8 | NEW-WORK-ORDER (product-level) — process-level recovery primitives are VERIFIED-INHERITED | substrate: `substrate:packages/zcode-server-cli/src/runtime/startupRecovery.ts`, `supervisor/crashBudget.ts` (inspected); canonical-side recovery domain exists (`sib/ADCOS@d7db35e:recovery/` M017) | P4-W1 (dead-letter/reconciliation, backup/restore); process primitives reused |
| I4 | Proof-bearing release gates | ADCOS-2.0.md §Logical planes 8; §Acceptance and change control | NEW-WORK-ORDER | substrate ships release tooling (`substrate:package.json` scripts `release`, `architecture:check`; `scripts/zcode-distribution-smoke.mjs`) — not ADCOS proof gates | P0-W2 checker (governance) now; product release gates at P5-W1 |
| I5 | Cloud control/UI separate from persistent edge data-plane forwarding; serverless control-plane not assumed to forward packets | ADCOS-2.0.md §Security and operations para 2 | NEW-WORK-ORDER | Deployment-shape constraint; canonical ADCOS itself is serverless control-plane only (`sib/ADCOS@d7db35e:api/index.py` Vercel ASGI; no data plane there) | Gateway runtime P2-W2 (edge); deployment shape P5-W1; work-orders.md P5-W1 records the exact rule |

### J. Security plane

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| J1 | Least privilege; tenant/resource isolation | ADCOS-2.0.md §Security and operations; work-orders.md P4-W1 | NEW-WORK-ORDER | None | P4-W1 |
| J2 | Abuse/rate/Sybil/collusion controls | ADCOS-2.0.md §Security and operations; work-orders.md P4-W1 | NEW-WORK-ORDER | Rate limiting exists at the canonical boundary we will consume (`sib/ADCOS@d7db35e:developerapi/ratelimit.py` + Upstash wiring in `runtime/wiring.py`) — our own abuse controls are new | P4-W1 (detection patterns from F10) |
| J3 | Privacy minimization; no payload inspection where aggregate evidence suffices; metadata minimization | ADCOS-2.0.md §Security and operations; connectivity-resource-provider.md §Measurements | NEW-WORK-ORDER | Sibling patterns: `sib/RoamLink@2284134:packages/domain-experience/src/device/device-context-snapshot.ts` (privacy-classified fields, country-code-only location, consent-gated fine location); UniCom k-anonymity | P2-W2 (design) + P4-W1 (enforcement/negative tests) |
| J4 | Secrets isolation; provider-native credentials never leak to core | authority-model.md row 11; INVARIANTS #3 | NEW-WORK-ORDER (product secrets architecture) — secret-storage primitives are VERIFIED-INHERITED | substrate: `substrate:packages/services/src/credential/credentialService.ts` (+providers), `packages/shared/src/node/privateFilePersistence.ts`, `atomicFileLock.ts` inspected | P4-W1; credential handling in P2-W2 adapters |
| J5 | Budget/data caps and hard-constraint enforcement in failover/optimization | INVARIANTS #19–20 | NEW-WORK-ORDER | None | P2-W2 (enforcement points) + P4-W1 (budget enforcement fixtures) |
| J6 | Fail-closed authorization for consequential commands; unknown/malformed fail closed | ADCOS-2.0.md §Security and operations; cross-device-coordination.md §Message and task contract para 2 | NEW-WORK-ORDER | None | P2-W2 |
| J7 | Respect operator subscriptions, tethering/resale, spectrum/equipment, privacy, jurisdictions | ADCOS-2.0.md §Security and operations last para; INVARIANTS #16 | NEW-WORK-ORDER | Operator terms checklist is an explicit P4-W2 output; policy inputs feed eligibility (C3) | P4-W2 (checklist + live validation); P2-W2 (policy inputs recorded) |

### K. Substrate and engineering governance

| ID | Requirement | Source | Classification | Evidence | Disposition / next action |
|---|---|---|---|---|---|
| K1 | Preserve upstream lineage, LICENSE, third-party notices | UPSTREAM-ZCODE.md; INVARIANTS #27 | VERIFIED-INHERITED | substrate: `LICENSE`, `THIRD-PARTY-NOTICES.md`, `third-party/` tree present at root (inspected) | P0-W1 owns the deep baseline comparison (not this lane) |
| K2 | Pinned toolchain: Node 24.14.0, pnpm 10.33.2 (mise as authority) | UPSTREAM-ZCODE.md | VERIFIED-INHERITED | substrate: `mise.toml` `[tools] node = "24.14.0"`, `pnpm = "10.33.2"` (inspected) | Maintain; no unreviewed upgrades |
| K3 | Project-spec conformance checker with negative fixtures | README §Development and evidence; work-orders.md P0-W2 | NEW-WORK-ORDER | Starter committed at baseline (`substrate:scripts/check-project-spec.mjs`); owned by Worker 2 | P0-W2 (in flight, other lane) |
| K4 | Product surfaces run on inherited Web/Desktop/CLI/agent substrate | README §Product capabilities bullet 7 | VERIFIED-INHERITED (substrate surfaces) — product content is A-plane NEW-WORK-ORDER | substrate: `packages/web`, `packages/desktop`, `apps/zcode-cli`, `packages/services/src/zcode-agent` (all inspected; build scripts in root `package.json`) | P2-W1 builds journeys on these surfaces |
| K5 | Evidence discipline: mock/simulation/catalog/declaration never presented as live capability | README §Development and evidence; INVARIANTS #6; LLM-ARCHITECT-HANDOFF.md §Required proof | NEW-WORK-ORDER (process + proof artifacts) | No mechanism yet; sibling precedent for evidence-class separation: `sib/ADCOS@d7db35e:developerapi/environments.py` (sandbox/production non-interchangeable), `deploy/verify.py` (evidence_class == "SOFTWARE") | Enforced via P0-W2 checker + per-work-order acceptance evidence; proof taxonomy in `docs/research/proof-plan.md` |

## Summary

- Rows: **81** (A:7, B:5, C:8, D:12, E:9, F:11, G:10, H:2, I:5, J:7, K:5).
- Classification counts (recount by ID):
  - **VERIFIED-INHERITED: 5** — E1, I1, K1, K2, K4 (rows whose *substrate-level* capability
    is itself the requirement; rows where a primitive exists but the product capability is new
    are classified NEW-WORK-ORDER with the inherited primitive cited as partial evidence:
    A5, B2, C6, I3, J4).
  - **PUBLIC-INTEGRATION: 14** — C3, D1–D12, E6.
  - **GAP: 2** — G8, H2 (both pending decision G-4).
  - **NEW-WORK-ORDER: 60** — all remaining rows.
- Every NEW-WORK-ORDER row maps to a P1–P5 work order in `spec/work-orders.md`; **no
  requirement is left without a covering work order except the five decisions below.**

## Gaps requiring TL decisions

- **G-1 ShareNet wire adaptation (blocking for D11/E6 integration claims).** ShareNet's
  `AdcosClient` targets its own unversioned, unauthenticated 7-endpoint mapping
  (`sib/ShareNet@662fad6:connectivity-client/src/wire.rs:15-21`) which does not interoperate
  with the deployed ADCOS v2.0 boundary (no `/api/2.0` prefix, no `X-ADCOS-*` headers, expects
  a nonexistent execution route). Decision needed: (a) ADCOS 2.0 serves ShareNet's table as a
  compatibility surface (with a ShareNet provider signing identity), (b) request ShareNet-side
  client changes (separately reviewed, per authority-model.md boundary rules), or (c) build an
  adapter service implementing `ConnectivityPort` semantics. Affects P2-W2 scope and P1-W1
  port shapes.
- **G-2 Identity/trust authority selection.** authority-model.md row 3 assigns principals to
  an "Approved identity/trust authority" without naming one. The substrate ships ZAI/BigModel
  OAuth for the ZCode product identity (`substrate:packages/web/src/auth/`). Decision needed:
  reuse substrate OAuth as the ADCOS 2.0 product identity, or integrate a separate authority.
  Affects P1-W1 principal reference types and P2-W1 login/role flows.
- **G-3 RoamLink relationship.** RoamLink owns customer identity/device context/ExperienceIntent
  in its own product and consumes the same canonical ADCOS boundary. Decision needed: is
  RoamLink (a) pattern/authority-model reference only (current spec reading), or (b) a live
  integration target for ADCOS 2.0 experiences (its `/v1` HTTP API)? Affects whether P2-W1/P3-W1
  include RoamLink-boundary integration tests or only ADCOS-boundary flows.
- **G-4 Payment/financial authority.** No payment rail is selected or integrated anywhere in
  this repo or the sibling set (verified: UniCom `live_payments: NOT_AUTHORIZED`; PaySwap
  adapters deferred; RoamLink commerce projection-only). Decision needed: which authorized
  payment system(s), and at which wave (P2-W3 reference shapes → P3-W1 composed purchases →
  P4-W2 earnings reconciliation all reference "the authorized financial/payment authority").
- **G-5 First advertised forwarding platform set.** P2-W2 acceptance requires "a real supported
  gateway path for advertised forwarding" and P4-W2 requires authorized device/OS/operator
  combinations, but no work order or spec selects the first advertised set (e.g., Linux gateway
  first; Android/iOS status constrained by platform limits in `sib/ShareNet@662fad6:transport/
  {android,ios}/` and ADCOS-2.0.md's warning that ordinary iOS apps cannot become general-purpose
  routers). Decision needed before P2-W2 exit criteria can be pinned.

## Handoff notes for P1-W1 (canonical shared contracts)

1. **Pin one evidence-class vocabulary.** Four sibling vocabularies already exist (ADCOS
   `evidence_class` + sandbox/live law; RoamLink's 7 classes; PaySwap's 7 evidence kinds +
   P0–P5 proof levels; ShareNet's declaration/observation/commitment/derived discipline; our
   INVARIANTS #4). P1-W1's "status/error/freshness types" should define the ADCOS 2.0
   vocabulary once and map sibling classes only at adapters.
2. **Envelope requirements are already enumerated** by cross-device-coordination.md
   §Message and task contract (E2) — schema/version, instance IDs, scope, issue/expiry,
   correlation/causation, idempotency key, payload digest, delegation ref, policy epoch,
   signature. The substrate's zcode-protocol-v4 wire frames (checksums, fragment reassembly,
   delivery kinds) are a reusable serialization precedent, not the contract.
3. **Group-buy states**: our spec's lifecycle (G5) differs from UniCom's implemented
   vocabulary; P1-W1 should pin our states and record the semantic mapping to UniCom
   (PROPOSED/MERCHANT_REVIEW/HELD/FORMED) as reference notes, not import them.
4. **Opaque-reference discipline**: all canonical ADCOS entities enter as opaque typed
   references (LOCK-114/117 discipline observed in `sib/ADCOS@d7db35e:developerapi/`); P1-W1
   reference types should preserve opacity so no sibling's internals leak into shared
   contracts.
5. **UNKNOWN-before-FAILED**: every sibling that models external effects implements an
   explicit UNKNOWN state with reconcile-before-retry (PaySwap provider-runtime, RoamLink
   projections, ADCOS reason codes). Encode it once in shared error/status types.
