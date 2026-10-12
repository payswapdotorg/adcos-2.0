# P2-W3 Implementation Design — Reality Lab, Organizations, Group Purchasing (Pre-Draft)

Status: **DESIGN PRE-DRAFT — documentation only.** Nothing in this document is implemented.
No code is committed under `packages/` by this work order; every package, file, and test named
below is a *design target* for the future P2-W3 implementation work order, which cannot start
until P1-W1's shared contracts are accepted (dependency: `spec/work-orders.md` P2-W3).

Honesty rules observed throughout (per `docs/LLM-ARCHITECT-HANDOFF.md` §Required proof,
`spec/architecture/INVARIANTS.md` #4–6, and my P0 dispositions in
`docs/baseline/capability-inventory.md` §F/G):

- **No implementation claims.** Repo state is `P0_COMPLETE; P1_CONTRACTS_IN_PROGRESS`
  (`spec/development-state/current-state.json`); no Lab, Organization, economic, or
  group-purchase code exists anywhere in this repository or the sibling set
  (capability-inventory F1–G10: all NEW-WORK-ORDER).
- **Every sibling pattern is labeled pattern-only.** Cites use the P0 survey prefixes
  (`sib/PaySwap@b5f20d6:`, `sib/UniCom@1c003ec:`, `sib/ShareNet@662fad6:`); a pattern existing
  in a sibling is never integration status of this product. PaySwap's Lab/Director/EEG are
  **spec-only** at its HEAD (`docs/research/integration-survey.md` §5.2: "no Lab code to port").
- **Payments are opaque references** (ADR-0004): amount + currency + provenance + role
  reference to "the authorized financial/payment authority". No rail semantics, no provider
  secrets, no parallel ledger/finality authority. Any item inherently requiring live money
  movement is **BLOCKED-ON-OPERATOR** (rail selection deferred), never faked.
- This document is a design artifact, not evidence of capability (INVARIANTS #6).

Design inputs consumed (read list for this draft): `spec/work-orders.md` (P2-W3 entry),
`spec/reality-lab.md`, `spec/group-organizations-and-purchasing.md`,
`spec/architecture/INVARIANTS.md`, `spec/architecture/ADCOS-2.0.md` (§Logical planes 6–7),
`spec/authority-model.md`, `spec/adr/ADR-0004`, `spec/adr/ADR-0005`,
`spec/cross-device-coordination.md` §Message and task contract,
`docs/baseline/capability-inventory.md` §F/G + §Handoff notes for P1-W1,
`docs/baseline/substrate-inventory.md` §4 (plug-in plan) and §7 (identity guidance),
`docs/research/proof-plan.md`, `docs/research/test-harness-plan.md`.

---

## 1. Module map

### 1.1 Plug-in approach (follows substrate-inventory §4 items 1–5)

New domain code enters as **new workspace packages under `packages/*`** — auto-matched by the
existing `pnpm-workspace.yaml` glob, **no root-manifest surgery** (substrate-inventory §4
item 1). Each package is registered as a `managed: true` module in `architecture-policy.yaml`
with explicit `requires` and a single `publicEntrypoints` contract file, mirroring the `storage`
module pattern (domain behind a contract, adapters at the edge; full rule enforcement from
commit one because `.architecture-baseline.json` is empty). Cross-module imports target
publicEntrypoints only (`forbidDeepImports`); substrate consumption, if any, is restricted to
the de-facto public surface (`@zcode/shared`, `@zcode/rpc`, `@zcode/provider`,
`@zcode/services` contracts, `@zcode/client`) — the design below keeps domain layers
zero-dependency so substrate imports appear only in `adapters/` layers, if at all.

Package identity follows the substrate inventory's identity guidance (§7): the `@zcode/*`
scope is kept untouched for inherited code (identity Step 0 — no cosmetic renames); **new
product-domain packages carry the product's own scope `@adcos/*`**, all `private: true`
(only `@zcode/rpc` is publishable today and we add no publishable surface). This mirrors the
sibling new-domain convention (`@unicom/*`, `@payswap/*` — pattern-only labels), keeping
ADCOS 2.0's own domain distinguishable from both the inherited substrate and the canonical
`sib/ADCOS@d7db35e` connectivity domain, which is consumed exclusively as opaque references
via public boundaries.

Packages are **source-consumed within the workspace** (no build script initially, the
`@zcode/ui` pattern) and are pure TypeScript leaf packages modeled on the sibling
"parallel-lane self-containment" convention (pattern-only:
`docs/research/integration-survey.md` §5.3). Builds are added only if/when a consumer surface
(P2-W1) requires them — not a P2-W3 concern.

### 1.2 Packages and dependency graph (acyclic; all arrows point downward)

```
@adcos/contracts          (P1-W1 — owned elsewhere; name/module-id are P1-W1's call,
                            "contracts" used here as a placeholder, see §2 divergence rule)
        ▲            ▲            ▲            ▲            ▲
        │            │            │            │            │
@adcos/economics ────┤            │            │            │
        ▲   ▲        │            │            │            │
        │   └────────│────────────┘            │            │
        │            │                         │            │
@adcos/organizations  @adcos/group-purchasing  @adcos/lab   │
        ▲                   ▲                    ▲          │
        │                   │                    │          │
        └───────────────────┴────────────────────┴── @adcos/simulation
```

- `@adcos/economics` — exact reference-value math shared by all four domain packages:
  opaque money references (integer minor units, never floats), exact allocation/reversal,
  payback/break-even, sensitivity, gross/contribution/accrued/settled layer classification,
  canonical-JSON content digests for pinned inputs. **requires: [contracts]**.
- `@adcos/organizations` — Organization candidate/membership/mandate machines and
  provider-Org formation records (Strategy/Organization separation: this package is the
  *who/what executes* plane). **requires: [contracts, economics]**.
- `@adcos/group-purchasing` — the pinned group-buy state machine, attributable offers,
  commitment ledger, threshold/expiry engines, order idempotency + UNKNOWN reconciliation,
  allocation reversal, matching with exposure control. **requires: [contracts, economics]**
  (mandate validation via a port — §3.3.4 — deliberately *not* a module dependency on
  `@adcos/organizations`).
- `@adcos/lab` — the *what should happen* plane: pinned evidence snapshots, typed candidates
  (always including no-change and provider-native baselines), deterministic evaluation,
  advisory gates, deviation records, abuse-detection hooks. **requires:
  [contracts, economics]**.
- `@adcos/simulation` — deterministic replay/shadow driver, scenario runner, state-machine
  walker, virtual clock, boundary doubles (offer/payment with CONFIRMED/FAILED/UNKNOWN
  injection). Product code for Lab ladder steps 4–5 and the automation target of
  `docs/research/test-harness-plan.md` §4. **requires: [contracts, economics, organizations,
  group-purchasing, lab]**.

### 1.3 Registration plan — proposed `architecture-policy.yaml` block

`architecture-policy.yaml` is an architecture lock: **serialized through the TL**
(`spec/dependency-graph.md` §Safe concurrency rule 2). This work order proposes the block
below and does not edit the policy file. Recommended application: one atomic TL-serialized
change when P1-W1 lands, so all three P2 lanes reference stable module ids (P1-W1 registers
its own package; the `contracts` module id below is a placeholder for whatever it registers).

```yaml
  # --- ADCOS 2.0 collective-economy domain (P2-W3); managed from commit one ---
  - id: economics
    roots: [packages/economics/src]
    managed: true
    requires: [contracts]                 # placeholder id; see §2 divergence rule
    publicEntrypoints: [packages/economics/src/contract.ts]
    layers: { domain: domain, app: app, adapters: adapters }
    layerOrder: [domain, app, adapters]
    owner: collective-economy
  - id: organizations
    roots: [packages/organizations/src]
    managed: true
    requires: [contracts, economics]
    publicEntrypoints: [packages/organizations/src/contract.ts]
    layers: { domain: domain, app: app, adapters: adapters }
    layerOrder: [domain, app, adapters]
    owner: collective-economy
  - id: group-purchasing
    roots: [packages/group-purchasing/src]
    managed: true
    requires: [contracts, economics]
    publicEntrypoints: [packages/group-purchasing/src/contract.ts]
    layers: { domain: domain, app: app, adapters: adapters }
    layerOrder: [domain, app, adapters]
    owner: collective-economy
  - id: lab
    roots: [packages/lab/src]
    managed: true
    requires: [contracts, economics]
    publicEntrypoints: [packages/lab/src/contract.ts]
    layers: { domain: domain, app: app, adapters: adapters }
    layerOrder: [domain, app, adapters]
    owner: collective-economy
  - id: simulation
    roots: [packages/simulation/src]
    managed: true
    requires: [contracts, economics, organizations, group-purchasing, lab]
    publicEntrypoints: [packages/simulation/src/contract.ts]
    layers: { domain: domain, doubles: doubles, app: app }
    layerOrder: [domain, doubles, app]
    owner: collective-economy
```

Notes:

- `requires` lists reflect *actual imports* at implementation time; the architecture checker
  enforces this mechanically, so any import outside the list fails the gate. If an
  implementation pass needs no `@zcode/*` import at all, no substrate module id appears —
  that is the intended default (zero-dependency domain; substrate touches only `adapters/`).
- `contract.ts` files are re-export-only (the `storage` contract pattern), sized under
  `maxContractLines: 300`; all files stay under `maxFileLines: 400`; public methods per
  contract under `maxPublicMethods: 12`.
- Simulation uses a `doubles` layer (clearly-labeled fake boundaries) between domain and app;
  doubles are `MOCK` evidence by construction (proof-plan §Evidence classes) and are never
  citable as provider capability (PC-PV-05 discipline).

### 1.4 Owned-path mapping to the work order

`spec/work-orders.md` P2-W3 owned paths — "Lab, Strategy/Organization, economic calculations,
group-buy workflows and simulations; no shared-contract edits" — map to packages as:
Lab → `@adcos/lab`; Strategy/Organization → `@adcos/lab` (Strategy types) +
`@adcos/organizations` (execution structures; the two are never conflated —
`spec/reality-lab.md` §1 "Do not conflate the two"); economic calculations → `@adcos/economics`;
group-buy workflows → `@adcos/group-purchasing`; simulations → `@adcos/simulation`.
Shared-contract edits: **none** — consumed types are P1-W1's; divergences go through adapters
and contract proposals (§2).

---

## 2. Consumed contracts (P1-W1) — field-level usage and divergence rule

P1-W1 is in flight. This design is written against **the contract shapes the specs already
enumerate** (the method sanctioned for this pre-draft): the envelope field list in
`spec/cross-device-coordination.md` §Message and task contract, the state/type inventories in
`spec/group-organizations-and-purchasing.md` and `spec/reality-lab.md`, and the P1-W1 output
list in `spec/work-orders.md`. Per family: exactly what my logic reads (R) / writes (W), and
the divergence policy.

**Divergence rule (applies to every row):** if the landed P1-W1 shape differs from the usage
assumed here, the difference is absorbed in a per-module adapter layer
(`src/adapters/contracts.ts`: landed-type ↔ internal-domain-type mapping) — **an adapter
boundary, never a fork**: no edits to shared contracts (P2-W3 rule), no parallel types
leaking into domain layers (domain code sees internal types only), no semantic drift. If a
field my logic needs is absent from the landed contract (e.g. a missing security epoch or
freshness state), the escalation is a **contract proposal to the TL**
(`spec/dependency-graph.md` rule 4), not a local workaround.

| P1-W1 family | My usage (R/W) | Fields my logic depends on |
|---|---|---|
| Resource/instance references | R only, opaque | Typed reference + content digest. Never dereferenced past type+digest (LOCK-114/117 discipline; capability-inventory handoff note 4). Used in: Lab candidates (intent/owner refs), Org records (principals/resources), group requests (participants). |
| Capability observation | R (Lab/Org); W (derived evidence, distinct class) | Evidence class, freshness (`freshUntil`, freshness state), provenance. Lab consumes observations as snapshot records; anything my modules produce from them is `derivation`/`inference` class with model/version/provenance — never canonical network facts (INVARIANTS #4; reality-lab §last para). |
| Envelope | R (inbound commands); W (outbound events) | schemaVersion (reject unknown — fail closed), sender/receiver instance ids (scope match), principal/org scope, issue/expiry (freshness; expired → REJECTED before effect), correlation/causation ids (propagated; events cite the triggering command as causation), idempotencyKey (duplicate suppression → typed REPLAY), payloadDigest (integrity), authorization/delegation ref (validity checked at effect time), policy/security epoch (mismatch → reject), signature/origin (authenticated). |
| Task | R/W (coordinated work items) | owner/lease (stale owner cannot commit after handoff), deadline, retry budget, cancellation semantics, evidence requirements. Lab evaluation/replay/shadow tasks, Org admin tasks, purchase reconciliation tasks are dispatched as bounded tasks; commits validate lease ownership first. |
| Delegation | R (at effect time); W (references in records) | scope (must cover the commanded effect), expiry (delegation cannot outlive authorization — INVARIANTS #12), attenuation chain. Member commitments carry the member mandate as their authorization/delegation reference. |
| Inbox/outbox + event lifecycle | R/W (all modules) | Dedup state (inbox), ack, bounded retries, dead-letter, reconciliation entries. Every state transition emits an outbox event with its authoritative evidence; inbound commands land in inbox and are deduplicated before handling (INVARIANTS #11). |
| Org candidate/membership/mandate | R (Lab reads candidate types); W (organizations is primary writer); R (group-purchasing reads mandate scope) | Candidate fields (roles, capacity, minimum viable membership), membership states, mandate {service scope, amount cap, beneficiary scope, expiry, revocation}. Group-purchasing validates mandates at COMMITMENT and again at AUTHORIZATION (effect time). |
| Group request/offer/commitment | W (group-purchasing primary writer); R (Lab reads for pooled-demand candidates) | Group request matching fields; offer record fields (supplier, terms, threshold, costs, expiry, provenance, estimate labels); commitment records (per-member allocation/fee/responsibility/term/limits/threshold/cancellation/failure outcome shown *before* committing). |
| Opportunity evidence | W (Lab primary writer); R (Org/purchase record the originating opportunity ref) | evidence snapshot/version, baseline/alternatives, incremental benefits, recurring/one-time/support costs, assumptions, service impact, downside, payback, confidence, expiry, approvals, post-action metrics (reality-lab §Opportunity economics). |
| Status/error/freshness | R/W (all modules) | UNKNOWN (outcome annotation; reconcile-before-retry), STALE (evidence/offer/mandate freshness), DEGRADED, FAILED, REJECTED (typed rejections), TERMINATED; distinct per INVARIANTS #5 — timeout never proves an external action failed. UNKNOWN-before-FAILED vocabulary pinned once by P1-W1 (capability-inventory handoff note 5); siblings' vocabularies map only at adapters (note 1). |

State-vocabulary note: P1-W1 pins our spec's group-buy lifecycle (G5 disposition: "P1-W1
state types + P2-W3 transitions"). My machines implement transitions over the pinned states;
the semantic mapping to UniCom's implemented vocabulary (PROPOSED/MERCHANT_REVIEW/HELD/FORMED)
is recorded as reference notes only (capability-inventory handoff note 3) — no name reuse.

---

## 3. Domain design

### 3.1 Reality Lab (`@adcos/lab`) — advisory engine, ladder steps 1–8

**Evidence snapshots (pinned inputs).** `EvidenceSnapshot` = immutable, versioned, content-
addressed (canonical-JSON digest) collection of typed evidence records, each carrying class
(provenance), freshness, and provenance references. Adapted from the sibling pinned-input
pattern (pattern-only: `sib/PaySwap@b5f20d6:packages/economic/src/versioned-input.ts`).
Ladder step 1 validation rejects: stale records (freshness state ≠ fresh), records whose
class cannot support the use (owner assertion is not measurement — INVARIANTS #17), offers
without real provenance.

**Typed candidates (step 2).** Every evaluation constructs, at minimum: (a) **no-change**
(keep everything as-is — always present, PC-LAB-02), (b) **current provider-native baseline**
(the provider-native eligible path is *the* baseline; composed alternatives are candidates
only when every leg has eligibility, credible terms and permission evidence), and (c) the
alternative set from the search space: single/multiple providers, community provider groups
(Org formations), task-bounded Organizations, resource combinations, timing/task allocation,
plan upgrades, second SIM/independent link (modeled with failure-domain independence marked
UNKNOWN where unproven — INVARIANTS #18), equipment investment, wholesale bandwidth, group
purchasing, workload scheduling. Candidate generation in P2-W3 is **deterministic only**;
the "may use models" allowance (reality-lab §last para) is exposed as a `CandidateGenerator`
seam and left unimplemented (open question OQ-8).

**Deterministic evaluation (step 3).** `evaluate(snapshotDigest, policyRef, algorithmVersion,
features, constraints, tieBreak)` → `Recommendation` artifact, byte-stable under the
canonical-JSON serializer (PC-LAB-01: two runs, digest comparison). Hard constraints
(permission/legal/operator terms, privacy, service requirement, provider eligibility/trust,
owner restrictions, data/budget caps, member thresholds, stop conditions) are checked
**before** scoring; a violating candidate is **ineligible**, never lower-scored (INVARIANTS
#22; PC-LAB-03). Soft ranking then orders eligible candidates with a declared tie-break.

**Opportunity economics (explicit costs/confidence).** Each candidate records, from the
reality-lab §Opportunity economics field list: estimated incremental benefits; recurring and
one-time costs; support/operating cost; demand/utilization assumptions; service impact;
downside scenario; payback/break-even horizon (from `@adcos/economics`); **confidence**
(explicit, with sensitivity ranges — never a guaranteed predicted income); **expiry** (a
recommendation is stale after its expiry and must be re-evaluated); approvals required; and
post-action success metrics. Money is opaque references (ADR-0004): integer minor units,
currency, provenance {canonical-offer | operator-stated | estimate}; **no floats** (INVARIANTS
#25 exactness; the "money never uses floating-point" discipline is a pattern-only adaptation
from `sib/UniCom@1c003ec` — its commerce package, cited in capability-inventory G7).
Earnings layers are classified and never conflated: gross / contribution / accrued / settled;
**estimated ≠ settled** (INVARIANTS #25) — the settled layer is populated only from external-
authority actuals, which do not exist until a rail is selected (BLOCKED-ON-OPERATOR,
ADR-0004).

**Advisory-only law (structural).** The Lab package has **no ports that can perform external
effects**: it cannot create resource access, order upgrades, bind group members, or authorize
payouts (reality-lab §2 last para; INVARIANTS #21; capability-inventory F11). Its outputs are
records + proposals consumed by other modules' deterministic gates. A recommendation is
advisory until **all** required authorities approve: owner consent(s), operator-terms policy
inputs (J7/C3), deterministic policy/security gates, and — where money moves — the authorized
payment authority (BLOCKED-ON-OPERATOR until a rail exists). Promotion happens only through
deterministic policy/security/acceptance gates; otherwise roll back or declare inconclusive
(ladder step 8).

**Ladder steps 4–7.** Step 4 replay of available history with synthetic/fault injection
distinctly labeled (`SIMULATION` evidence class) — driver in `@adcos/simulation` (§3.4).
Step 5 shadow evaluation without external effect — enforced by an `ExternalEffectAudit` hook
that records every port invocation that would cause an external effect and asserts none fired
(PC-LAB-04). Step 6 bounded canary: approval artifacts (owner/operator consent), budget,
duration, stop/rollback conditions recorded as gates; an actual canary *run* with external
effects is composed at P3-W1/P4 — P2-W3 ships the machinery and stop/rollback evaluation
(PC-LAB-05). Step 7 post-action measurement: predicted-vs-reality deviation records comparing
prediction to measured actuals; measured evidence arrives as canonical usage/assurance
projections (D5/D6 — reference-only, authority-model row 10); estimates stay separated from
actuals (PC-LAB-06).

**Abuse-detection hooks (detection design only; hardening is P4-W1 — F10 disposition).**
Deterministic detectors over evidence snapshots: Sybil-group patterns, fake utilization
(measurement-provenance checks — owner assertions are not measurements, INVARIANTS #17),
collusive ratings, inflated demand, reward gaming, manipulated measurements. Patterns adapted
pattern-only from `sib/ShareNet@662fad6:economics/src/antigaming.rs` (cap saturation,
reciprocal rings via SCC) and k-anonymity demand aggregation (pattern-only:
`sib/UniCom@1c003ec:packages/agent/src/demand-aggregation.ts`).

### 3.2 Organizations (`@adcos/organizations`) — who/what executes

**Strategy/Organization separation.** Strategy (what should happen) is a Lab-plane type;
Organization (who/what executes: principals/agents, capability requirements, roles, authority,
budgets, resource allocation, policy, communication, commitments, compensation/cost
allocation, failure and exit) is this package (reality-lab §1; ADCOS-2.0.md §Lab and economic
coordination). A Lab opportunity may *reference* an Org candidate; it can never form one.

**Org candidate lifecycle (my machine over P1-W1 types).**

- `OrgCandidate`: PROPOSED → UNDER_REVIEW → FORMED → ACTIVE, with failure DISBANDED /
  FORMATION_FAILED. FORMED means agreement state — **not legal incorporation and not
  unlimited authority to bind members** (INVARIANTS #24; group-org spec §1 para 2).
- Formation guards: minimum viable membership AND capacity met (dual threshold); every
  joining principal has seen and accepted the full terms; role commitments consistent.
- Provider-Org formation roles (group-org spec §1): **resource owners, gateway operators,
  network providers (ISPs/upstream), installers, maintainers, customers** — each role is a
  `RoleSpec` modeling authority, resource/capacity commitments, availability, service
  obligations, shared expense share, price, revenue-allocation formula (versioned, exact —
  computed via `@adcos/economics`), failure-domain risk statement, support responsibility,
  dispute terms, join/withdrawal/replacement rules, termination/exit provisions, term.

**Membership lifecycle.** Per principal: CANDIDATE → INVITED (full terms presented:
allocation, fees, responsibility, term, limits, threshold, cancellation, failure outcome)
→ MEMBER (mandate accepted + eligibility evidence valid + owner consent) with SUSPENDED /
WITHDRAWN (pre- and post-formation per stated terms) / EXPELLED (per terms) / TERMINATED
(org exit). **A candidate is not a member agreement** — nothing is committed until owner
consent + eligibility + mandate are valid (INVARIANTS #24; capability-inventory G2; the
"INTEREST IS NEVER COMMITMENT" law is a pattern-only adaptation from UniCom).

**Mandates.** `{allowed service scope, amount cap, beneficiary scope, expiry, revocation}`,
individually scoped, never blanket (INVARIANTS #24). Issue → attenuate (only narrowing child
mandates — pattern-only: `sib/PaySwap@b5f20d6:packages/trust/src/` mandates/attenuation) →
expire → revoke. Mandate validity is re-checked at effect time, not just issuance
(delegation cannot outlive authorization — INVARIANTS #12).

**Eligibility inputs.** Resource eligibility is the C-plane/P2-W2 domain; this package
consumes eligibility evidence as opaque references (authority-model row 9) and never
re-derives it.

### 3.3 Group purchasing (`@adcos/group-purchasing`) — the pinned machine

**3.3.1 States (P1-W1 pins the vocabulary; my machine owns transitions).** DISCOVERED →
CANDIDATE → INVITED → OFFER_REQUESTED → OFFER_RECEIVED → VALIDATED → COMMITMENT_OPEN →
THRESHOLD_MET → AUTHORIZED → ORDERED/CONTRACTED → FULFILLED → RECONCILED; failure states
EXPIRED, THRESHOLD_NOT_MET, WITHDRAWN, REJECTED, CANCELLED, FULFILLMENT_FAILED,
REFUND_PENDING, DISPUTED. ORDERED/CONTRACTED is one transition target with a kind
discriminator {PURCHASE (equipment/services from supplier terms) | CONTRACT (service contract
via the canonical ADCOS public boundary)} — final call is P1-W1's state types; divergence →
adapter (§2).

**3.3.2 Transition table (every row: event → guard → evidence).** All transitions require
authoritative event/evidence, never UI or model claims (group-org spec §State machine;
INVARIANTS #2 domain law). Self-transitions (commitment recorded/withdrawn while
COMMITMENT_OPEN) update the ledger without a state change.

| From | Event → To | Guard | Authoritative evidence required |
|---|---|---|---|
| DISCOVERED | `candidate.proposed` → CANDIDATE | intent compatibility record complete | proposal record + intent refs |
| CANDIDATE | `members.invited` → INVITED | terms presentation per invitee | invitation records |
| CANDIDATE/INVITED/OFFER_REQUESTED | `request.withdrawn` → WITHDRAWN | organizer withdrawal per terms | withdrawal record |
| INVITED | `offer.requested` → OFFER_REQUESTED | exposure policy satisfied (aggregate bands only, §3.3.5) | offer request + privacy audit |
| OFFER_REQUESTED | `offer.received` → OFFER_RECEIVED | attributable offer record present | offer record w/ provenance |
| OFFER_REQUESTED | `offer.declined`/timeout → REJECTED | no external effect occurred (a *request* timeout is not an action failure) | decline/timeout record |
| OFFER_RECEIVED | `offer.validated` → VALIDATED | provenance verified; freshness OK; constraints met; estimates labeled; terms complete | validation artifact |
| OFFER_RECEIVED | `offer.expired` → EXPIRED | offer expiry passed (virtual clock) | expiry evidence |
| OFFER_RECEIVED | `offer.rejected` → REJECTED | validation failed, typed reasons | typed rejection |
| VALIDATED | `commitments.opened` → COMMITMENT_OPEN | commitment window + deadline set | window record |
| VALIDATED→COMMITMENT_OPEN | `offer.expired` → EXPIRED | clock | expiry evidence |
| COMMITMENT_OPEN | `commitment.recorded` (self) | mandate valid + consent + full terms shown pre-commit | commitment ledger entry |
| COMMITMENT_OPEN | `commitment.withdrawn` (self) | pre-threshold, per stated terms | ledger diff |
| COMMITMENT_OPEN | `threshold.met` → THRESHOLD_MET | participant count AND quantity/capacity thresholds within deadline | threshold evaluation artifact |
| COMMITMENT_OPEN | `window.closed` → THRESHOLD_NOT_MET | deadline passed, threshold unmet | window-close + evaluation |
| COMMITMENT_OPEN | `request.cancelled` → CANCELLED | organizer cancel per terms | cancellation record |
| THRESHOLD_MET | `authorization.granted` → AUTHORIZED | all required approvals recorded; mandates valid **at grant time**; policy epoch current | approval records |
| THRESHOLD_MET | `threshold.lost` → COMMITMENT_OPEN | post-met withdrawal dropped below threshold pre-authorization (honest demotion — pattern-only: UniCom THRESHOLD_LOST) | re-evaluation |
| THRESHOLD_MET/AUTHORIZED | `offer.expired` → EXPIRED | clock | expiry evidence |
| AUTHORIZED | `order.submitted` → ORDERED/CONTRACTED | idempotency BEGIN (new key); outcome CONFIRMED | order reference + outcome envelope |
| AUTHORIZED | `order.failed` (self or → CANCELLED per terms) | boundary FAILED *before any effect* (fail-closed distinction vs UNKNOWN) | typed failure |
| AUTHORIZED | `reconciliation.resolved(not-effective)` (self) | UNKNOWN resolved as never-effective; retry permitted under retry budget, same key where the boundary supports key lookup | reconciliation artifact |
| AUTHORIZED | `request.cancelled` → CANCELLED | per cancellation terms, pre-effect | cancellation record |
| ORDERED | `delivery.confirmed` → FULFILLED | fulfillment evidence (per-participant where applicable) | delivery evidence |
| ORDERED | `delivery.partial` → FULFILLED (level=PARTIAL) + reallocation | shortfall evidence | partial-delivery record |
| ORDERED | `delivery.failed` → FULFILLMENT_FAILED | supplier failure evidence | failure evidence |
| ORDERED/CANCELLED-with-refs | `refund.initiated` → REFUND_PENDING | per terms; allocation reversal computed | refund reference records |
| FULFILLED | `allocations.reconciled` → RECONCILED | exact participant-level reconciliation; settled layer populated only where actuals exist | reconciliation artifact |
| FULFILLMENT_FAILED | `refund.initiated` → REFUND_PENDING | per terms | refund references |
| REFUND_PENDING | `refund.completed` → RECONCILED | reversal bit-exact; balances restored | refund completion evidence |
| any post-fulfillment | `dispute.opened` → DISPUTED | member dispute per stated terms | dispute record |
| DISPUTED | `dispute.resolved` → RECONCILED | resolution per stated terms, adjustments versioned | resolution evidence |

**Illegal transitions (each a negative fixture, §4):** ORDERED before THRESHOLD_MET or
without AUTHORIZED; any commitment recorded after expiry; FULFILLED without delivery
evidence; accepting an EXPIRED offer; state regression; stale-owner commit after task lease
handoff; duplicate order submission (same idempotency key, different payload → typed
CONFLICT; same key, same payload → REPLAY no-op).

**3.3.3 Required-proof case coverage** (handoff §Required proof group-buy line; PC-GB-01..08):
threshold not met (row `window.closed`); expiry (offer expiry + commitment window — expiry
before and after threshold, clock-controlled); withdrawal (member pre-threshold self-transition
+ group WITHDRAWN + honest THRESHOLD_LOST demotion); duplicate order (idempotency guard,
BEGIN/REPLAY/CONFLICT — pattern-only: `sib/PaySwap@b5f20d6:packages/provider-runtime/src/
{idempotency,retrieval}.ts`); unknown result (below); partial fulfillment (row
`delivery.partial` + §3.3.6); cancellation/refund (rows `request.cancelled`, `refund.*`);
reconciliation (row `allocations.reconciled`).

**3.3.4 UNKNOWN outcomes — reconcile before retry.** External-effect boundaries (order,
payment reference recording) return a typed outcome envelope {CONFIRMED | FAILED |
UNKNOWN} — UNKNOWN means the result is ambiguous after a potentially-effective action; a
timeout is never a FAILED (INVARIANTS #5). An unresolved UNKNOWN **freezes** the machine: no
consequential transition is legal (mechanically enforced by the guard table — only
`reconciliation.resolved` unfreezes it), and retry is blocked until reconciliation resolves
it (pattern-only: PaySwap provider-runtime reconcile-before-retry; capability-inventory G10).
Modeling choice: UNKNOWN is an *outcome annotation* on the current state, not a new top-level
state — the pinned vocabulary is preserved (open question OQ-6).

**3.3.5 Matching and demand exposure.** Compatibility record per group request: location/
footprint (region bands, not precise location), required performance, time window, eligible
customer type, cost cap, contract term, privacy/security requirements, risk tolerance.
Incompatible intents are never pooled (split into separate groups). Offer requests expose
only aggregate bands at k-anonymity ≥ 3 (parameterized; pattern-only: UniCom
demand-aggregation — k-anonymity, order-statistic bands, leak detection); never one member's
private demand to other participants or suppliers. The Lab must explain why a group may
outperform individual purchase (group-org spec §Matching acceptance) — recorded in the
CANDIDATE evidence.

**3.3.6 Member allocation math (exact, versioned, auditable).** All splits in integer minor
units over opaque reference values; **never floats**; every artifact content-addressed and
versioned by rule id. `splitExact(total, weights, ruleVersion)`: largest-remainder with a
deterministic remainder rule (tie-break by content digest order of member ids) — sum(parts)
== total exactly. Partial fulfillment: per-participant reallocation of the undelivered share;
sum(reversals) == (estimated − delivered) exactly; no rounding drift. Refunds and service
credits: exact reversal of the prior allocation artifact (bit-exact restore; refund references
recorded — money movement itself is the external authority's, BLOCKED-ON-OPERATOR until a
rail exists per ADR-0004). Two layers everywhere: `estimated` (at AUTHORIZED, from offer
terms) and `settled` (at RECONCILED, from actuals where actuals exist); **estimated ≠
settled** (INVARIANTS #25).

**3.3.7 Attributable offer flow + real-offer provenance.** Offer record must state: supplier,
product/capability, eligibility/region, quantity/minimum threshold, total and per-member
cost, recurring/one-time charges, known fees/taxes, term, installation/delivery, expiry,
usage/technical limitations, cancellation/refund/shortfall terms, and provenance
(group-org spec §2 para 2 — all fields present or explicitly "not stated"). Offer kinds:
REAL (provenance-verified reference to a canonical/supplier record — offer *data* arrives via
the canonical boundary, PUBLIC-INTEGRATION per capability-inventory G4/D2; our record +
validation is ours), ESTIMATE (labeled), HYPOTHETICAL (never orderable). **A hypothetical
discount is never represented as a live quote** (INVARIANTS #23); **do not assume a bulk
discount exists** — the no-change and provider-native baselines carry the comparison.
Validation (OFFER_RECEIVED → VALIDATED) checks provenance, freshness (expired offers cannot
be accepted), threshold consistency, estimate labeling, and terms completeness.

**3.3.8 Boundary ports.** `SupplierOrderPort` (submit order/contract with idempotency key →
outcome envelope), `MandateCheckPort` (default implementation wired from
`@adcos/organizations` at the composition root — keeping group-purchasing decoupled, OQ-7),
`CanonicalBoundaryPort` (read-only offer/usage projections as opaque references). In P2-W3
tests these are the `@adcos/simulation` doubles; live integration is composed at P3-W1
(PC-GB-09); nothing here claims provider capability.

**3.3.9 No action without authorization.** No order occurs before threshold + required
approvals (INVARIANTS #23/#26); every consequential command validates mandate/delegation at
effect time; receiver-side local policy can always deny (INVARIANTS #9); fail-closed on
unknown/malformed (INVARIANTS #5; J6).

### 3.4 Simulation / shadow harness (`@adcos/simulation`)

Product code for Lab ladder steps 4–5 plus the automation target of my test-harness plan
(`docs/research/test-harness-plan.md` §4–§6). Everything it emits carries the `SIMULATION`
or `MOCK` evidence-class label (proof-plan §Evidence classes) — never citable as live
capability (PC-PV-05 discipline).

- **Deterministic replay driver.** `replay(snapshotRef, policyRef)` → re-runs Lab evaluation
  over a pinned historical snapshot; asserts byte-identical output (digest comparison,
  PC-LAB-01). No `Date.now()`/`randomUUID()` anywhere in domain code under test — injected
  clock + content-derived ids only (test-harness-plan §6, non-negotiable).
- **Shadow runner.** Full evaluation + gates with the `ExternalEffectAudit` hook asserting
  zero canonical commands issued (PC-LAB-04); synthetic/fault-injected inputs distinctly
  labeled.
- **Scenario runner.** Scripted timeline over a virtual clock: N simulated members + one
  organizer + boundary doubles. One script per required-proof case (PC-GB-01..08) plus
  lab ladder scenarios (PC-LAB-01..06). Scripts are versioned JSON fixtures; the runner
  emits journals + state digests; replay of a script is byte-stable.
- **Boundary doubles (MOCK, clearly labeled).** `OfferBoundaryDouble`: scriptable REAL/
  ESTIMATE/HYPOTHETICAL offers with expiry/provenance faults (tamper, unsigned, stale).
  `PaymentOrderDouble`: returns CONFIRMED / FAILED / **UNKNOWN on demand** (timeout after
  potentially-effective action) — reconcile-before-retry is assertable only because UNKNOWN
  is injectable (test-harness-plan §4.2).
- **State-machine walker.** Generic walker over the P1-W1 state model: every legal
  transition gets a positive scenario; every illegal transition gets a negative fixture
  asserting a typed rejection (pattern-only: UniCom's per-machine walker tests, cited in
  test-harness-plan §4.1 — semantic mapping required, not name reuse).
- **Virtual clock + deterministic identities.** `DeterministicClock` seam; fixed seeds for
  test identities (never machine keychains); fresh tmpdir state per test; ephemeral ports
  only if any test ever binds sockets (none planned in T1 — that is P2-W2's transport
  harness; our composed two-instance runs are a P3-W1 concern, PC-GB-09).
- **What the harness needs from my modules** (the contract my packages must honor):
  pure-function exports (evaluation, allocation, transitions); constructors accepting an
  injected clock; journal hooks per transition; exportable state digests; idempotency-keyed
  command handling exposed for duplicate injection; deterministic identity seeds;
  evidence-class labels on every emitted artifact.

---

## 4. Test plan

Runner: `node:test` + `node:assert/strict`, the house pattern
(`packages/services/test/providerConfigMigration.test.ts`), per test-harness-plan §2 —
no new framework; any framework change is a serialized decision. Tests are package-local
(`packages/*/test/*.test.ts`); cross-module scenario suites live in
`@adcos/simulation`. All evidence produced by these tests is T1 (CI/simulation) — MOCK or
SIMULATION class, never physical/provider proof (proof-plan §Proof tiers).

Per-module unit suites and their proof-case targets:

| Package | Unit suites | Negative fixtures | Proof cases |
|---|---|---|---|
| economics | money-ref ops (integer minor units, no floats); splitExact (indivisible remainders, deterministic tie-break); shortfall reallocation sums exactly; refund reversal bit-exact; payback/sensitivity; canonical-JSON digest stability | zero/negative weights; non-canonical serializations rejected | PC-GB-07 (math), PC-LAB-01 (digest) |
| organizations | membership walker; formation dual threshold; mandate issue/attenuate/expire/revoke; role library consistency | mandate expired/revoked/out-of-scope at effect time; formation below minimum viable membership; withdrawal violating stated terms | PC-GB-04 (withdrawal semantics), canary-consent machinery |
| group-purchasing | full transition-table walker (every legal row above); commitment ledger; offer validation; matching compatibility + exposure bands; idempotency; UNKNOWN freeze/unfreeze; reconciliation artifacts | every illegal transition (§3.3.2 list); expired offer acceptance; duplicate order (CONFLICT/REPLAY); UNKNOWN retry blocked; unauthorized FULFILLED; stale-owner commit | PC-GB-01..08 (per-row coverage per §3.3.3) |
| lab | snapshot validation (freshness, class); candidate construction (no-change + provider-native always present); hard-constraint ineligibility; confidence/expiry fields; deviation records; abuse-detector hooks | stale evidence; owner assertion misused as measurement; constraint-violating attractive candidates | PC-LAB-01/02/03/06 |
| simulation | replay determinism (two-run digest); shadow zero-external-effect audit; scenario golden fixtures; doubles fault injection | doubles returning UNKNOWN/garbage/unsigned; scenario replay instability | PC-LAB-04/05; PC-GB-01..08 as scenario scripts |

Composition into P3-W1 end-to-end journeys (work-orders P3-W1 outputs; PC-GB-09):
customer requests service → resource owner shares an eligible connection (P2-W2 composed)
→ instances cooperate (cross-device harness) → ADCOS executes a contract (canonical boundary)
→ Lab forms/recommends an Organization (this lane: §3.2 formation from a Lab opportunity
reference) → a real group offer obtains approved commitments (this lane: §3.3 machine at
AUTHORIZED→ORDERED against the canonical double) → service and usage reconcile (this lane:
§3.3.6 reconciliation + §3.1 deviation records). The composed two-instance mode (commitments
collected via cross-device envelopes, exercising delegation-expiry vs commitment-window
interactions) is designed here, delivered with P2-W2's transport harness at P3-W1 —
dependency risk noted in §6.

---

## 5. Open questions for the TL (each with recommendation)

- **OQ-1 — P1-W1 contracts package identity.** Its name/module id/paths are unknown while
  P1-W1 is in flight; this design uses the placeholder `@adcos/contracts` / module id
  `contracts`. *Recommendation:* on landing, one adapter-only commit updates the
  `requires` lists; field-level divergences absorb in per-module `src/adapters/contracts.ts`
  per §2; missing fields escalate as contract proposals, never local workarounds.
- **OQ-2 — architecture-policy.yaml registration timing.** The five-module block (§1.3) is
  an architecture-lock change (serialized through TL, dependency-graph rule 2).
  *Recommendation:* TL applies it atomically when P1-W1 lands, before dispatching P2 lanes,
  so all three lanes reference stable module ids; I do not edit the policy file outside that
  serialization.
- **OQ-3 — new-package scope `@adcos/*`.** Identity guidance keeps `@zcode/*` untouched for
  inherited code; new domain packages need a scope. `@adcos/*` mirrors the sibling new-domain
  convention (`@unicom/*`, `@payswap/*` — pattern-only) but "ADCOS" also names the canonical
  connectivity domain. *Recommendation:* adopt `@adcos/*`, all `private: true` (no publish
  surface, no external ambiguity; the canonical domain is consumed only as opaque
  references). Alternative if the TL prefers distance from the canonical name: `@adcos2/*`.
- **OQ-4 — simulation harness location.** `harness/*` (like P2-W2's `harness/coordination/`
  proposal) requires a root-manifest change (serialized), and Lab ladder steps 4–5 need the
  replay/shadow engine as *product* code, not test tooling. *Recommendation:*
  `packages/simulation` as designed (§1.2) — auto-globbed, no manifest surgery.
- **OQ-5 — RECONCILED semantics before a payment rail exists (ADR-0004).** *Recommendation:*
  define RECONCILED as *reference-level* participant allocation reconciliation complete
  (exact, auditable); the `settled` earnings layer stays unpopulated-and-labeled until a
  rail exists; live-money items remain BLOCKED-ON-OPERATOR; P4-W2 wires actuals. Please
  confirm this reading — it determines the P2-W3 acceptance-evidence wording.
- **OQ-6 — UNKNOWN-outcome modeling.** *Recommendation:* outcome-annotation + frozen-machine
  rule (§3.3.4), preserving the pinned state vocabulary; if P1-W1 lands an explicit
  pending-reconciliation state, switch via adapter (no domain change).
- **OQ-7 — mandate validation ownership.** group-purchasing validates mandates through a
  `MandateCheckPort`; `@adcos/organizations` provides the default implementation, wired at
  the composition root. *Recommendation:* keep the decoupling (no group-purchasing →
  organizations module edge) so the purchase machine is testable with doubles alone.
- **OQ-8 — model-based candidate generation.** reality-lab allows models in candidate
  generation; P2-W3 ships deterministic generators + the `CandidateGenerator` seam only.
  *Recommendation:* confirm the exclusion — learned generation needs abuse hardening
  (P4-W1) and its own ADR; shipping the seam keeps the ladder honest today.
- **OQ-9 — wave sizing.** The honest estimate below (~182 h focused; range 150–210 h)
  exceeds a single wave session. *Recommendation:* either split P2-W3 implementation into
  two serialized sessions (W3a: economics + organizations + group-purchasing machines and
  tests; W3b: lab + simulation + policy registration + evidence), or extend the P2 wave
  window; P3-W1 gating is unchanged (all P2 accepted before P3). Descope options if needed:
  defer abuse-detection hooks to P4-W1 (−~8 h, already its hardening owner) and canary
  machinery to records-only (−~6 h).

---

## 6. Estimate — file-level work breakdown for the P2-W3 implementation

Honest, design-informed estimates in focused hours, **unit tests and fixtures included in
each file's number**. Assumptions: P1-W1 contracts + fixtures landed and stable (no
design-around-uncertainty tax); workspace auto-glob (no manifest work); `node:test` (no
framework change); no root-manifest/CI edits from my lane. Excluded (other owners): P2-W1
UI, P2-W2 transport/gateway/provider adapters, live provider integration, P4 hardening,
P5 gates.

**@adcos/economics — subtotal 26 h**

| File | Purpose | Est (h) |
|---|---|---|
| `src/contract.ts` | public entrypoint re-exports | 1.5 |
| `src/domain/money-ref.ts` | opaque reference money, integer minor units, provenance | 3 |
| `src/domain/allocation.ts` | splitExact, largest-remainder, shortfall reallocation, reversal | 5 |
| `src/domain/payback.ts` | payback/break-even, sensitivity ranges | 4 |
| `src/domain/earnings-layers.ts` | gross/contribution/accrued/settled classification | 2.5 |
| `src/domain/canonical-json.ts` | canonical serialization + content digests | 3 |
| `src/app/calculation.ts` | orchestration over pinned inputs | 3 |
| `src/adapters/contracts.ts` | P1-W1 type mapping | 2 |
| `test/*.test.ts` (4 files) | money/allocation/payback/digest suites | 2 |

**@adcos/organizations — subtotal 34 h**

| File | Purpose | Est (h) |
|---|---|---|
| `src/contract.ts` | public entrypoint | 1.5 |
| `src/domain/org-candidate.ts` | candidate records, RoleSpec, formation terms | 4 |
| `src/domain/membership.ts` | membership machine | 5 |
| `src/domain/mandate.ts` | issue/attenuate/expire/revoke | 4 |
| `src/domain/formation.ts` | dual-threshold formation machine | 4 |
| `src/domain/roles.ts` | provider-Org role library (six roles) | 2.5 |
| `src/app/org-service.ts` | use cases (propose/invite/accept/withdraw/terminate) | 4 |
| `src/app/ports.ts` | MandateCheck, EligibilityEvidence ports | 1.5 |
| `src/adapters/contracts.ts` | P1-W1 mapping | 2 |
| `test/*.test.ts` (3 files) | membership/mandate/formation + negatives | 6 |

**@adcos/group-purchasing — subtotal 46 h**

| File | Purpose | Est (h) |
|---|---|---|
| `src/contract.ts` | public entrypoint | 1.5 |
| `src/domain/state-machine.ts` | pinned states + transition table + guards + UNKNOWN freeze | 8 |
| `src/domain/offer.ts` | attributable offer records, provenance validation, labeling | 5 |
| `src/domain/commitment.ts` | commitment ledger, mandate-checked | 5 |
| `src/domain/matching.ts` | compatibility + exposure bands | 4 |
| `src/domain/allocation-flow.ts` | estimated→settled layers, reallocation, refund reversal | 5 |
| `src/domain/order.ts` | idempotency BEGIN/REPLAY/CONFLICT, outcome envelope | 6 |
| `src/domain/reconciliation.ts` | reconciliation artifacts, DISPUTED resolution | 4 |
| `src/app/purchase-service.ts` | command handling, outbox emission | 5 |
| `src/adapters/contracts.ts` | P1-W1 mapping | 2 |
| `test/*.test.ts` (4 files) | walker + illegal-transition negatives + PC-GB fixtures | 6.5 |

**@adcos/lab — subtotal 38 h**

| File | Purpose | Est (h) |
|---|---|---|
| `src/contract.ts` | public entrypoint | 1.5 |
| `src/domain/evidence-snapshot.ts` | pinned snapshot, freshness/class validation | 4 |
| `src/domain/candidate.ts` | typed candidates: no-change, provider-native, alternatives; Strategy types | 5 |
| `src/domain/evaluation.ts` | deterministic evaluation, hard-constraint gate, tie-break | 6 |
| `src/domain/opportunity.ts` | opportunity records: costs/confidence/expiry/approvals | 5 |
| `src/domain/gates.ts` | advisory gates, approval chain, promotion/rollback | 4 |
| `src/domain/deviation.ts` | prediction-vs-reality records | 3 |
| `src/domain/abuse-detection.ts` | Sybil/fake-utilization/collusion hooks | 4 |
| `src/app/lab-service.ts` | ladder orchestration (steps 1–8) | 5 |
| `src/adapters/contracts.ts` | P1-W1 mapping | 2 |
| `test/*.test.ts` (3 files) | PC-LAB-01/02/03/06 + abuse fixtures | 5.5 |

**@adcos/simulation — subtotal 30 h**

| File | Purpose | Est (h) |
|---|---|---|
| `src/contract.ts` | public entrypoint | 1.5 |
| `src/domain/replay.ts` | deterministic replay driver | 4 |
| `src/domain/shadow.ts` | shadow runner + ExternalEffectAudit | 4 |
| `src/domain/scenario.ts` | scenario model + runner | 5 |
| `src/domain/walker.ts` | state-machine walker | 3 |
| `src/domain/virtual-clock.ts` | deterministic clock + schedule | 2 |
| `src/doubles/offer-boundary.ts` | REAL/ESTIMATE/HYPOTHETICAL offers + faults | 3 |
| `src/doubles/payment-boundary.ts` | CONFIRMED/FAILED/UNKNOWN injection | 3 |
| `src/app/harness.ts` | run composition, journal/digest emission | 2.5 |
| `test/*.test.ts` (3 files) | PC-LAB-04/05 + PC-GB scenario suite | 4 |

**Cross-cutting — subtotal 8 h**

| Item | Est (h) |
|---|---|
| 5 × package.json/tsconfig (uniform, ~30 min each) | 2.5 |
| architecture-policy.yaml block prep (applied via TL serialization, OQ-2) | 1 |
| P1-W1 divergence adapter pass (contingency, §2) | 2.5 |
| Evidence artifacts + acceptance report (commands, exit codes, per AGENTS.md) | 2 |

**Grand total: 182 h** (subtotals 26+34+46+38+30+8). Honest range: **150–210 h**; upper
band covers contract-divergence rework and the composed two-instance contingency (depends
on P2-W2's transport harness landing in-wave; otherwise that slice moves to P3-W1 with no
P2-W3 blocker). At the observed wave cadence this does **not** fit one session — see OQ-9
for the recommended split. This design document is intended to remove most implementation
uncertainty; the residual risk is concentrated in §2 divergences and the estimate's
upper band.

---

## Appendix A — Honesty checklist (self-audit for the TL)

1. No claim in this document asserts implemented capability; every package/file/test is a
   design target for the future P2-W3 implementation work order (INVARIANTS #6, #30).
2. Every sibling citation carries a pattern-only label with its P0-survey evidence path;
   PaySwap's Lab/Director/EEG are spec-only at its HEAD (integration-survey §5.2) — this
   design re-derives the Lab from spec text, porting nothing.
3. Payments: opaque typed references only (ADR-0004); no rail semantics; live-money items
   BLOCKED-ON-OPERATOR; estimated ≠ settled everywhere (INVARIANTS #25).
4. The Lab is structurally advisory-only (no external-effect ports); authorities decide and
   commit (INVARIANTS #21; authority-model row 15).
5. Group-buy states are P1-W1's pinned vocabulary; this design adds transitions only, plus
   the UNKNOWN outcome-annotation which preserves the vocabulary (OQ-6).
6. Owned path: exactly `docs/design/p2-w3-lab-organizations.md` — nothing under `packages/`,
   no shared-contract edits, no root-manifest edits.
