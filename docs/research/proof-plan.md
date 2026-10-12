# Proof Plan — Physical-Device and Provider-Validation Evidence — ADCOS 2.0 (P0-W3)

Status: RESEARCH ARTIFACT — a plan for evidence the product will need. **No proof described
here has been produced.** Nothing in this repository has been tested on physical devices or
against live providers at baseline (`spec/development-state/current-state.json`:
`IMPLEMENTATION_NOT_STARTED`). This plan exists so that later work orders (P2-W2, P2-W3,
P3-W1, P4-W1, P4-W2, P5-W1) can budget, schedule, and gate on the right evidence — and so
that over-claiming stays structurally impossible.

## Evidence classes (the labeling law)

Derived from `spec/architecture/INVARIANTS.md` #4–6, `spec/dependency-graph.md` §"Verification
ladder" ("Every report distinguishes mock/simulation, real-device, sandbox provider, and
live-provider evidence"), and `docs/LLM-ARCHITECT-HANDOFF.md` §"Required proof". Every evidence
artifact produced by any later work order must carry exactly one label:

| Label | Meaning | Counts as live capability? |
|---|---|---|
| MOCK | In-memory double, no persistence, no transport | Never |
| SIMULATION | Deterministic model of behavior (incl. fault injection, replay) | Never |
| REAL-DEVICE | Behavior observed on physical hardware we control (no provider commitment) | Physical behavior only, not service delivery |
| SANDBOX-PROVIDER | Real request/response against a provider sandbox (e.g., ADCOS sandbox environment) | Provider API conformance only, never delivery |
| LIVE-PROVIDER | Authorized, metered, real-network interaction under a real contract | Yes — the only class that does |

Sibling precedent worth copying: ADCOS's own developer API keeps sandbox and production as
non-interchangeable isolated namespaces (`sib/ADCOS@d7db35e:developerapi/environments.py`) and
its deployment harness asserts `evidence_class == "SOFTWARE"` on the demo endpoint
(`deploy/verify.py` check 3); RoamLink's projections carry `evidence_class` + `freshness_state`
per record. P1-W1 should make this label a shared type (see capability-inventory.md handoff
note 1).

## Proof tiers (matching the verification ladder)

- **T1 — CI/simulation:** unit + domain invariants, contract conformance, replay/duplicate/
  reorder/delay/partition/revocation/unknown simulations. Runs on every change; no hardware.
- **T2 — Two-instance automation:** two (or N) independently spawned OS processes, real
  sockets, real persistence, no hardware. Required before any cross-device claim.
- **T3 — Physical device (no provider):** real phones/laptops/gateways on LANs we control,
  exercising enrollment/pairing/coordination/forwarding mechanics without commercial
  connectivity commitments.
- **T4 — Supported gateway forwarding:** per advertised platform, real packet forwarding
  through an owner-authorized resource, measured. Distinct from T3: the data plane moves.
- **T5 — Authorized live provider/operator:** contracts, usage evidence, assurance, failover,
  settlement references against real provider networks under operator terms.
- **T6 — Composed gates:** load, security, cost, restore, deployment (P4-W1, P5-W1).

## Proof case catalog

Each case: what to test, what evidence counts as proof, CI/sim vs physical/provider, and the
owning work order. Case IDs are stable for referencing from work-order acceptance criteria.

### Cross-device coordination (from cross-device-coordination.md §Acceptance cases 1–8)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-XD-01 | Two separately running instances authenticate, discover a scoped capability, exchange a bounded task | Test log + journal from BOTH processes showing authenticated envelope exchange, task completion, ack; process PIDs and ports recorded; no shared memory | T2 (two processes) then T3 (two physical devices) | P2-W2 |
| PC-XD-02 | Unpaired, revoked, expired, replayed, malformed, out-of-scope messages are rejected | Receiver-side journal entries with typed rejection reasons per message; negative fixtures committed | T1 (simulation) + T2 (real processes) | P2-W2 |
| PC-XD-03 | Duplicate, reordered, delayed deliveries produce no duplicate effects and converge after reconciliation | Before/after state digests identical to single-delivery baseline; dedup counters; reconciliation log | T1 (fault-injecting transport) + T2 | P2-W2 |
| PC-XD-04 | Offline reconnect executes only permitted unexpired tasks; expired commands require renewed authorization | Clock-manipulated offline queue dump showing expired entries quarantined/refused, not executed | T1 (virtual clock) + T2 (real restart) | P2-W2 |
| PC-XD-05 | Owner revokes one instance; future consequential commands blocked | Revocation event + subsequent command attempts with rejection evidence; timing recorded (within defined expiry behavior) | T2 + T3 (device UI revocation) | P2-W2 |
| PC-XD-06 | Local policy denies requests from otherwise trusted peers | Receiver log showing local denial with policy reference | T1 + T2 | P2-W2 |
| PC-XD-07 | Direct path and relay loss produce observable fallback/degraded states; no silent authority transfer | Topology diagram + delivery logs per mode (direct/relay) + state transitions to DEGRADED/UNKNOWN, never silent promotion | T2 (with relay process) + T3 | P2-W2 |
| PC-XD-08 | Physical-device span: cases 01–07 re-run across two physical devices on separate networks (e.g., phone on cellular, gateway on wired) | Device/OS/network matrix recorded per run; same acceptance evidence as PC-XD-01..07 with physical context | T3 only — **cannot** be claimed from mock-only tests (cross-device-coordination.md §Acceptance case 8) | P2-W2 → P4-W2 |

### Gateway forwarding per advertised platform (architecture §Resource contribution; connectivity-resource-provider.md)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-GW-01 | Linux gateway forwarding: TUN device, policy routing, NAT, multi-WAN on a supported Linux distribution | Packet-level evidence: forwarded-flow counters, before/after throughput/latency/loss measurements scoped to method/path/time-window (INVARIANTS #17), config snapshot, kernel/distro version | T3 (physical Linux box or dedicated board) + T4 | P2-W2 (path) → P4-W2 (measurement rigor) |
| PC-GW-02 | Android platform forwarding via supported OS mechanisms (VPN-service/tethering APIs within operator terms) | Working forwarding on specific device/OS/operator combo + honest limitation report; combos that cannot forward are marked UNSUPPORTED in the support matrix, not silently omitted | T3/T4 — physical device + SIM required | P2-W2 → P4-W2 |
| PC-GW-03 | iOS: verify the negative boundary — ordinary iOS apps cannot become general-purpose routers; supported alternatives only | Negative-proof document + whatever scoped mechanism is actually supported (e.g., per-app tunnels), with platform API references; architecture rule: "never imply every browser or ordinary iOS app can become a general-purpose router" (ADCOS-2.0.md §Resource contribution) | T3 | P2-W2 |
| PC-GW-04 | Per-advertised-platform conformance: every platform advertised in the UX support matrix has a matching forwarding proof artifact | Support-matrix row ↔ proof-artifact cross-reference (UI claims with no artifact are a release-gate failure) | T3/T4 per row | P2-W2 (matrix) + P5-W1 (release gate) |
| PC-GW-05 | Owner consent/quota enforcement in the forwarding path: data caps, pause/revoke take effect at the data plane within defined bounds | Measured cutoff after cap; traffic counters stop post-revocation with timestamps | T3/T4 | P2-W2 → P4-W1 (adversarial) |

### Link independence, multi-path, failover (INVARIANTS #18–19; ADCOS-2.0.md §Resource contribution)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-LI-01 | Link independence: two links that LOOK independent (different SIMs/operators) but share failure domains (same tower, same backhaul, same account) are detected or marked UNKNOWN | Failure-domain analysis evidence per combination; observed correlated-failure events or UNKNOWN classification — never assumed independence | T1 (model tests) + T5 (live observation needed for real correlation data) | P2-W2 (modeling) → P4-W2 (live) |
| PC-LI-02 | Failover between links preserves hard constraints (security/privacy/budget/data cap/residency) — no constraint traded for availability | Constraint-evaluation log at failover instant showing all hard constraints checked before switch | T1 + T2 (simulated failover) | P2-W2 |
| PC-LI-03 | Real failover timing/behavior on multi-WAN hardware (PC-GW-01 class device) | Measured failover latency, loss window, recovery; method/path/time-window provenance per INVARIANTS #17 | T3/T4 | P4-W2 |
| PC-LI-04 | Degraded/UNKNOWN states surfaced during path loss — not silent success | UI/API state dumps during induced loss (kill switch on one link) | T2 (process-level link kill) + T3 | P2-W2 |

### Provider / operator validation (T5 — authorized only)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-PV-01 | Canonical ADCOS boundary integration: intent → offers → contract → activation → usage → assurance → termination round-trip against the deployed ADCOS developer API | Request/response transcripts with `X-ADCOS-Request-Id` correlation, webhook deliveries verified against canonical reads, projection freshness states; SANDBOX-PROVIDER label until production credentials authorize LIVE-PROVIDER | CI against ADCOS sandbox mode (self-hosted from `sib/ADCOS@d7db35e:api/index.py` deterministic sandbox) then T5 | P2-W2 |
| PC-PV-02 | ShareNet-path integration (after G-1 decision): ConnectivityPort flow with signed observations | Signed `SignedConnectivityObservation` envelopes verified (Ed25519, strictly-increasing sequence); fault modes (tamper/replay/unsigned) rejected | CI against ShareNet `adcos_test_server` (`sib/ShareNet@662fad6:connectivity-client/src/bin/adcos_test_server.rs` — injectable faults) + T3 with real ShareNet transport | P2-W2 |
| PC-PV-03 | Live provider delivery: authorized contract on a real operator network with measured usage | LIVE-PROVIDER evidence only: contract reference + usage evidence from canonical ADCOS + our measurement, privacy-guarded; estimates separated from actuals (P4-W2 acceptance) | T5 — requires operator relationship + terms checklist | P4-W2 |
| PC-PV-04 | Operator terms compliance: tethering/resale/data-cap/fair-use/spectrum rules per operator used | Signed-off operator-terms checklist per operator+plan+device class; any prohibited combo removed from eligibility (INVARIANTS #16) | Desk research + legal/ops review + T5 spot checks | P4-W2 |
| PC-PV-05 | Sandbox-vs-live separation discipline: no artifact mixes classes; sandbox results never cited as delivery | Every evidence file carries its class label; release gate scans artifacts for unlabeled evidence | CI (label enforcement) + P5-W1 gate | P0-W2 checker now; P5-W1 gates |

### Group purchasing (from group-organizations-and-purchasing.md; handoff §Required proof)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-GB-01 | Happy path: DISCOVERED → … → FULFILLED → RECONCILED with real attributable offer provenance/expiry | State-transition journal with authoritative event/evidence per transition; offer provenance recorded | T1 (state-machine walker) + T2 | P2-W3 |
| PC-GB-02 | Threshold not met → THRESHOLD_NOT_MET, no order placed | Journal showing no ORDERED transition; member notifications | T1 | P2-W3 |
| PC-GB-03 | Expiry (offer and commitment deadlines) → EXPIRED; expiry before/after threshold | Clock-controlled transitions; expired offers cannot be accepted | T1 (virtual clock) | P2-W3 |
| PC-GB-04 | Withdrawal: member withdraws pre-formation; post-commitment withdrawal per stated terms | Commitment ledger diffs; reallocation math exact | T1 | P2-W3 |
| PC-GB-05 | Duplicate order prevention (double-submit, retry storm) | Idempotency evidence: same idempotency key → single order; REPLAY/CONFLICT outcomes | T1 + T2 | P2-W3 |
| PC-GB-06 | UNKNOWN order/payment outcome → reconciliation before retry | UNKNOWN state persisted; retry blocked until reconciliation resolves; resolution event recorded | T1 + T2 (fault-injected payment boundary) | P2-W3 |
| PC-GB-07 | Partial fulfillment/shortfall → participant-level allocation reconciliation | Per-member allocation diffs summing exactly to delivered amount; no rounding drift (integer minor units) | T1 | P2-W3 |
| PC-GB-08 | Cancellation/refund flow with exact, auditable allocation reversal | Reversal journal entries; balances restored; refund references recorded (money movement itself = external authority, G-4) | T1 (+ T5 when a payment authority exists) | P2-W3 |
| PC-GB-09 | Composed end-to-end: real group offer obtains approved commitments; service and usage reconcile | P3-W1 composed journey through public boundaries with all evidence labeled | T2 composed harness → T5 | P3-W1 |

### Reality Lab (reality-lab.md; handoff §Required proof)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-LAB-01 | Reproducibility: fixed evidence snapshot + fixed policy → byte-identical recommendation | Two runs, digest comparison; declared algorithm/version, features, constraints, tie-break | T1 | P2-W3 |
| PC-LAB-02 | No-change baseline always present with costs/assumptions/confidence/risk/expiry | Output schema validation on every recommendation artifact | T1 | P2-W3 |
| PC-LAB-03 | Hard-constraint violation → ineligible (not lower-scored) | Negative fixtures: attractive candidate violating each constraint class is rejected | T1 | P2-W3 |
| PC-LAB-04 | Shadow evaluation has zero external effect | External-effect audit hook log: no canonical commands issued during shadow | T1 + T2 | P2-W3 |
| PC-LAB-05 | Canary promotion requires bounded approval; stop/rollback honored | Approval artifacts + stop-condition trigger → rollback event | T2 | P2-W3 |
| PC-LAB-06 | Prediction-vs-reality deviation recording post-action | Reconciliation report comparing predicted vs measured (measured = D5/D6 canonical evidence) | T2 → T5 | P2-W3 → P4-W2 |

### Security (handoff §Required proof; P4-W1 scope)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-SEC-01 | Revoked/untrusted peer command rejection (all E-plane negatives end-to-end) | Typed rejection journals from real two-process runs | T2 | P4-W1 |
| PC-SEC-02 | Malformed/replayed commands fail closed | Fuzzer-driven corpus + deterministic replay battery | T1 + T2 | P4-W1 |
| PC-SEC-03 | Local denial of otherwise-trusted requests | Local-policy override evidence | T1 + T2 | P4-W1 |
| PC-SEC-04 | Expired offline tasks never execute without renewed authorization | Quarantine logs after clock advance + restart | T1 + T2 | P4-W1 |
| PC-SEC-05 | Data/budget limit enforcement incl. under failover pressure | Limit-hit events; no bypass under link churn | T1 + T2 + T3 | P4-W1 |
| PC-SEC-06 | Tenant/resource isolation cross-product matrix | Cross-tenant access attempts all fail with typed errors | T1 + T2 | P4-W1 |
| PC-SEC-07 | Recovery: backup/restore drill, dead-letter reconciliation, rollback | Restore drill report with before/after state digests; time-to-recover measured | T2 (+ staging) | P4-W1 → P5-W1 |

### Product surfaces and production readiness (handoff §Required proof)

| Case | What to test | What counts as proof | Where it can run | Owner |
|---|---|---|---|---|
| PC-UI-01 | Real UI journeys exercise persisted services (not visual mock success) | Browser-driven flows with persisted-state verification via public API/service; substrate e2e bridge available as pattern (`substrate:packages/shared/src/e2e-test-bridge.ts`) | CI (browser) | P2-W1 |
| PC-UI-02 | Role/tenant isolation visible in UI; persisted state verified per role | Per-role journey evidence + API state checks | CI | P2-W1 |
| PC-PR-01 | Staging through real UI; restore/rollback evidence; runbooks exist and are exercised | Staging deployment + drill reports + runbook artifacts | Staging | P5-W1 |
| PC-PR-02 | Target-specific hardware/provider limits documented at release | Limits register per target (device/OS/provider) cross-referenced to proof artifacts | Docs + gate | P5-W1 |

## Sequencing and current constraints

1. **Now (P0):** only T1 governance evidence exists (spec checker, P0-W2). No product code.
2. **P2 lanes:** T1 + T2 evidence becomes possible and mandatory for lane acceptance; T3/T4/T5
   are explicitly out of P2 scope except where a lane already owns physical verification (P2-W2
   requires "two separate processes plus physical-device verification" — the physical part
   realistically lands with P4-W2; the work-order text should be read as requiring the design
   to be physically verifiable, with actual device runs gated on the G-5 platform-set decision).
3. **P4-W2** is the physical/provider proof work order: "report device/OS/topology/window/
   method/failures" — every T3/T4/T5 artifact must carry exactly those fields (adopting the
   P4-W2 acceptance wording as the artifact schema).
4. **P5-W1** is the composed release gate: no advertised capability without a matching proof
   artifact (PC-GW-04), no unlabeled evidence (PC-PV-05), staging + restore drills (PC-PR-01).
5. **Environmental honesty for this work order:** the P0-W3 sandbox has no physical devices,
   SIMs, or operator relationships; everything in this plan beyond T1/T2 design is
   specification of future evidence, not evidence. This matches INVARIANTS #6 and the
   README's rule that "a capability is complete only after the work-order acceptance evidence
   is committed."

## What a proof artifact must contain (schema proposal for P1-W1/P4-W2)

For every T3/T4/T5 artifact: case ID; evidence class label (MOCK/SIMULATION/REAL-DEVICE/
SANDBOX-PROVIDER/LIVE-PROVIDER); device/OS/topology/window/method/failures fields (P4-W2
acceptance wording); work-order reference; commit SHA of the code under test; reproducible
command list with exit codes; raw logs with provenance (who/what recorded them); privacy
guards applied (no payload capture, metadata minimization per J3). Proposing this schema here
so P1-W1 can adopt it as a shared type; nothing is implemented in this work order.
