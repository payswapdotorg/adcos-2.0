# Sibling-Domain Integration Survey — ADCOS 2.0 (P0-W3)

Status: RESEARCH ARTIFACT — observed public state only. This survey makes **no claim that any
sibling code is integrated into ADCOS 2.0**. Integration *existence* of a public surface is not
integration *status* of our product; nothing below implies wiring exists in this repository.

Survey method: each sibling repository was shallow-cloned on 2026-10-12 and its HEAD state
inspected directly (files, routes, tests, CI). Every claim below carries a file path relative to
that repository. Design intent recorded in sibling specs is marked **[SPEC]**; behavior verifiable
in code is marked **[CODE]**. Where a README claim could not be verified in code, that is said
plainly.

| Repo | Language / runtime | HEAD observed (2026-10-12) | Role for ADCOS 2.0 (per spec/authority-model.md) |
|---|---|---|---|
| payswapdotorg/ADCOS | Python (pure stdlib) | `d7db35e3ab4a6ede3929dfa712f61634784a298f` (2026-09-15) | Canonical connectivity exchange domain — live integration target |
| payswapdotorg/ShareNet | Rust (14 standalone crates + Kotlin/Swift adapters) | `662fad66b85d3c4b7e5c697209b47bee268973fe` (2026-09-19) | Peer/gateway transport + contribution accounting — live integration target |
| payswapdotorg/RoamLink | TypeScript (pnpm monorepo, 30 packages) | `22841342972fd459123128d945bf7cfdc95f1a3b` (2026-09-27) | Bounded experience/device-context semantics — authority-model reference; own product |
| payswapdotorg/UniCom | TypeScript (ZCode v3.14.3 fork) | `1c003ec2d998ab239145561b97169e513536e6a1` (2026-10-12) | Group-commerce **design reference** |
| payswapdotorg/PaySwap-3.0 | TypeScript (ZCode v3.14.3 fork) | `b5f20d631ff7e4f6f9628c08009e0b38f1c7f323` (2026-10-11) | Lab/Organization **design reference** |

---

## 1. payswapdotorg/ADCOS — canonical connectivity exchange

### 1.1 What it is

A Python "Adaptive Distributed Connectivity Operating System": a programmable connectivity
exchange ("one connectivity contract, many networks, continuous fulfillment") composing
provider-supplied 5G/Wi-Fi/fixed/satellite/mesh capabilities without owning provider-native
topology or radio/core authority (`README.md`). The repository is architecture-first with a
completed program: gates R0–R9 are complete and the program exit evaluation is recorded
SOFTWARE-class (`README.md` "Current transition state"; `spec/architect/roadmap.yaml`). 64
top-level domain modules [CODE, `ls`]: `contracts/`, `offers/`, `eligibility/`, `policy/`,
`assurance/`, `evidence/`, `executionplans/`, `adapters/`, `replan/`, `usage/`, `commercial/`,
`allocation/`, `payment/`, `developerapi/`, `runtime/`, `backends/`, `resilience/`,
`localfirst/`, `recovery/`, `credentials/`, `federation/`, `identity/`, `sessions/`, `mobility/`,
`multipath/`, `networkpath/`, `routing/`, `transport/`, `simulator/`, `conformance/`, `edge/`,
`mobile/`, `web/`, `marketplace/`, `client/`, plus sibling-specific vertical-proof harnesses
`sharenet/`, `roamlink/`, `comos/`.

This is exactly the domain spec/architecture/ADCOS-2.0.md §"Upstream and integration
boundaries" designates as owner of "canonical connectivity exchange": intent, offer,
eligibility, ConnectivityContract, execution plan, adapters, usage evidence, assurance, failover,
settlement references.

### 1.2 Public integration surface actually observed

**The Developer Connectivity API (M013) is the sanctioned application boundary [CODE]:**

- `developerapi/gateway.py` defines a frozen 21-route table `ROUTES` (lines 332–396):
  `GET application`; `POST/GET intents`; `GET intents/{}`; `GET intents/{}/lifecycle`;
  `POST intents/{}/offers`; `POST intents/{}/activation`; `GET contracts`; `GET contracts/{}`;
  `GET contracts/{}/usage`; `GET contracts/{}/assurance`; `POST contracts/{}/termination`;
  `POST contracts/{}/leases`; `GET leases`; `GET leases/{}`; `POST leases/{}/renewal`;
  `POST leases/{}/revocation`; `GET/POST webhook-endpoints`; `GET webhook-endpoints/{}`;
  `GET webhook-endpoints/{}/deliveries`.
- Admission pipeline [CODE, `developerapi/gateway.py` module docstring]: authenticate
  (constant-time, environment-bound) → resolve API version → rate limit (per application) →
  authorize scoped capability → durable write-ahead idempotency hold for mutations → adapt to
  the canonical `contracts` authority through its public command surface only → atomic journal
  append (persist-then-ack finality point) → durable webhook observation admission → response
  envelope.
- Wire discipline [CODE]: canonical JSON; headers `X-ADCOS-API-Version` (declared versions in
  `developerapi/schema.py` — currently `2.0`), `X-ADCOS-Application`, `X-ADCOS-Credential`,
  `X-ADCOS-Idempotency-Key`; response headers `X-ADCOS-Request-Id` / `X-ADCOS-Environment` plus
  rate-limit headers and a replay marker (`runtime/asgi.py` route documentation).
- Signed webhooks [CODE, `developerapi/webhooks.py`]: observation-only delivery channel
  ("delivery state never becomes canonical business state"), durable delivery obligation
  persisted before the API response, recovery across restart.
- SDK [CODE, `developerapi/sdk.py`]: in-repo Python SDK "that reproduces the canonical server
  semantics exactly" (`developerapi/__init__.py`).
- Environments [CODE, `developerapi/environments.py`]: sandbox and production are
  non-interchangeable isolated namespaces; sandbox results are never production/physical
  evidence; an `evidence_class` concept is surfaced by the demo endpoint
  (`deploy/verify.py` check 3 asserts `evidence_class == "SOFTWARE"`).
- **No execution-inspection route exists**: execution status is *derived from contract state*
  (`developerapi/gateway.py:233` `execution_status_reported_from_contract_state`); execution
  material rides opaque `execution-scope` / `execution-artifact` typed references (LOCK-114 /
  LOCK-117 discipline in the module docstring).

**Deployment surface [CODE]:** `api/index.py` is a Vercel serverless entry exporting a
pure-stdlib ASGI app built by `runtime/wiring.py:build_app_from_env` (production mode on Neon
Postgres via `ADCOS_DATABASE_URL`, deterministic sandbox mode otherwise; Upstash rate limiting;
R2 artifacts). Routes served: `/healthz`, `/readyz`, `POST/GET /demo/contract-fulfillment`,
`ANY /api/{version}/{resource...}` for declared versions, `GET /api/contracts/{id}`
(`runtime/asgi.py`). The production alias `https://adcos.vercel.app` is recorded READY/PROMOTED
(`docs/deployment/acceptance-record.md:32`) with a live-acceptance harness
(`deploy/verify.py --base-url ...`) covering health, readiness, demo determinism, cold-start
persistence, coordination/artifact backends, and error envelopes.

**Vertical-proof batteries [CODE]:** `sharenet/` (M010), `roamlink/` (M11), `comos/` (M012)
model each sibling as an **external application over the SDK + public request surface**
(`sharenet/__init__.py` composition map) while representing not-yet-accepted child domains
(eligibility, assurance, execution plans, provider realization, replan, usage) as clearly
labeled deterministic simulation seams (`sharenet/seams.py`, `roamlink/simulation.py`).

### 1.3 Language / runtime / how ADCOS 2.0 would mechanically talk to it

Python, standard library only (no FastAPI/Flask — the ASGI layer is hand-rolled stdlib,
`runtime/asgi.py`). Integration from the ADCOS 2.0 TypeScript substrate is **HTTP JSON against
the deployed `/api/2.0/*` boundary** with the `X-ADCOS-*` header contract, or reuse of the wire
shapes for a sandbox-compatible local harness. The in-repo Python SDK is not directly
consumable from TypeScript; a TS client must be written against the frozen route table and
canonical JSON profile (exactly what RoamLink did — see §3). Webhooks are the inbound
observation channel; polling the route table is the read path.

### 1.4 Maturity signals

- Batteries recorded per domain in `README.md`: contracts (M002), offers 49/49 (M003),
  eligibility 46/46 re-baselined, policy 103/103 (M004), assurance 97/97 (M005), executionplan
  36/36 (M006), adapters 70/70 (M007), replan 38/38 (M008), usage/commercial/payment 44/44
  (M009), developerapi (M013), sharenet 33/33 (M010), roamlink 56/56 (M011), comos 33/33
  (M012), client 24/24, scale 45/45. Self-run tooling: `tools/*_selftest.py` per module
  [CODE, `ls tools/`].
- CI [CODE, `.github/workflows/spec-check.yml`]: spec-consistency checks, Tech-Lead dispatch
  guard, architecture drift classification on PRs.
- Governance depth: ACR/DEC decision registry, frozen Architecture 1.1
  (`spec/architecture.md`, `spec/architecture-lock.md`), per-work-item acceptance records.
- Honest limitation: the whole program exit is **SOFTWARE-class** — deterministic software
  proof only; no physical-network or live-provider evidence is claimed anywhere
  (`README.md`, `deploy/verify.py` check 3).

### 1.5 Integration risks

1. **All evidence is software-class.** The deployed control plane has never been proven against
   physical networks/providers; ADCOS 2.0 must not treat the exchange as live-provider-verified
   (consistent with our INVARIANTS #5–6).
2. **Route semantics are contract-record-derived**: no execution-inspection route; ShareNet's
   expected `GET /contracts/{id}/execution` (see §2) does not exist on this boundary.
3. **Auth is application-credential headers**, constant-time verified, per-application rate
   limits — ADCOS 2.0 must obtain/register application credentials and respect the idempotency
   hold semantics (retry discipline documented in `developerapi/gateway.py`).
4. **Serverless control plane only**: Vercel + Neon + Upstash + R2. Same constraint our
   architecture records — control-plane APIs, not always-on packet forwarding
   (spec/architecture/ADCOS-2.0.md §"Security and operations"). The data plane does not exist
   here.
5. **Webhook delivery is observation-only** and durable-obligation based; consumers must
   reconcile against canonical reads rather than trusting delivery state
   (`developerapi/gateway.py` docstring; matches RoamLink's reconciler design).

---

## 2. payswapdotorg/ShareNet — peer/gateway transport and contribution accounting

### 2.1 What it is

Rust "internet bridging infrastructure for people without reliable Internet access"
(`README.md`): live bridging, opportunistic bridging, store-carry-forward, measured
contribution ("Civic Points"), and connectivity orchestration where "ADCOS acquires and
continuously assures external gateway connectivity without becoming part of ShareNet's data
plane" (`README.md:15-21`). Program state: `spec/roadmap.yaml` declares
`FROZEN_PATH_EXECUTION_COMPLETE__POST_CLOSURE_PRODUCTIZATION_ACTIVE`; gates R0–R10 COMPLETE;
post-closure productization only C2-005 complete (`docs/tech-lead/EXECUTION-STATE.md`).

Structure [CODE]: no root Cargo workspace — 14 standalone crates (each with own `Cargo.toml`):
`reference/crates/sharenet-protocol` (identity, canonical CBOR, links, topology, routes,
circuits, revocation, content, contribution receipts, signed connectivity observations),
`connectivity/` (the ADCOS boundary domain: `ConnectivityPort` trait, opaque refs, projections,
durable health-projection store), `connectivity-client/` (the ADCOS wire client + test server),
`developer-api/` (hosted Developer API **model layer only**), `admission/`, `economics/`
(Civic Points valuation/ledger/anti-gaming), `dtn/` (custody store),
`transfer/`/`propagation/`, `recovery/`, `transport/{linux,quic,ice,telemetry,android-bridge}`
plus Kotlin `transport/android` and Swift `transport/ios`.

### 2.2 Public integration surface actually observed

- **`ConnectivityPort` trait** [CODE, `connectivity/src/port.rs`, exported via
  `connectivity/src/lib.rs:103-141`]: `createIntent / discoverOffers / acceptOffer /
  getContract / getAssurance / getExecution / terminate` over opaque references. Zero
  dependencies. This is the sanctioned seam (`spec/integrations/adcos.md`).
- **The ADCOS wire client** [CODE, `connectivity-client/src/wire.rs:15-21` + `client.rs`]:
  hand-rolled minimal HTTP/1.1 (no chunked, no keep-alive, one request per connection) over std
  TCP with a **7-endpoint table**: `POST /intents`, `GET /intents/{id}/offers`,
  `POST /intents/{id}/offers/{offer}/accept`, `GET /contracts/{id}`,
  `GET /contracts/{id}/assurance` (returns hex `signed_envelope`), `GET /contracts/{id}/execution`,
  `POST /contracts/{id}/terminate`. `AdcosConfig::new(SocketAddr)` — **raw socket address, no
  DNS, no TLS, no auth headers** (no `Authorization`/`X-ADCOS-*` anywhere in `connectivity-client/src/`).
- **`adcos_test_server`** [CODE, `connectivity-client/src/bin/adcos_test_server.rs`, 639 lines]:
  the de-facto reference implementation of ShareNet's expected server side — deterministic
  in-memory store, injectable faults, deterministic signing provider.
- **Signed observations** [CODE + SPEC]: `SignedConnectivityObservation` = canonical-CBOR
  `{1: observation, 2: signature}` envelope, Ed25519-signed by a provider holding a ShareNet
  `Identity`, per-(provider, contract) strictly-increasing sequence, six frozen event kinds
  (`contract_activated`, `execution_state_changed`, `degraded`, `assurance_available`,
  `failover_replan`, `terminated`) — `reference/crates/sharenet-protocol/src/contribution.rs`,
  `spec/protocol-registry.yaml:137-146`, `connectivity-client/README.md:63-105`.
- **Polling only, no webhooks/event push** [CODE, `connectivity-client/README.md:150`]:
  "No webhook/event push — polling only, as designed for R5-002".
- **Crate library APIs** [CODE]: all crates publish Rust libraries with extensive public
  modules (e.g. `sharenet-protocol/src/lib.rs` re-exports ~120 public types) — but every crate
  is `publish = false`, unversioned (0.1.0), path deps; nothing is on crates.io.
- **No daemon, no served API** [CODE]: only 3 `TcpListener` sites in the whole repo
  (`adcos_test_server.rs`, `transfer/src/bin/sharenet_transfer.rs`,
  `transfer/tests/multiprocess_resume.rs`); no WebSocket or gRPC; the hosted Developer API
  (`developer-api/`) is explicitly "pure model — no I/O, no wall clock, no transport"
  (`developer-api/README.md:26-28`); `sdk/`, `node-agent/`, `console/`, `console-api/` named in
  `spec/product-console-plan.yaml` **do not exist as code**.

### 2.3 Language / runtime / mechanical integration path

Rust edition 2021, `rust-version = "1.75"` pinned across crates; RustCrypto-only dependencies
(ed25519-dalek, sha2, hmac, x25519-dalek, chacha20poly1305) except the `transport/quic` island
(quinn 0.11 + rustls + tokio). Kotlin/Gradle Android (compileSdk 35) and Swift Package iOS
adapters exist [CODE, `transport/android/`, `transport/ios/Package.swift`].

Mechanical options for ADCOS 2.0 (assessed from observed surface only):

1. **Serve ShareNet's wire table** — implement the 7-endpoint HTTP/JSON surface (including
   `GET /contracts/{id}/execution`, which the real ADCOS route table does not have) with
   Ed25519-signed observations from a ShareNet provider identity; `adcos_test_server.rs` is a
   complete reference.
2. **Adapt at the port** — implement `sharenet_connectivity::ConnectivityPort` against
   whatever ADCOS 2.0 exposes; ShareNet's own architecture expects adapter-side changes
   (`connectivity-client/README.md:146-148`: "The wire shape is THIS repo's documented mapping
   of the ADCOS developer API; a real ADCOS deployment may differ").
3. **Library embedding** — git/path crate dependency into a Rust sidecar; not a supported
   public boundary per their lock L031 and impractical from our TypeScript substrate.

**Verified drift [CODE, cross-repo]:** ShareNet's client speaks raw paths (`POST /intents`,
`connectivity-client/src/http.rs:188` "POST /intents HTTP/1.1") with no `/api/2.0` version
prefix and no `X-ADCOS-*` headers, and expects an execution route that does not exist in
ADCOS's frozen 21-route table. **ShareNet's mapping does not mechanically interoperate with
the deployed ADCOS v2.0 boundary as-is.** An adapter decision (who moves: ShareNet's client,
or an ADCOS-2.0-side compatibility surface) is required and is recorded as a gap in
docs/baseline/capability-inventory.md.

### 2.4 Maturity signals

~980 Rust `#[test]` functions counted across crates (connectivity 50, connectivity-client 50,
developer-api 79 — the C2-005 "verified 79/79" claim in the HEAD commit matches exactly —
economics 74, recovery 90, dtn 34, transfer 72, admission 25, propagation 73,
sharenet-protocol 244, telemetry 35, ice 62, linux 78, quic 9, android-bridge 5), 42
integration-test files, 14 committed JSON test vectors, a 3-language conformance harness
(`reference/conformance/run_harness.sh`), 19 Kotlin/Swift test files. CI is governance-only
(`.github/workflows/architecture-governance.yml` runs `tools/architecture_check.py`; **no
`cargo test` in CI**). Honest-limitation culture: per-crate README "honest limits" sections,
1852-line `docs/tech-lead/EXECUTION-STATE.md` evidence log, self-declared gaps (no
physical-device GMS run, iOS unverified in sandbox, no real ADCOS provider ever exercised,
`simulation/results.md` labeled simulation-only).

### 2.5 Integration risks

1. **Wire drift vs real ADCOS** (verified above): unversioned, unauthenticated, prefix-less
   mapping exercised only against its own test server.
2. **No transport security on the ADCOS channel**: no TLS, no DNS, no client credentials
   (`connectivity-client/README.md:149-153` documents these as future hardening).
3. **No event push**: polling-only; ADCOS 2.0 must expect poll-based eventual consistency and
   offline-first behavior (during ADCOS outage ShareNet keeps local state, refuses new
   acquisition — `spec/integrations/adcos.md:62-70`).
4. **Store-carry-forward is ShareNet-local custody semantics**, not BPv7 interop (future
   adapter per `spec/architecture.md:260`); our architecture permits SCF only for
   delay-tolerant intents — the seam for that classification is ours to build.
5. **No daemon/service**: the composition point (long-running client with durable projection
   store) must be built by the integrator; pieces exist as libraries
   (`AdcosClient`, `DurableProjectionStore`, admission policy).
6. **Contribution accounting boundary**: Civic Points ledger is node-local; receipts are the
   receiving counterparty's authenticated claim, "NOT proof of useful work"
   (`spec/protocol-registry.yaml` trust_boundary_note); monetary redemption explicitly a
   separate settlement program (lock L019). ADCOS 2.0 stores references only — no parallel
   accounting authority (our authority-model.md row for ShareNet).

---

## 3. payswapdotorg/RoamLink — experience/device-context sibling product

### 3.1 What it is

TypeScript pnpm monorepo (30 packages, 4 apps, 3 services): "the Connectivity Experience OS
built on top of ADCOS" (`README.md:3`) that compiles customer experience intents into
"technology-neutral ADCOS connectivity intents" while "ADCOS remains authoritative for
connectivity execution" (`README.md:7`). It explicitly is not an eSIM marketplace, carrier,
SD-WAN replacement, routing/session engine or provider registry (`README.md:9`). Its own
authority model (`spec/authority-model.md`, 17 rows) gives RoamLink customer/user/org identity,
device registry/context, ExperienceIntent, commerce, support, notifications, edge UX; ADCOS
keeps ConnectivityIntent, eligibility, offers, reservations/leases, paths, sessions, mobility,
usage evidence, settlement. Boundary rules include "a command that affects ADCOS-owned state
must cross the ADCOS integration boundary" and seven evidence classes
(`AUTHENTICATED, OBSERVED, REPORTED, DERIVED, INFERRED, STALE, UNKNOWN`).

### 3.2 Public integration surface actually observed

- **ADCOS v2 client (RoamLink as consumer of the canonical domain) [CODE]**: a closed 21-route
  table at `packages/adcos/src/routes.ts:58-85` that **matches the ADCOS
  `developerapi/gateway.py` ROUTES table one-to-one** (intents/lifecycle/offers/activation,
  contracts/usage/assurance/termination, leases/renewal/revocation, webhook-endpoints/
  deliveries). Headers `X-ADCOS-API-Version: 2.0`, `X-ADCOS-Application`, `X-ADCOS-Credential`,
  `X-ADCOS-Idempotency-Key` (`packages/adcos/src/headers.ts:17-22`, constructed per-request at
  `packages/integration/src/transport.ts:219-227`). Typed `AdcosClient` interface
  (`packages/adcos/src/client.ts:63-158`). Response documents deliberately "route-nominal
  opaque document types" (`packages/adcos/src/documents.ts`).
- **Inbound ADCOS webhooks [CODE]**: 9 event types + closed 9-member envelope
  (`packages/adcos/src/webhooks.ts:46-145`), HMAC-SHA256 verification with 300 s replay window
  and bounded retries (`packages/webhook-inbox/src/verifier.ts`), ingress at
  `POST /v1/webhooks/adcos` (`services/api/src/api-service.ts:228`).
- **RoamLink's own public API [CODE]**: `/v1` resources (users, organizations, devices,
  experience-intents, products, orders, subscriptions, payments, connectivity, notifications —
  `spec/api.md`) implemented in `services/api` with 19 live mutation kinds and 8 routes
  returning honest typed 501 `READ_MODEL_NOT_COMPOSED` (`services/api/src/read-models.ts:118-160`).
- **Domain packages [CODE]**: `domain-experience` (device aggregate, closed 11-name capability
  vocabulary `src/capability/device-capability-name.ts:22-34`, privacy-classified
  `DeviceContextSnapshot` with country-code-only coarse location and consent-gated fine
  location, immutable `ExperienceIntent` with supersession chain, `ExperienceDecision`
  read-model where STALE/UNKNOWN weigh zero), `intent-compiler` (deterministic
  ExperienceIntent → ADCOS ConnectivityIntent command), `projections`/`reconciliation`
  (§8-shaped projection records with source_authority/payload_digest/fresh_until/evidence_class),
  `webhook-inbox`, `edge`/`edge-actions` (capability+observation+offline outbox),
  `enterprise` (API keys, outbound customer webhooks), persistence (pg/pglite).

### 3.3 Language / runtime / mechanical integration path

TypeScript ^5.7.2 (TS-source exports, no build step), Node >=22, pnpm 10.0.0, vitest per
package, Next.js 16 + React 19 only in `apps/portal-host`. **All 51 package.json files are
`"private": true`** — nothing is npm-published; no shared types package is consumable
externally. Integration with RoamLink would be **HTTP against its deployed `/v1` API** (demo
deployed on Vercel + Neon per `docs/release-verification-2026-09-27.md`) — but for ADCOS 2.0
the primary relevance is upstream: RoamLink consumes the same canonical ADCOS boundary we must
consume, and its authority model is the pattern our experience plane must not duplicate.

### 3.4 Maturity signals

271 `.test.ts` files; recorded gate battery "2,868 tests passed, 21 named-skips"
(`docs/release-verification-2026-09-27.md:39-40`); negative-proof conformance suites with
toggleable violating fixtures (`tests/conformance/`); CI runs `pnpm check`
(lint+typecheck+test+architecture) on all pushes (`.github/workflows/ci.yml`). Deployed demo
with readiness/degradation reporting and executable release gates
(`scripts/release/{mvp-gate,production-gate}.mjs`). Honest gaps self-recorded: 8 typed-501 read
routes; mutations accept-only pending the command-execution worker path (`README.md:685-687`);
**ADCOS never configured in the deployed demo — "NOT CONFIGURED — fail-closed"**
(`docs/release-verification-2026-09-27.md:132`); "ADCOS production credentials are still a
required external integration flip" (`spec/current-state.md:134`). All ADCOS interaction is
tested against a deterministic `FakeAdcos` (`packages/integration/test/fake-adcos.ts`).

### 3.5 Integration risks

1. **Experience-plane authority overlap with ADCOS 2.0**: RoamLink is authoritative for
   customer identity, device registry/context and ExperienceIntent *in its product*. ADCOS 2.0
   plans its own customer/contributor/org surfaces (P2-W1). The spec's instruction is "Reuse
   its authority/integration model; do not create duplicate connectivity authority" — the
   open question is whether ADCOS 2.0's experience plane treats RoamLink as a live integration
   target (its `/v1` API), or as pattern reference only. No current work order resolves this;
   recorded as a GAP for TL decision in the capability inventory.
2. **Assumed wire details**: several ADCOS v2 details are flagged as assumptions in RoamLink
   source (webhook signature separator, hex encoding, some transition tables —
   `packages/adcos/src/webhooks.ts:20-25`, `packages/webhook-inbox/src/verifier.ts:25-27`).
   They happened to match the real ADCOS gateway, but the assumptions were never validated
   against a live ADCOS deployment.
3. **Version pin**: `SUPPORTED_ADCOS_API_VERSIONS = ["2.0"]` only
   (`packages/contracts/src/env/env-schema.ts:49`); drift fails closed.
4. Nothing is published — any code reuse is source-level (Apache-2.0).

---

## 4. payswapdotorg/UniCom — group-commerce design reference

### 4.1 What it is

A ZCode v3.14.3 fork (same upstream pin as ADCOS 2.0 — root `package.json` still
`"name": "zcode", "version": "3.14.3"`) transformed into an "AI-native Commerce Operating
System" (`README.md:3`) with the loop "Goal → Observe → Plan → Simulate → Approve → Execute →
Verify → Learn" (`README.md:5-7`). Group buying is a headline capability: "User agents can
discover merchant group purchases, recruit compatible participants, and suggest new group-buy
programs to merchant agents when enough demand exists" (`README.md:73-75`). ADCOS 2.0's
spec/architecture/ADCOS-2.0.md line 22 classifies it as "the design reference for group-buy
discovery and collective commerce" — correctly, per the evidence below.

### 4.2 What is actually implemented (the patterns ADCOS 2.0 P2-W3 adapts)

- **Group-buy formation machine [CODE]**: `packages/commerce/src/domain/groupbuy.ts` —
  `GroupBuyFormationState` = PENDING|COUNTERED|REJECTED|EXPIRED|MONITORING|HELD|FORMED|CLOSED
  (lines 31-52) with a full transition table (lines 137-154); dual threshold gate
  (minimumParticipants AND minimumUnits); `GroupBuyInterestRecord` with explicit
  consent terms and EXPRESSED/WITHDRAWN states ("INTEREST IS NEVER COMMITMENT");
  withdrawal allowed any time before formation; honest THRESHOLD_LOST demotion
  (HELD→MONITORING); frozen exact group price/pool value in formation terms.
- **Agent coordination plane [CODE]**: `packages/agent/src/groupbuy.ts` — `GroupBuyStatus`
  (PROPOSED|MERCHANT_REVIEW|COUNTERED|ACCEPTED|OPEN|THRESHOLD_MET|EXECUTED|EXPIRED|CANCELLED|
  REJECTED), `GroupBuyCommitment` (AuthorizationDecision) as the only join path — no silent
  enrollment; `GroupBuyProposal`/`MerchantGroupBuyResponse` offer-request/counter flow;
  `isGroupBuyExecutable()` gating on status+authorization+window+threshold.
- **Discovery/formation engine [CODE]**: `packages/agent/src/groupbuy-formation.ts` —
  deterministic intent→listing matching, formation ledger with exactly-once GROUP_FORMED,
  idempotent duplicate joins, deterministic dissolution at window close.
- **Demand aggregation with privacy [CODE]**: `packages/agent/src/demand-aggregation.ts` —
  k-anonymity (default minimum 3), order-statistic price bands, raw-intent leak detection.
- **Command landing [CODE]**: `packages/commerce/src/runtime/handler-groupbuy.ts` — 7 typed
  idempotent commands (OPEN/RECORD/WITHDRAW INTEREST, DECIDE, FORM, CLOSE, EXPIRE) with
  actor-identity enforcement.
- **Adjacent machines [CODE]**: TradeCycle multi-hop execution with per-leg authorization and
  rollback (`domain/tradecycle.ts`, `tradecycle-legs.ts`), orders/returns/refunds/recourse/
  settlement, `linking-draft.ts` connecting FORMED groups to order/settlement drafts.
- **UI journeys [CODE]**: `packages/web/src/commerce-modules/buyer-groupbuy/` and
  `merchant-groupbuy-review/` drive the canonical machines in-browser; browser-gate evidence
  committed (`docs/commerce-integration/merged-gate/evidence/08-journey-J4-buyer-groupbuy.png`).

### 4.3 Integration surface & mechanical use

**There is no mechanical integration surface.** All `@unicom/*` packages
(`commerce`, `agent`, `experience`) are `"private": true`, v0.1.0
(`packages/*/package.json`); no HTTP API exists — the commerce API is a typed **loopback
dispatcher** (`packages/experience/src/runtime/api/server.ts`, zero `createServer`/`.listen`
matches); standing gates record `production_deployment: NOT_AUTHORIZED`,
`live_payments: NOT_AUTHORIZED` (`docs/development-state/deployment-readiness-state.json`).
Therefore ADCOS 2.0's use is **source-level pattern adaptation** under Apache-2.0 (`LICENSE`,
`NOTICE.md`, `THIRD-PARTY-NOTICES.md` preserved), sanctioned by our authority-model.md row:
"Group-buy discovery/commerce reference patterns | payswapdotorg/UniCom; binding order/finance
remains with the applicable commerce/payment authority."

### 4.4 Maturity signals & reuse risks

239 test files on disk (commerce 72, agent 57, experience 105); the documented "2,219 passed |
0 skipped" battery (`docs/deployment-readiness/FINAL-REPORT.md` §2) is consistent with static
`it(`/`test(` counts (≈521 commerce + ≈555 agent + ≈764 experience) — not re-executed here.
CI is build-only for web (`.github/workflows/canonical-web-build.yml`). 52 work-order docs, 11
development-state registries, honest self-audit ("green checks … do not mean implementation is
complete", `docs/FINAL-FEATURE-AUDIT-2026-10-05.md`).

Risks: (a) vocabulary mismatch — ADCOS's spec lifecycle (DISCOVERED→CANDIDATE→INVITED→…) does
not exist in UniCom; semantic equivalents must be mapped, not names; (b) bespoke exact-money
primitives (integer minor units) need adaptation to our shared contracts; (c) architecture
policy (`architecture-policy.yaml` publicEntrypoints) constrains deep imports if wholesale
vendoring were ever attempted; (d) demo fixtures power the web journeys (`commerceEntry.tsx`
"demo fixtures only") — the machines are tested, the commerce surfaces are fixtures.

---

## 5. payswapdotorg/PaySwap-3.0 — Lab / Organization design reference

### 5.1 What it is

A second ZCode v3.14.3 fork (identical upstream pin `29628c9…` per `spec/UPSTREAM-BASE.md`)
being transformed into a "universal economic operating system … governed by a deterministic
PaySwap financial protocol" (`README.md`) with the core law "intelligence proposes;
deterministic PaySwap authorities decide and commit" (`README.md:24`). Its frozen architecture
(`spec/architecture/PAYSWAP-3.0.md`, version `3.0-foundation-2026-10-08`) defines exactly the
patterns our spec/reality-lab.md cites: five authorities (Financial Protocol; Trust &
Authorization; Capability & Network; Policy & Governance; Intelligence and Learning —
"candidate plans, strategies, Organizations, experiments, opportunities, optimization… never
commits financial truth"), Strategy-vs-Organization separation ("Strategy describes what should
happen. Organization describes who or what executes it. Director combines deterministic
controls with replaceable learned components"), the Reality Engineering Lab ("searches
strategies, Organizations, capabilities, route structures, provider choices, timing and
interventions using replay, counterfactuals, robustness, shadow and canary promotion"), and the
typed, versioned Economic Execution Graph.

### 5.2 What is actually implemented vs spec-only

**The named Lab/Director/EEG patterns are SPEC-ONLY at this HEAD.** Grep for
`counterfactual|Director|canary|RealityLab|FinancialOpportunity|EEG` across the five domain
packages: zero code hits; `packages/economic/src/candidate.ts:7,89,93` states the implemented
`CandidateSkeleton` is "NOT the EEG (P3-W2)". The repo's own work-order state
(`spec/development-state/current-state.json`) records completed P0/P1 + P2-W2/P2-W3 with
frontier `["P2-W1"]` — Lab, Organizations, EEG, and opportunity discovery are future work
orders (P3-W1/P3-W2/P6-W1/P6-W2) there too.

**What IS implemented (5 private, zero-dependency, deterministic TypeScript leaf packages,
~19.8k LOC, 726+ vitest tests):**

- `@payswap/economic` [CODE]: EconomicGoal → typed candidates → deterministic compilation
  (`src/compiler.ts:210` `compileEconomicGoal`), `VersionedEconomicInput` (versioned, pinned,
  canonical-JSON evidence snapshots, `src/versioned-input.ts`).
- `@payswap/protocol` [CODE]: exact Money (bigint minor units), obligations/netting/
  reservations, `FinalityAuthority.declareFinality` ("SUBMITTED IS NOT FINALITY"),
  `SettlementReconciliationAuthority.resolveCase` (sole resolver of UNKNOWN),
  `EvidenceGraph` with 7 distinct evidence kinds, P0–P5 provenance-capped proof levels
  (`src/settlement/*.ts`).
- `@payswap/trust` [CODE]: principals, mandates, strict delegation attenuation, approval
  artifacts, scoped gates, policy+security epochs, security blocks (`src/index.ts`).
- `@payswap/provider-runtime` [CODE]: connection lifecycle state machine, credential
  isolation (opaque handles), execution bridge with CONFIRMED/**UNKNOWN**/FAILED external-effect
  envelope, endpoint-specific idempotency (BEGIN/REPLAY/CONFLICT/AMBIGUOUS), reconcile-before-
  retry gate, SANDBOX/LIVE law (`src/execution-bridge.ts`, `src/idempotency.ts`,
  `src/execution-mode.ts`).
- `@payswap/surface` [CODE]: framework-independent contracts — 5 outcome actions, quote terms
  with fees/rate provenance/expiry/guarantee-vs-estimate, progress states,
  discovery/corridor coverage, BLOCK/ALLOW/UNKNOWN security vocabulary (`src/quote-terms.ts`).

### 5.3 Integration surface & mechanical use

No HTTP endpoints (the Hono server is inherited ZCode platform), no npm publication (all
`@payswap/*` private). ADCOS 2.0's use is exactly what spec/reality-lab.md line 5 states:
**adapt the patterns** — plus optionally source-adapt the leaf packages (they were deliberately
authored with zero sibling imports and zero runtime deps, "parallel-lane self-containment",
`spec/economic/ECONOMIC-MODEL.md:4`, making them unusually portable under Apache-2.0). There is
**no Lab code to port** — ADCOS 2.0 P2-W3 must re-derive the Lab from PaySwap spec text and
adapt the implemented adjacent machinery (typed candidates, pinned evidence snapshots,
deterministic folds, evidence lineage, promotion-gate vocabulary, UNKNOWN discipline).

### 5.4 Maturity signals & reuse risks

Test counts verified statically: provider-runtime **159** (matches claim exactly), surface
**106** (matches), economic 105, protocol 238, trust 118 `it()` blocks vs a claimed 138
(counted cases may differ — flagged, not debunked; vitest not executable in this research
environment). Evidence records with exact commands/exit codes
(`docs/provider-runtime-evidence/BASELINE-VERIFICATION-RECORD.md`, etc.). CI: 5 jobs including
a packages matrix (`​.github/workflows/ci.yml`). Risks: payment-domain coupling (Money/
obligations/netting/settlement vocabulary must be re-mapped to connectivity economics: data
costs, byte accounting, subscription allocation); in-memory-only stores (durability is an
explicitly deferred work order there — an ADCOS port must add its own); structural duplication
law (contract shapes pinned byte-identical in 4+ places — a copy-adapt must pick single
owners); architecture-policy files would need reconciliation if tooling is adapted.

---

## 6. Cross-repo findings for the capability inventory

1. **RoamLink's ADCOS client matches the real canonical surface** (21-route v2.0 table,
   header contract) — evidence that the ADCOS developer API is the stable integration point
   for experience-plane consumers. RoamLink has never run it against live ADCOS (deployed demo
   reports ADCOS "NOT CONFIGURED — fail-closed").
2. **ShareNet's ADCOS client does not match the real canonical surface** (7-endpoint table,
   no version prefix, no auth headers, expects a nonexistent execution route, tested only
   against its own `adcos_test_server`). Bilateral wire pinning or an adapter decision is
   required before any ShareNet-path integration claim.
3. **Both "references" (UniCom, PaySwap-3.0) are private-package monorepos with no served
   API** — integration with them is design/source adaptation, never a runtime boundary. The
   authority-model.md rows already reflect this; the inventory must keep classification honest
   (PUBLIC-INTEGRATION only for ADCOS/ShareNet/RoamLink-shaped boundaries).
4. **All sibling evidence is software-class or fixture-class.** ADCOS's program exit is
   recorded SOFTWARE-class; ShareNet's physical-device gaps are self-declared; RoamLink's live
   ADCOS flip is pending credentials; UniCom's payments are NOT_AUTHORIZED; PaySwap's Lab is
   spec-only. Nothing anywhere in the sibling set constitutes live-provider or physical-network
   proof — consistent with our INVARIANTS #5–6 and the P0-W3 mandate to prevent over-claiming.
5. **Three independent evidence-class vocabularies already exist** (ADCOS
   `evidence_class`, RoamLink's 7 classes, PaySwap's 7 evidence kinds + P0–P5 proof levels,
   ShareNet's declaration/observation/commitment/derived discipline). P1-W1 shared contracts
   must pin ONE ADCOS 2.0 vocabulary and map siblings' classes at adapters — recorded as a
   handoff note.
