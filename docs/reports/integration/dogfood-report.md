# P3-W1 Integrated Product Dogfood Report

Work order: P3-W1 — Integrated product and real-boundary dogfood.
Branch: `p3-w1/integration-dogfood` (from `main` @ `3172157`).
Delivery: this report plus the committed suites; the report is the delivery channel.

## What was executed

The complete product story from the P3-W1 work order was driven end-to-end
through composed PUBLIC package contract entry points only (the
`publicEntrypoints` registered in `architecture-policy.yaml`; no package
internals are imported anywhere in the suites):

> a customer requests a service → a resource owner shares an eligible
> connection (consent → enrollment → observation) → instances cooperate
> through the coordination boundary (delegation, discovery, envelope
> validation with replay rejection, durable inbox lifecycle with retry +
> dead-letter) → the Lab forms and recommends an Organization (runComparison →
> evaluateOpportunity → PURSUE → founding from evidence → mandate) → ADCOS
> executes a group-purchase contract (request → offer → commitments to
> threshold → AUTHORIZE → PLACE_ORDER → RECONCILE) → a real group offer
> obtains approved commitments → the service and usage reconcile → member
> allocation per P2-W3 round-2 — with every leg persisting to JSONL adapter
> stores and full restarts proving idempotency/recovery.

Suites (all under the repo's recorded `node --import tsx --test` convention;
vitest does not exist in this repo):

| Suite                                                                | File                                                                                       | Tests |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----- |
| Composed full chain (in-process, deterministic injected clock)       | `test/integration/full-chain.test.ts`                                                      | 7     |
| Real-boundary restart dogfood (3 OS processes, real TCP, real clock) | `test/integration/two-process-restart.test.ts` + `test/integration/two-process/runtime.ts` | 4     |
| Negative integration legs                                            | `test/integration/negative-boundaries.test.ts`                                             | 9     |
| Simulation E2E scenario (delegated P2-W3 remainder)                  | `packages/simulation/test/e2e-scenario.test.ts`                                            | 7     |

Total: 20 integration tests + 7 simulation E2E tests, all green; the 11
existing simulation tests stay green (18/18 in package).

## The story, leg by leg, with the tests that prove each leg

### Leg 0 — the composed entry points

Every import in the integration suites targets a package's public contract
entry file (`packages/*/src/contract.ts`, `packages/adcos-contracts/src/index.ts`)
via relative paths. Bare `@adcos/*` specifiers do not resolve from the
repository root (workspace links live only inside `packages/*/node_modules`,
and tsx discovers `tsconfig.json` from the CWD, which is root); relative
imports to the public entries are the same convention the repo's own package
tests and verification runtimes use. `test/integration/tsconfig.json` carries
the `@adcos/*` path mappings (mirroring `packages/surfaces/tsconfig.json`) so
`npx tsc -p test/integration` typechecks the whole composed graph.

### Leg 1 — customer requests service; owner shares an eligible connection

`test/integration/full-chain.test.ts` →
`leg 1 — the customer requests a service; the owner shares an eligible
connection (enrollment → consent → observation)`.

- Owner enrolls `res-hotspot-1` (UNKNOWN, NOT_SHARED — enrollment never opts in).
- Explicit `OPT_IN` → SHARED (the only entry into SHARED; no silent resume).
- Owner records an observation: DEGRADED with freshness + evidence
  (observed beats declared; UNKNOWN is never fabricated).
- The customer's service request (`intent-stable-data`) is evaluated by the
  Lab through the surfaces service: baseline vs `alt-communal-bundle` →
  PURSUE, persisted as opportunity `lab-communal-opportunity`.
- Write-before-ack durability asserted (snapshots ≥ 4 before acknowledgement).

### Leg 2 — instances cooperate through the coordination boundary

`test/integration/full-chain.test.ts` → `leg 2 — instances cooperate through
the coordination boundary (delegation chain, discovery, envelope validation
with replay rejection, durable inbox lifecycle with retry + dead-letter)`.

- Delegation chains validated (owner side: two links with attenuation
  containment `device ⊇ device.forwarding`; customer side: single link);
  an attenuation-violating chain is refused.
- Discovery over the persisted resource projection: matched-on evidence
  (`capability:…`, `modes:relay`, `freshness:…`, `observed:DEGRADED`).
- Envelope validation: the service-request envelope passes every pre-dispatch
  gate; a replay (same idempotency key, fresh event id) is REJECTED with code
  REPLAY.
- Durable inbox event lifecycle over the JSONL adapter store: write-before-ack
  append → PENDING persisted (store reload proves durability) → PROCESSING →
  FAILED → retry within budget → COMPLETED for one message; a second
  (poisoned) message exhausts its 3/3 retry budget and is dead-lettered with
  the canonical reason; both survive a store restart over the same log.

### Leg 3 — the Lab PURSUE verdict founds the Organization

`test/integration/full-chain.test.ts` → `leg 3 — the Lab PURSUE verdict
founds the Organization from evidence (consent → formation → initial
mandates → membership growth)`.

- The verdict is recomputed from the persisted evidence at formation time;
  founders' explicit consent decides (the Lab never acts — INVARIANTS #21).
- Formation with initial mandates (customer: `group.purchase`; owner:
  `group`, covering purchase and membership management via prefix scope).
- Membership growth: the owner invites a third principal (membership-manage
  mandate checked), who accepts through the merged machine.

### Leg 4 — ADCOS executes the group-purchase contract

`test/integration/full-chain.test.ts` → `leg 4 — ADCOS executes the
group-purchase contract (request → fail-closed offer validation →
attributable offer → commitments to threshold → AUTHORIZE on computed
mandates → PLACE_ORDER with opaque payment evidence → CONFIRM_CONTRACT)`.

- The customer (member + mandate) opens the request (threshold 2).
- A non-mandated member cannot commit (fail-closed authority).
- The Lab's recommendation breadth ranks the candidate offers from a pinned
  evidence snapshot; the top-ranked candidate is the offer received. The
  no-change baseline is REJECTED with reasons (5 GB below the 8 GB hard
  requirement) — never silently dropped.
- FAIL-CLOSED cost summary: an offer whose stated total (999) does not match
  the per-member roll-up is refused by the composed surfaces/economics path.
- The consistent, attributable offer (provenance `unicom-listing:tier-2`)
  is received through the owning organization.
- Commitments to threshold: customer (1/2) then owner (2/2, THRESHOLD_MET;
  the order record follows automatically).
- AUTHORIZE is COMPUTED from the persisted mandates of every committed
  participant (its fail-closed negative is proven in
  `negative-boundaries.test.ts`).
- PLACE_ORDER without a payment reference refused; with the opaque
  `PaymentReference` (evidence per ADR-0004) → ORDERED → CONFIRM_CONTRACT.

### Leg 5 — member allocation + write-then-reload across the integration boundary

`test/integration/full-chain.test.ts` → `leg 5 — the obtained offer is
allocated across members (P2-W3 round-2: rounding policy, provenance, exact
money) and the surfaces state survives a write-then-reload across the
integration boundary`.

- `computeMemberAllocations` over the composed commitments: weights 4 + 7
  over a 10-unit offer; largest-remainder policy gives the customer 4 and the
  owner 6 units (consent caps respected; sums exact; shortfall 0); cost
  shares 10 000 / 15 000 minor units exactly; every record carries
  offer + commitment provenance; the opaque payment reference is attached as
  evidence only.
- WRITE-THEN-RELOAD: a brand-new service instance over the same durable JSONL
  log continues the story — the customer view is identical across the reload,
  and re-applying an already-applied command (enroll, commit) is REFUSED
  (idempotency at the command boundary).

### Leg 6 — the service and usage reconcile; the customer sees the finished story

`test/integration/full-chain.test.ts` → `leg 6 — the service and usage
reconcile; the customer sees the finished story through the isolated view;
the Lab shadow re-runs the decision advisory-only`.

- MARK_FULFILLED; RECONCILE refused with incomplete usage evidence; a fresh
  usage observation (evidence `usage:session-log-7d`) supplies the evidence;
  RECONCILE completes → RECONCILED.
- Isolated customer view: RECONCILED order, 2/2 commitments, own commitment
  id, the PURSUE recommendation; the owner's view shows the shared resource
  (SHARED/DEGRADED); operator aggregate role-gated.
- The simulation shadow harness re-runs the same decision snapshot advisory
  only: two independent runs produce identical reports.

### Leg 7 — durable evidence + full reload (idempotency/recovery)

`test/integration/full-chain.test.ts` → `leg 7 — durable evidence on disk for
every leg; a full reload of the composed system proves idempotency/recovery`.

- The state log's line count equals the durability accounting (torn-free);
  the last snapshot carries the RECONCILED order; the coordination inbox log
  carries the lifecycle transition lines.
- FULL RELOAD: a fresh service recovers the entire story; re-driving
  already-applied commands (lab evaluation, founding) stays refused; refused
  commands never persist anything (log length unchanged).

### Leg 8 — the same story across REAL process boundaries

`test/integration/two-process-restart.test.ts` (+ its own runtime
`test/integration/two-process/runtime.ts`, composed from the public surfaces
and coordination contract entries only — the package-internal verification
runtimes are precedents, not imports):

- **Process 1** (owner instance): enroll → OPT_IN → observe → Lab PURSUE →
  formation with mandates → clean exit. RESTART #1 over the shared durable
  state log.
- **Process 2** (customer instance): restores the same log, opens the
  purchase, receives the offer, commits, then starts a REAL TCP coordination
  endpoint (own durable inbox/outbox) and stays alive.
- **Process 3** (owner instance RESTARTED — restart #2): restores the same
  log; duplicate enrollment REFUSED (idempotency across a real restart);
  commits as the second member (threshold met); exchanges a REAL envelope
  with process 2 over TCP loopback (validated, durably appended
  write-before-ack, dispatched to COMPLETED, ACKed); sends a REPLAY of the
  same idempotency key which the receiver REJECTS with code REPLAY (never
  stored) while the sender records DELIVERED_DUPLICATE — at-least-once
  transport + receiver-side duplicate suppression = effectively-once domain
  effect; completes AUTHORIZE (computed mandates over both committed
  participants) → PLACE_ORDER (opaque payment evidence) → CONFIRM_CONTRACT →
  MARK_FULFILLED → RECONCILE; reads the finished story through the isolated
  customer view; durability stats torn-free.
- Durable evidence on disk after the story: the shared state log (last
  snapshot RECONCILED), process 2's coordination inbox (exactly one message,
  final state COMPLETED, the replay absent), process 3's coordination outbox
  (both sends' lifecycle snapshots).

### Negative legs (fail-closed across the composed surface)

`test/integration/negative-boundaries.test.ts` (9 tests):

- Replayed envelopes rejected (REPLAY only-failure; plus EXPIRED and
  OUT_OF_SCOPE gates).
- Expired consent resumption refused end-to-end: RESUME from NOT_SHARED
  refused with the view agreeing (no silent resume); founding from EXPIRED
  Lab evidence refused (stale verdicts cannot found; nothing persisted); an
  EXPIRED delegation refuses coordination authorization while the envelope
  itself would pass the wire gates (transport acceptance ≠ authorization);
  an EXPIRED request refuses new commitments and surfaces EXPIRED.
- Revoked resource unusable across the composed surface: view shows REVOKED,
  discovery never matches, consent/observation/re-revocation commands refused
  (terminal).
- Computed-mandate AUTHORIZE fails closed: a committed participant whose
  mandate EXPIRED between commit and authorize blocks authorization; the
  order record is not advanced.

### Simulation E2E (delegated P2-W3 remainder)

`packages/simulation/test/e2e-scenario.test.ts` (7 tests): one fixed-snapshot
scenario through `runScenario` covering the round-2 flows — member allocation
with the explicit rounding policy + per-record provenance + pre-fulfilment
withdrawal reallocation with an explicit one-unit shortfall under consent
caps; recommendation breadth with deterministic lexicographic ranking and
eligibility REJECT-with-reasons (hard constraints are ineligibility, never a
lower score); org formation flows (founding from PURSUE with consent +
mandates, dissolution with explicit dispositions incl. OUT_OF_AUTHORITY for
a non-member commitment and ALREADY_CLOSED for a revoked one). Two
independent runs over independently cloned inputs produce identical
canonical snapshots (deepEqual + canonical JSON); the input is never mutated.

## Durable-evidence locations (what is persisted where)

| Evidence                                                                                                                 | Location                                                                                                                 | Written by                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Surfaces service state (full snapshots, write-before-ack, one line per applied command; torn tails reported and skipped) | `<tmp>/…/surface-state.jsonl` via `JsonlSurfaceStateStore` (surfaces adapters layer)                                     | every applied surfaces command in every suite/process |
| Coordination inbox messages (full-message snapshots per lifecycle transition, fold-by-id on reload)                      | `<tmp>/…/coordination-inbox.jsonl` / `coord-*/inbox.jsonl` via `JsonlInboxStore` (coordination adapters layer)           | full-chain leg 2; two-process receive path            |
| Coordination outbox send attempts (entry snapshots per transition)                                                       | `<tmp>/…/coord-*/outbox.jsonl` via `JsonlInboxStore`                                                                     | two-process sender side                               |
| Allocation records (offer/commitment provenance, integer minor-unit cost shares, rounding policy id)                     | in the `AllocationResult` carried by the scenario report / test assertions (advisory projection; ADR-0004 evidence only) | `computeMemberAllocations` / `reallocateOnWithdrawal` |

In the two-process suite the exact assertion set on disk is: state-log line
count == durability snapshots, last snapshot carries `RECONCILED`;
`coord-cara/inbox.jsonl` contains exactly one distinct message id whose final
lifecycle snapshot is `COMPLETED` (the replayed envelope is absent — rejected
before the durable append); `coord-omar/outbox.jsonl` contains both send
entries (`outbox-evt-tp-commit-notice`, `outbox-evt-tp-commit-replay`) with
terminal `COMPLETED` lifecycles.

## MOCK/REAL labeling per boundary

### In-repo REAL (the machinery under test is the repo's real implementation)

- **fs persistence**: real filesystem JSONL stores (`JsonlSurfaceStateStore`,
  `JsonlInboxStore`) — real appends, real reloads, real torn-tail reporting
  paths, asserted on disk after the story.
- **real process restarts**: three separate OS processes over one durable
  state log (two clean restarts), each restoring via the public
  `createSurfacesService` constructor.
- **real clocks**: the two-process runtime uses `Date.now()` (a real process
  reading the real clock); the in-process suites use the injected
  deterministic clock (reproducibility), which is the recorded repo doctrine.
- **real TCP transport**: envelopes exchanged over real TCP loopback sockets
  between two live processes (`TcpTransportListener`/`TcpTransportClient`
  behind `CoordinationEndpoint`/`OutboxSender`), with real ACK/REJECT frames
  and a real replay rejection over the wire.
- **state machines + guards**: consent, membership, founding, mandate scope,
  threshold, order lifecycle, allocation — the landed packages' real code,
  composed only through public entries.

### SYNTHETIC evidence objects (structurally real, data is fixtures)

- **the provider offer** (`teleco-x`, `unicom-listing:tier-2`, prices): a
  pinned-snapshot fixture standing in for provider offer data. Per
  INVARIANTS #6, a catalog listing / synthetic fixture is never evidence of
  live capability. No live provider offer was fetched or claimed.
- **the opaque payment reference** (`payref-*`, `mobile-money`,
  `authorized-psp`): an opaque typed reference per ADR-0004. It is attached
  as evidence at PLACE_ORDER and carried on allocations; it is NEVER
  executed, settled or "confirmed" — there is no payment-rail integration
  anywhere in this repo (ADR-0004: rail selection deferred to the operator;
  live-money acceptance items are BLOCKED-ON-OPERATOR). No live payment
  success is claimed anywhere in this report or the suites.
- **usage evidence** (`usage:session-log-7d`, `probe:tcp-handshake-ok`):
  synthetic evidence strings fed through the real observation path; the
  RECONCILE guard consumes the real `usageEvidenceComplete` gate.

### Structurally impossible in-sandbox (never attempted, never claimed)

- **live provider payment/connectivity**: per ADR-0004 and the recorded
  BLOCKED-ON-OPERATOR state (P0-W3 limitation: "G-4 payment-rail selection
  deferred to operator; any live-money acceptance item is BLOCKED-ON-
  OPERATOR, never faked"). No payment rail exists in the repo or siblings;
  P4-W2 owns live provider/earnings evidence.
- **physical-device forwarding over real NICs/radios**: P4-W2
  (BLOCKED-ON-OPERATOR per the recorded P2-W2 limitation). The TCP loopback
  transport here is real IPC, not a physical network.
- **browser/renderer UI journeys**: renderer builds deterministically OOM in
  the 4.1 GiB sandbox (recorded since P0-W1); no browser build was attempted
  in this work order. The "actual user surface" is the service-level public
  API boundary the work order scopes for P3-W1 dogfood (the P2-W1 round-2
  surfaces journeys are the composed substrate).

## Idempotency / recovery demonstration

1. **In-process write-then-reload** (full-chain leg 5): new service over the
   same log → view identical; duplicate enroll/commit REFUSED with reasons.
2. **In-process full reload** (full-chain leg 7): duplicate lab evaluation
   and founding REFUSED; refused commands never append (log length
   unchanged).
3. **Real process restarts** (two-process suite): process 3 re-enrolls the
   resource process 1 already persisted → REFUSED "already enrolled"; the
   whole journey (resource, org, purchase, RECONCILED order) is recovered
   from the durable log into the restarted process's views; the state log
   grows monotonically across the three processes with zero torn lines.
4. **Coordination durability**: the delivered message's lifecycle
   (PENDING → PROCESSING → COMPLETED) is durable across the receiver's own
   process exit; the replayed envelope is rejected BEFORE any durable append
   (absent from the inbox log); the sender's outbox entries persist their
   transitions.
5. **Deduplicated effect across the wire**: the replay send returns
   DELIVERED_DUPLICATE (receiver REPLAY rejection + sender COMPLETED
   lifecycle) — the domain effect happens exactly once.

## Honest limitations

- **No live provider or payment evidence** — impossible in-sandbox by
  architecture decision (ADR-0004, BLOCKED-ON-OPERATOR); everything
  provider-side is a labeled synthetic fixture. This report never claims
  live connectivity, provider acceptance, or payment success.
- **No physical-device forwarding** — P4-W2; the real TCP transport here is
  loopback IPC inside one sandbox host.
- **No browser/UI verification** — renderer builds OOM in the 4.1 GiB
  sandbox (recorded environmental limit since P0-W1); the dogfood operates
  at the service/public-contract boundary, which is what P3-W1 composes
  from the landed P2-W1 surfaces work.
- **Full-repo typecheck OOMs** in this sandbox (recorded since P0-W1) —
  per-directory `tsc` was used instead (`test/integration`,
  `packages/simulation`, and the regression packages below).
- **Envelope signatures remain the inherited placeholder crypto** (recorded
  P1-W1 limitation): the validation pipeline is real, but sender identity is
  membership in the receiver's known-sender list, not cryptographic proof.
- **The surfaces state log is shared sequentially** in the two-process story
  (one writer at a time, by construction of the story); concurrent
  multi-writer contention on a single JSONL state log is NOT a supported
  deployment shape and was not tested — the coordination boundary is the
  supported cross-instance path (exercised over real TCP).
- **The two-process handler completes every accepted message** in the
  dogfood story; the fail-closed no-handler default and retry/dead-letter
  paths over the wire are covered by the coordination package's own 77-test
  suite, not re-proven here.

## Reproducing

From the repository root (toolchain: Node 24.x, pnpm 10.33.2 via
`npx pnpm@10.33.2`; `npx pnpm@10.33.2 install --ignore-scripts` first):
