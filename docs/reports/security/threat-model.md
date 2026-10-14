# ADCOS 2.0 Security Threat Model — P4-W1 Round 2

Status: COMMITTED (P4-W1 round-2 scope). Evidence basis: the executable
security batteries under `test/security/` (round-1 isolation battery merged
at 40d3195; round-2 batteries delivered on `p4-w1/security-battery-r2`), the
integration batteries under `test/integration/`, and the frozen public
contract surface of `packages/adcos-contracts` and the composed packages.
Every mitigation claim below is labeled **PROVEN** (a named battery test
executes it), **PARTIAL** (only part of the threat class is covered by the
public surface), or **GAP** (the frozen public surface provides no
mitigation). No claim rests on unexecuted code.

Out of scope (recorded limitations, not silently assumed safe): live
provider/payment boundaries (ADR-0004 — BLOCKED-ON-OPERATOR), physical-device
forwarding (P4-W2), envelope signature cryptography (placeholder — see
CFG-4), and browser/desktop UI surfaces (P2-W1 remainder).

---

## 1. Assets and adversaries

### 1.1 Assets (what an attacker wants)

| Asset                                                                                         | Where it lives                                                                                                                  | Authority concern                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Durable surfaces state (consents, resources, mandates, requests, offers, commitments, orders) | JSONL append-only log behind `JsonlSurfaceStateStore`                                                                           | product-domain                              |
| Coordination inbox/outbox messages + lifecycle (retry budget, dead-letters)                   | JSONL append-only log behind `JsonlInboxStore`                                                                                  | product-domain                              |
| Authority: mandates, delegations, memberships                                                 | persisted state rows, checked at every command boundary                                                                         | organization-contract                       |
| Money-adjacent integrity: offer totals, commitment allocations, thresholds, budget caps       | computed at command boundaries (economics/lab/group-purchasing)                                                                 | payment-system (opaque refs only, ADR-0004) |
| Provider credentials                                                                          | `ShareNetPort.auth.credentials` — the ONLY credential-bearing contract slot; consumed by the ShareNet seam (fails closed today) | provider-adapter                            |
| Role configuration (operator/developer principals)                                            | deployment configuration passed to `createSurfacesService` — never runtime state                                                | product-domain                              |
| Wire messages (envelopes)                                                                     | validated by `validateEnvelope` before any dispatch                                                                             | adcos-connectivity                          |

### 1.2 Adversary classes

1. **External attacker** — anyone who can reach a coordination endpoint or
   submit inputs to the public surface. No identity, no membership, no
   mandate.
2. **Malicious tenant** — an authenticated principal acting within their own
   rows, attempting to reach _other_ principals' rows or exceed their
   authority (cross-tenant reads/writes, authority escalation).
3. **Colluding member ring** — ≥2 members of one organization coordinating
   to self-deal a group purchase (fabricated discounts, allocation
   inflation, authorization laundering).
4. **Replay attacker** — re-delivers previously accepted commands/messages,
   or exploits crash windows (partial failure) to double-apply effects.
5. **Resource abuser (griefing/Sybil)** — floods registration/offer/command
   surfaces to exhaust memory, storage or attention; manufactures many
   pseudo-identities.
6. **Compromised deployment config (impostor operator)** — a principal
   wrongly granted (or self-asserting) an operator/developer role, or a
   misconfigured deployment that fails to list roles at all.

---

## 2. Trust boundaries

```
   UNTRUSTED                      SEMI-TRUSTED                    TRUSTED
┌──────────────┐   wire gates   ┌──────────────────┐  command   ┌─────────────┐
│ any network  │──validateEnve- │ SurfacesService   │──boundary──│ durable     │
│ participant  │   lope (schema,│ (tenant/mandate/  │  write-    │ JSONL stores│
│              │   freshness,   │ membership/id/    │  before-   │ (adapters)  │
│              │   scope, epoch,│ arithmetic        │  ack)      │             │
│              │   sender,      │ guards)           │            └─────────────┘
│              │   replay)      └──────────────────┘
└──────────────┘
        │                                   ┌────────────────────────────────┐
        │                                   │ deployment configuration       │
        │                                   │ operatorPrincipals /           │
        │                                   │ developerPrincipals (roles are │
        │                                   │ CONFIG, not runtime state)     │
        │                                   └────────────────────────────────┘
        │ provider seam
└──────▶ createShareNetSeam (port config validated; credentials live ONLY in
         ShareNetPort.auth.credentials; every operation FAILS CLOSED — no real
         integration exists, ADR-0001)
```

Boundaries and their enforcement points (all public contract entries):

- **B1 — wire → endpoint**: `validateEnvelope` gates (MALFORMED / EXPIRED /
  OUT_OF_SCOPE / STALE_POLICY_EPOCH / UNKNOWN_SENDER / OVERSIZED / REPLAY)
  plus the replay guard, `createEnvelopeReplayGuard`. Transport acceptance
  ≠ authorization (`checkDelegationChain` is a separate authority check).
- **B2 — command → state**: `SurfacesService` command methods. Every write
  is tenant-checked (owner/member/participant), mandate-checked (scope +
  expiry + revocation computed from persisted mandates), id-uniqueness
  checked, and arithmetic-guarded (offer totals, threshold evaluation).
  Refused commands persist nothing.
- **B3 — state → disk**: `JsonlSurfaceStateStore` / `JsonlInboxStore`
  (adapters layer): append-only snapshots, write-before-ack, torn-tail
  detection (reported, never trusted), last-intact-snapshot fold on
  restart.
- **B4 — process → provider**: the ShareNet seam. Credentials never cross
  back out; a missing/incorrect port config is a typed configuration error;
  every consequential operation fails closed (`ShareNetSeamUnavailableError`,
  `notIntegrated: true` per ADR-0001).
- **B5 — config → roles**: operator/developer views are gated against
  deployment-provided principal lists; an empty/unconfigured list fails
  closed for everyone.
- **B6 — consumer → packages**: package internals are not importable
  surface; `pnpm run architecture:check` enforces public-entrypoint-only
  imports (forbidDeepImports) so downstream code cannot route around the
  boundary functions above.

---

## 3. Threat catalog (per adversary class)

Labels: **PROVEN** = battery test executes the mitigation (battery file +
test name cited); **PARTIAL** = subset covered, remainder explicitly
unmitigated on the frozen surface; **GAP** = no mitigation on the frozen
public surface. Invariant numbers refer to `spec/architecture/INVARIANTS.md`.

### 3.1 External attacker (EXT)

| ID    | Threat                                                                   | Mitigation                                                                                                          | Evidence                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXT-1 | Malformed envelopes smuggled into dispatch                               | Schema-validated, fail-closed gate; refusal detail names field+type only                                            | PROVEN — `test/security/secrets.test.ts` "a malformed envelope carrying the sentinel in a type-invalid field fails with field+type only" (see also `test/integration/negative-boundaries.test.ts`)                                                                                             |
| EXT-2 | Expired/off-scope/stale-epoch/unknown-sender envelopes dispatched        | EXPIRED / OUT_OF_SCOPE / STALE_POLICY_EPOCH / UNKNOWN_SENDER gates                                                  | PROVEN — `test/integration/negative-boundaries.test.ts` (merged round-1 evidence); freshness gate re-proven at the retry-budget boundary in `test/security/budget-negatives.test.ts` "an exhausted retry budget refuses reprocessing even for a message whose envelope passes every wire gate" |
| EXT-3 | Non-member opens/commits/offers/membership-events on an organization     | Membership + mandate guards at every purchase/membership command                                                    | PROVEN — `test/security/isolation.test.ts` "non-member group-purchase actions are refused" (5 tests)                                                                                                                                                                                           |
| EXT-4 | Unauthorized order advancement (AUTHORIZE asserted rather than computed) | AUTHORITY computed from persisted mandates of ALL committed participants; fail-closed                               | PROVEN — `test/security/isolation.test.ts` "AUTHORIZE with a committed participant whose mandate expired is refused"; expiry across restart in `test/security/replay-partial-failure.test.ts` "mandate expiry between commit and authorize fails closed ACROSS the restart"                    |
| EXT-5 | Forged/absent delegation chains grant device authority                   | `checkDelegationChain` refuses revoked/expired/absent/attenuation-violating chains                                  | PROVEN — `test/security/isolation.test.ts` "expired / revoked delegations are unusable at the coordination boundary" (3 tests)                                                                                                                                                                 |
| EXT-6 | Envelope signature forgery (message tampering on the wire)               | NONE on the frozen surface — `Envelope.signature` is documented placeholder crypto (inherited contracts limitation) | **GAP** — CFG-4; no signing material exists to test; round-3 proposal R-3                                                                                                                                                                                                                      |
| EXT-7 | Oversized frames / payload flooding on the wire                          | Frame/digest size gates (`DEFAULT_MAX_FRAME_BYTES`, `maxPayloadDigestLength`)                                       | PROVEN (merged P2-W2 evidence, coordination suite); size-gate proxy re-exercised in `test/security/replay-partial-failure.test.ts` envelope legs                                                                                                                                               |

### 3.2 Malicious tenant (TEN)

| ID    | Threat                                              | Mitigation                                                                                             | Evidence                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEN-1 | Consent/revoke/observe another principal's resource | Owner-only guards; refused commands persist nothing                                                    | PROVEN — `test/security/isolation.test.ts` "a non-owner cannot consent to, revoke or observe another principal's resource"                                                                                                      |
| TEN-2 | View another tenant's rows (read isolation)         | Views are principal-scoped projections; isolation survives restart                                     | PROVEN — `test/security/isolation.test.ts` "views only ever expose the caller's own rows — and the isolation survives persistence and restart"                                                                                  |
| TEN-3 | Withdraw another participant's commitment           | Participant-only withdrawal guard                                                                      | PROVEN — `test/security/isolation.test.ts` "a non-participant cannot withdraw another principal's commitment"; re-proven as theft-in-ring in `test/security/abuse-collusion.test.ts` "cross-member withdrawal theft is refused" |
| TEN-4 | Escalate to operator/developer role                 | Role views gated against deployment config; unconfigured = fail closed                                 | PROVEN — `test/security/isolation.test.ts` "impostor role views are refused" (3 tests)                                                                                                                                          |
| TEN-5 | Internal state exfiltration via command results     | `PublicResult` redaction strips the internal state document; results carry no internal snapshot arrays | PROVEN — `test/security/secrets.test.ts` "a full journey's command results carry no own 'state' and no internal snapshot arrays"                                                                                                |
| TEN-6 | Exceed mandate scope (membership-blanket authority) | Mandates are individually scoped (prefix semantics); wrong-scope mandate refuses purchase actions      | PROVEN — `test/security/isolation.test.ts` "a member whose mandate does not cover group.purchase cannot commit"                                                                                                                 |
| TEN-7 | Resume consent without a fresh opt-in               | Consent machine: no silent resume; explicit OPT_IN required                                            | PROVEN — `test/integration/negative-boundaries.test.ts` (merged) "RESUME from NOT_SHARED is refused across the service + view boundary"                                                                                         |

### 3.3 Colluding member ring (RING)

| ID     | Threat                                                                                       | Mitigation                                                                                                                                                                                                                               | Evidence                                                                                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RING-1 | Fabricate a volume discount (understated totals) unavailable to individuals                  | Arithmetic-consistency guard: stated totalCost must equal perMemberCost × quantity                                                                                                                                                       | PROVEN — `test/security/abuse-collusion.test.ts` "a fabricated volume discount (understated totals) is refused by the arithmetic-consistency guard"                                   |
| RING-2 | Inflate committed allocation via duplicate commitments                                       | Duplicate commitments refused at the boundary AND counted-once by threshold evaluation (committed allocation cannot grow)                                                                                                                | PROVEN — `test/security/abuse-collusion.test.ts` "duplicate-commitment inflation is refused at the boundary AND counted-once by the threshold evaluation"                             |
| RING-3 | Authorize with one unmandated ring member                                                    | Computed-mandate AUTHORIZE guard covers every committed participant                                                                                                                                                                      | PROVEN — `test/security/isolation.test.ts` (round-1, same guard); see EXT-4                                                                                                           |
| RING-4 | A ring of pseudo-identities manufacturing distinct principals (identity Sybil inside an org) | Principals are unauthenticated strings at this substrate layer: the contract refuses mandate-less/cross-tenant ACTS, but does not verify principal identity (identity-trust-authority is a separate concern per spec/authority-model.md) | **GAP** (out of frozen-contract scope) — see ABU-1                                                                                                                                    |
| RING-5 | Launder an over-budget purchase through ring ranking                                         | Budget cap is a hard constraint applied to every candidate including the baseline; over-budget candidates are REJECTED with reasons                                                                                                      | PROVEN — `test/security/budget-negatives.test.ts` "the objectively best candidate above the cap is REJECTED with reasons" + "the baseline (current spend) is subject to the same cap" |

### 3.4 Replay attacker (RPL)

| ID    | Threat                                                                       | Mitigation                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RPL-1 | Re-deliver the same command intent (duplicate writes, double effects)        | Id-uniqueness across opportunity/organization/request/offer/commitment namespaces; withdrawal/revocation terminal-safe; refused replays leave the view byte-identical           | PROVEN — `test/security/replay-partial-failure.test.ts` "replayed commands are refused with no double-effects" (2 tests)                                                                                                                                                                                    |
| RPL-2 | Re-deliver the same wire intent (idempotency key / eventId)                  | Replay guard keys on `idempotencyKey ?? eventId`; second delivery is REPLAY-refused before dispatch                                                                             | PROVEN — `test/security/replay-partial-failure.test.ts` "double-delivery of the same intent grants nothing on the wire" (2 tests); wire-level REJECT→DELIVERED_DUPLICATE proven in merged P2-W2 two-process evidence                                                                                        |
| RPL-3 | Replay after guard capacity eviction                                         | The replay guard is bounded FIFO: an evicted key is forgotten; a replay of an evicted key is accepted                                                                           | **PARTIAL** — capacity-bounded by design (documented probe: `test/security/replay-partial-failure.test.ts` "the replay guard is honestly capacity-bounded"); second line of defense = durable id-uniqueness at B2 (RPL-1). Threat-model note: replay window ≈ guard capacity (default 10 000 distinct keys) |
| RPL-4 | Replay after process restart (guard state is process-local)                  | In-memory guard resets on restart; durable defense is B2 id-uniqueness (for surfaces commands) and inbox same-id fold (for messages: lifecycle transitions, last snapshot wins) | **PARTIAL** — restart-fold proven (`test/security/replay-partial-failure.test.ts` inbox suite); no durable cross-restart replay ledger for envelopes themselves (round-3 proposal R-2)                                                                                                                      |
| RPL-5 | Exploit crash windows: commit-then-crash / authorize-then-crash double-apply | Write-before-ack + last-intact-snapshot fold: the restarted instance preserves exactly the applied prefix; replayed AUTHORIZE refused by the order state machine                | PROVEN — `test/security/replay-partial-failure.test.ts` "commit-then-crash…" and "authorize-then-crash…"                                                                                                                                                                                                    |
| RPL-6 | Crash-during-persist (torn tail) corrupts or wedges state                    | Torn lines counted and skipped; last intact snapshot folded; service keeps working over the damaged log                                                                         | PROVEN — `test/security/replay-partial-failure.test.ts` "crash-during-persist…"; inbox-side torn-tail handling proven in merged P2-W2 store tests                                                                                                                                                           |
| RPL-7 | Crash resets the retry budget (endless retries of a poisoned message)        | Retry-budget consumption is durable (inbox fold); exhausted budget dead-letters across restarts                                                                                 | PROVEN — `test/security/replay-partial-failure.test.ts` "a FAILED attempt's budget consumption survives reload…"                                                                                                                                                                                            |

### 3.5 Resource abuser — griefing / Sybil (ABU)

| ID    | Threat                                                      | Mitigation                                                                                                                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ABU-1 | Sybil registration flood (many identities)                  | id-uniqueness refuses duplicate-id floods with zero state multiplication; membership self-bootstrap refused (mandate + consent path) — BUT distinct-id floods are not cardinality-bounded | **PARTIAL** — `test/security/abuse-collusion.test.ts` "a duplicate-id enrollment flood is refused…" + "membership self-bootstrap is refused"; the unbounded distinct-id case is evidenced as a GAP PROBE in the same battery ("a DISTINCT-id enrollment flood is not cardinality-bounded"). No rate/quota API exists on the frozen surface (zero `quota`/`rateLimit` hits in the ADCOS packages) |
| ABU-2 | Consent opt-in/opt-out griefing loop wedges the surface     | Each cycle leaves consistent state; fresh opt-in still applies; one consent row (no multiplication)                                                                                       | PROVEN — `test/security/abuse-collusion.test.ts` "an opt-in/opt-out consent loop ×5 leaves consistent state…"                                                                                                                                                                                                                                                                                    |
| ABU-3 | Commit/withdraw/re-commit griefing loop wedges the request  | Each cycle consistent (deterministic commitment sequence); the request still reaches threshold afterwards                                                                                 | PROVEN — `test/security/abuse-collusion.test.ts` "a commit/withdraw/re-commit loop ×5…"                                                                                                                                                                                                                                                                                                          |
| ABU-4 | Revocation griefing (post-revoke event flood)               | REVOKED is terminal: every further event refused; the wedge never spreads to other resources                                                                                              | PROVEN — `test/security/abuse-collusion.test.ts` "terminal revocation absorbs further griefing…"                                                                                                                                                                                                                                                                                                 |
| ABU-5 | Offer spam (storage/exhaustion)                             | Duplicate-id / expired / inconsistent-totals offers refused; one intact row survives — distinct-id VALID offers are not quota-bounded                                                     | **PARTIAL** — `test/security/abuse-collusion.test.ts` "offer spam is refused on the id/expiry/totals surfaces"                                                                                                                                                                                                                                                                                   |
| ABU-6 | Memory exhaustion via unbounded replay-guard growth         | Guard is bounded FIFO (maxEntries, default 10 000)                                                                                                                                        | PROVEN (bounded-by-design) — same battery probe as RPL-3; note the flip side recorded there                                                                                                                                                                                                                                                                                                      |
| ABU-7 | Storage amplification via the append-only full-snapshot log | No compaction on the frozen surface: every applied command appends a FULL state snapshot (O(n) per write, O(n²) cumulative)                                                               | **GAP** (design consequence of the durable-store pattern) — quantified as the primary load risk in `docs/reports/security/backup-restore-load-plan.md` §5; round-3 proposal R-5                                                                                                                                                                                                                  |

### 3.6 Compromised deployment config / impostor operator (CFG)

| ID    | Threat                                                     | Mitigation                                                                                                                                                          | Evidence                                                                                                                                  |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CFG-1 | Impostor claims the operator role                          | Role views gated against the configured principal list; refusal carries no cross-tenant aggregate                                                                   | PROVEN — `test/security/isolation.test.ts` "a principal not holding the operator role is refused the operator view"                       |
| CFG-2 | Unconfigured deployment implicitly grants roles            | Empty/unset role lists fail closed for everyone (no implicit grants)                                                                                                | PROVEN — `test/security/isolation.test.ts` "with no operator list configured, the operator view fails closed for everyone"                |
| CFG-3 | Operator/developer views leak tenant material              | Aggregates expose counts and public identifiers only; views stay sentinel-free                                                                                      | PROVEN — `test/security/secrets.test.ts` "customer, operator and developer views stay sentinel-free…"                                     |
| CFG-4 | Compromised wire authenticity (signature crypto absent)    | `Envelope.signature` is a placeholder; no signing/verification exists                                                                                               | **GAP** (inherited, recorded since P1-W1) — the batteries therefore assert fail-closed behavior of every OTHER gate; round-3 proposal R-3 |
| CFG-5 | Stale Lab evidence founds an organization                  | Founding requires persisted, unexpired PURSUE evidence                                                                                                              | PROVEN — `test/integration/negative-boundaries.test.ts` (merged) "founding from EXPIRED Lab evidence is refused end-to-end"               |
| CFG-6 | Secrets leakage through refusal paths / serialized outputs | Credential refusal errors report types, not values; unknown keys dropped; command results and views sentinel-free; port credentials never echoed by the seam        | PROVEN — `test/security/secrets.test.ts` (all 5 suites)                                                                                   |
| CFG-7 | Credential theft / rotation needs                          | Credentials live ONLY in `ShareNetPort.auth.credentials` (provider-adapter concern, INVARIANTS #3); no credential storage/rotation API exists on the frozen surface | **GAP** — rotation is unsatisfiable today (the seam itself fails closed and contacts nothing); round-3 proposal R-4                       |

---

## 4. Cross-cutting honest findings (round-2)

1. **Defense in depth against replay is real but layered unequally.** The
   wire guard is capacity-bounded and process-local (RPL-3/RPL-4); the
   durable defense is surfaces id-uniqueness (B2). Any future command
   surface added without an id-uniqueness check would regress RPL-1.
2. **No cardinality/rate/quota surface exists anywhere in the ADCOS
   packages** (verified by exhaustive keyword search: zero `quota`,
   `rateLimit`, `Sybil`, `abuse` hits in `packages/*/src`). Anti-Sybil
   posture today = id-uniqueness + consent/mandate gates only (ABU-1/ABU-5
   PARTIAL).
3. **Negative CONSISTENT offers are accepted** (probe evidence, round-2
   report): `perMemberCost: -25, quantity: 3, totalCost: -75` passes the
   schema and the arithmetic-consistency guard. Inconsistent or non-finite
   (NaN/Infinity) amounts are refused. GAP; round-3 proposal R-1.
4. **No monetary budget ledger exists** — budget enforcement lives at the
   ranking hard-constraint (`maxPriceMinorUnits`), the offer arithmetic
   guard, and the coordination retry budget. "Budget decrement/restart"
   proofs were executed on the two ledgers that exist (commitment ledger,
   retry budget); a monetary spend ledger would need a contract change
   (TL-serialized, per INVARIANTS #29).
5. **Principals are unauthenticated strings** at this layer. All
   tenant/mandate isolation proofs are about AUTHORITY, not IDENTITY
   verification (RING-4/ABU-1). Identity-trust-authority remains a separate
   concern per `spec/authority-model.md`.

## 5. Round-3 proposals

See `docs/reports/security/round-2-report.md` §Round-3 (proposals R-1…R-6):
offer-schema positivity guard; durable envelope replay ledger; envelope
signature cryptography (ADR); credential-rotation seam contract; snapshot
compaction / segmented logs; cardinality quotas with operator-configured
bounds.
