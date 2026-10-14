# P4-W1 Round 2 — Security Hardening Batteries + Docs: Delivery Report

Branch: `p4-w1/security-battery-r2` (from `main` @ `be17113`). Owned paths
only: `test/security/**` and `docs/reports/security/**`. No `src/` edits,
no package-internal imports, no new dependencies (`node:test`,
`assert/strict`, `node:fs/os/path` only), `packages/adcos-contracts`
FROZEN. All assertions target PUBLIC contract entry points only.

---

## 1. Verification evidence (real exit codes, final run)

| #   | Command                                                                 | Exit code | Key output                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `node --import tsx --test test/security/isolation.test.ts`              | **0**     | tests 15; suites 5; pass 15; fail 0                                                                                                                                                                             |
| 2   | `node --import tsx --test test/security/replay-partial-failure.test.ts` | **0**     | tests 11; suites 4; pass 11; fail 0                                                                                                                                                                             |
| 3   | `node --import tsx --test test/security/abuse-collusion.test.ts`        | **0**     | tests 11; suites 4; pass 11; fail 0                                                                                                                                                                             |
| 4   | `node --import tsx --test test/security/budget-negatives.test.ts`       | **0**     | tests 9; suites 5; pass 9; fail 0                                                                                                                                                                               |
| 5   | `node --import tsx --test test/security/secrets.test.ts`                | **0**     | tests 6; suites 5; pass 6; fail 0                                                                                                                                                                               |
| 6   | `pnpm run typecheck`                                                    | **0**     | `tsc -b packages/rpc … packages/desktop/tsconfig.host.json` — clean (note: this script covers the inherited ZCode packages; it does not include the ADCOS packages or `test/`, per the recorded OOM workaround) |
| 6b  | `npx tsc -p test/security`                                              | **0**     | 0 type errors — the ADCOS-side typecheck actually covering this delivery (recorded per-directory workaround)                                                                                                    |
| 7   | `node scripts/check-project-spec.mjs`                                   | **0**     | `ADCOS 2.0 project-spec check PASSED (15 required files; 5 locked sections; 11 unique work orders; current-state, architecture version, and frontier valid)`                                                    |
| 8   | `pnpm run architecture:check`                                           | **0**     | `architecture: OK; violations: 0; baseline: 0; new: 0`                                                                                                                                                          |
| 9   | `pnpm run lint`                                                         | **0**     | `Found 73 warnings and 0 errors` (warnings inherited, pre-existing; 0 errors)                                                                                                                                   |
| 10  | `pnpm run fmt`                                                          | **0**     | oxfmt auto-normalize completed on 3 133 files                                                                                                                                                                   |
| 10b | `pnpm run fmt:check` (repo-wide, immediately after step 10)             | **0**     | `All matched files use the correct format.`                                                                                                                                                                     |
| 10c | `npx oxfmt --check test/security docs/reports/security`                 | **0**     | `All matched files use the correct format.` on the 8 delivered files                                                                                                                                            |

**fmt honesty note:** the repo-wide `pnpm run fmt` also normalized 43
NON-owned files that carry the fmt debt recorded since P0-W1 ("fmt:check
red on 31 inherited + 7 ADCOS-added files … not gate-blocking"). Because
the binding constraint (owned paths ONLY; the work order's own
`git add test/security docs/reports/security`) forbids delivering those
files, their normalization was reverted after step 10b. The delivered
files are format-clean (step 10c, exit 0); the inherited repo fmt debt
remains exactly the recorded status quo ante and is NOT introduced or
worsened by this delivery. One owned-path exception:
`test/security/isolation.test.ts` (round-1 battery) received oxfmt's
normalization (50 insertions / 61 deletions, formatting only — one of the
recorded "7 ADCOS-added" fmt-debt files); its 15/15 tests were re-run
green after normalization.

Commit: `git add test/security docs/reports/security && git commit -m "p4-w1 round-2: security batteries (replay/abuse/budget/secrets) + threat model + backup/restore/load plan"` — hash recorded in §6. Not pushed (no credentials).

---

## 2. Per-deliverable status

### T1 — Threat model (`docs/reports/security/threat-model.md`) — **PROVEN** (doc)

One-line evidence: 6 adversary classes, 6 trust boundaries, 30 catalogued
threats (EXT/TEN/RING/RPL/ABU/CFG), each mapped to a named battery test or
explicitly labeled PARTIAL/GAP — zero unmapped claims.

### T2 — Replay / partial-failure battery (`test/security/replay-partial-failure.test.ts`) — **PROVEN** (11/11)

One-line evidence per class:

- replayed commands refused, no double-effects (view byte-identical): **PROVEN** — "duplicate opportunity/organization/request/offer/commitment commands are each refused — and the view is byte-identical" + terminal-safe withdrawal/revocation replays.
- double-delivery of the same intent grants nothing: **PROVEN** — REPLAY refusal on repeated idempotencyKey (fresh eventId) and on repeated eventId (key fallback).
- crash-between-steps (commit-then-crash / authorize-then-crash) leaves consistent recoverable state: **PROVEN** — restart over the same durable log preserves exactly the applied prefix; replayed AUTHORIZE refused (`event AUTHORIZE is not legal in state AUTHORIZED`); recovery continues to ORDERED.
- crash-during-persist (torn tail): **PROVEN** — torn line counted/skipped, last intact snapshot folded, service keeps working.
- mandate expiry between commit and authorize fails closed ACROSS restart: **PROVEN** — authority recomputed from persisted mandates on the restarted instance.
- inbox partial failure durable: **PROVEN** — retry-budget consumption and dead-letter state survive two restart folds; budget never resets.
- replay-guard capacity bound: **PARTIAL** (by design) — documented probe: an evicted key is forgotten (bounded FIFO, default 10 000); replay window ≈ guard capacity. Second line of defense = durable surfaces id-uniqueness (PROVEN above).

### T3 — Abuse / Sybil / collusion battery (`test/security/abuse-collusion.test.ts`) — **PARTIAL** (11/11 green; classes honestly split)

- duplicate-id Sybil floods (resource/org/request/offer namespaces): **PROVEN** — refused after the first write, zero state multiplication.
- membership self-bootstrap: **PROVEN** — outsider self-invite refused (mandate + consent path), nothing persisted.
- ring self-dealing — fabricated volume discount: **PROVEN** — understated totals refused by the arithmetic-consistency guard.
- ring self-dealing — allocation inflation: **PROVEN** — duplicate commitments refused at the boundary AND counted-once by `evaluateCommitments` (committed allocation cannot grow).
- ring self-dealing — cross-member withdrawal theft: **PROVEN** — owner-only withdrawal refused, victim's commitment intact.
- griefing loops (consent, commit/withdraw/re-commit, post-revoke): **PROVEN** — each cycle leaves consistent state; surfaces keep working after every loop; revocation terminal.
- offer spam: **PARTIAL** — duplicate-id/expired/inconsistent-totals refused; distinct-id VALID offers are not quota-bounded (no quota surface exists — zero `quota`/`rateLimit` hits in the ADCOS packages).
- distinct-id Sybil registration flood: **GAP** — no cardinality quota on the frozen public surface; evidenced as a labeled GAP PROBE in the battery (50 distinct ids all enroll), never asserted as a guarantee.

### T4 — Budget-enforcement negatives (`test/security/budget-negatives.test.ts`) — **PARTIAL** (9/9 green; mapped to the three budget seams that exist)

- over-budget refusal as a HARD constraint (not a score): **PROVEN** — the objectively best candidate above `maxPriceMinorUnits` is REJECTED with `price 500 above budget cap 120 (hard constraint)`; removing the cap restores its rank (INVARIANTS #22); the baseline (current spend) is subject to the same cap.
- negative/zero/NaN/non-finite amounts refused: **PROVEN** at the ranking precheck (NaN/Infinity/negative/fractional price, zero/negative/NaN/Infinity capacity → REJECTED with exact reasons) and the trade-off engine (throws, incl. unsafe cross-product range guard); **PROVEN** at the offer boundary for lying totals (under/overstated refused) and non-finite amounts (NaN/Infinity → fail-closed throw). **GAP**: a CONSISTENT negative offer (`perMemberCost: -25, totalCost: -75`) is accepted by the frozen schema — probe-evidenced, not asserted as a guarantee; round-3 proposal R-1. Zero price is legal by documented contract domain ("integer >= 0").
- budget decrement atomic under interleaving (no lost updates): **PARTIAL** — no monetary budget ledger exists on the frozen surface (GAP); proven on the ledgers that exist: commitment/threshold accounting exact under interleaved duplicates + withdrawal cycles, and retry-budget decrement exact across restarts.
- budget state survives restart: **PROVEN** — commitment-ledger accounting identical after restart (view + durable ledger rows); retry-budget consumption durable across restart folds (T2 inbox suite).
- exhausted budget grants nothing even with valid mandate/envelope: **PROVEN** — exhausted retry budget refuses reprocessing of a message whose envelope passes every wire gate; over-budget candidates refused despite valid data and best merit.

### T5 — Secrets battery (`test/security/secrets.test.ts`) — **PROVEN** (6/6) with two recorded GAPs

- ShareNet port credentials never surface: **PROVEN** — sentinel apiKey/token/secret in `auth.credentials`; probe, implementation label and all seven operation errors stay sentinel-free.
- credential refusal paths never leak the rejected secret: **PROVEN** — malformed-port `ShareNetSeamConfigurationError` reports field + received TYPE, never the value; unknown extra keys dropped, not echoed.
- command-boundary redaction: **PROVEN** — full-journey results carry no own `state` and no internal snapshot arrays.
- view minimization: **PROVEN** — customer/operator/developer views stay sentinel-free despite sentinel-shaped device ids, observation evidence URIs, offer provenance/product and request requirements; resource cards expose exactly the six card fields.
- wire refusal details never echo rejected values: **PROVEN** — MALFORMED detail names field + type only.
- **GAP 1**: envelope signatures are documented placeholder crypto — no signing-key material exists to test (inherited limitation, CFG-4).
- **GAP 2**: no credential-rotation API exists on the frozen surface (CFG-7) — the seam itself fails closed and contacts nothing today.

### T6 — Backup/restore + load plan (`docs/reports/security/backup-restore-load-plan.md`) — **PARTIAL** (doc)

One-line evidence: per durable seam (`JsonlSurfaceStateStore`, `JsonlInboxStore`): backup procedure PARTIAL (interrupted-copy safety PROVEN via the torn-tail battery; scripted runbook PLANNED), restore procedure PROVEN (restart-fold executed), post-restore verification queries PROVEN (runbook assembled = PROPOSED for the P5-W1 drill), RPO/RTO PROPOSED ONLY (zero measured numbers), load plan PLANNED (scenarios L1–L7, metrics, no-dependency tooling).

---

## 3. Honest findings (new, round-2)

1. **Consistent-negative offers are accepted** by the frozen offer schema
   (probe: `perMemberCost: -25, quantity: 3, totalCost: -75` → schema PASS,
   `totalsConsistent: true`). Inconsistent, NaN and Infinity amounts are
   refused. → GAP, proposal R-1.
2. **The envelope replay guard is capacity-bounded and process-local**:
   evicted keys are forgotten (documented probe at `maxEntries: 2`), and
   restart resets guard memory. Durable defense = surfaces id-uniqueness.
   → PARTIAL, proposals R-2.
3. **No cardinality/rate/quota surface exists anywhere** in the ADCOS
   packages (exhaustive keyword search: zero `quota`/`rateLimit`/`Sybil`/
   `abuse` hits in `packages/*/src`). Anti-abuse posture = id-uniqueness +
   consent/mandate gates only. → GAP, proposal R-6.
4. **No monetary budget ledger exists** — budget enforcement lives at the
   ranking hard-constraint, the offer arithmetic guard, and the retry
   budget; "decrement/restart" proofs executed on the commitment ledger and
   retry budget. → GAP (needs a contract change, TL-serialized).
5. **Full-snapshot JSONL amplification** is the primary load risk
   (every applied command appends a full state snapshot; O(n²) cumulative).
   → quantification PLANNED (load-plan L5/L7), proposal R-5.

## 4. Regression status

Round-1 isolation battery re-run after oxfmt normalization: 15/15, exit 0.
No other test suites were touched; no `src/` file was modified
(`git status` shows only owned paths).

## 5. Delivery manifest

- `test/security/replay-partial-failure.test.ts` (new, 11 tests)
- `test/security/abuse-collusion.test.ts` (new, 11 tests)
- `test/security/budget-negatives.test.ts` (new, 9 tests)
- `test/security/secrets.test.ts` (new, 6 tests)
- `test/security/isolation.test.ts` (formatting normalization only, 50+/61−; behavior unchanged, 15/15 re-verified)
- `docs/reports/security/threat-model.md` (new)
- `docs/reports/security/backup-restore-load-plan.md` (new)
- `docs/reports/security/round-2-report.md` (this file)

## 6. Round-3 proposals

- **R-1** Offer-schema positivity guard: refuse non-positive
  `perMemberCost`/`totalCost`/charge amounts at the frozen
  `GroupPurchaseOfferSchema` (contract change, TL-serialized; until then
  the GAP is recorded, never papered over).
- **R-2** Durable envelope replay ledger: persist seen idempotency keys in
  the adapters layer so replay protection survives restart and guard
  eviction (removes RPL-3/RPL-4 PARTIALs).
- **R-3** Envelope signature cryptography: replace the placeholder
  `Envelope.signature` with real signing/verification behind an ADR
  (removes EXT-6/CFG-4 GAP; requires key management decisions).
- **R-4** Credential-rotation seam contract: a `ShareNetPort` rotation flow
  (old+new credential overlap, revocation propagation) once any real
  provider adapter exists (removes CFG-7 GAP).
- **R-5** Snapshot compaction / segmented logs for the JSONL stores
  (removes ABU-7 GAP; contract-shape change; pairs with load-plan L5).
- **R-6** Cardinality quotas with operator-configured bounds (enrollment/
  request/offer counts per principal per org; removes ABU-1/ABU-5
  PARTIALs; needs deployment-config surface).
- **R-7** Execute the load plan (L1–L7) with the no-dependency node:test
  harness and publish real numbers, converting this round's PROPOSED
  RPO/RTO and PLANNED load labels into measured claims (or honestly
  revised targets).

The delivery commit hash is recorded in the worker's session report (PART 1
— the commit contains exactly the files in §5; this file cannot embed its
own commit hash).
