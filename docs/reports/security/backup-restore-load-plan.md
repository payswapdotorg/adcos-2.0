# ADCOS 2.0 Backup / Restore / Load Plan — P4-W1 Round 2

Status: COMMITTED (P4-W1 round-2 scope). This plan covers the durable store
seams the FROZEN public contracts expose, the backup/restore procedures for
each, post-restore verification steps, RPO/RTO targets, and a load-test
plan. Every claim is labeled:

- **PROVEN** — executed in this round by a battery test (file + test name
  cited; real exit codes recorded in `docs/reports/security/round-2-report.md`);
- **PARTIAL** — the mechanics exist and were partially exercised, but part
  of the procedure remains unexecuted;
- **PLANNED** — designed, not executed (round-3 or operator-host work);
- **PROPOSED** — a TARGET only. **No number in this document was measured.**
  RPO/RTO figures are targets to be validated by the round-3 load program
  and the P5-W1 restore drill; none has been observed in a benchmark.

---

## 1. Durable store seams the contracts expose

| Seam | Contract entry                                                                                                                   | Role                                                                                                                                                     | Format                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S1   | `JsonlSurfaceStateStore` (exported from `packages/surfaces/src/contract.ts`; injected by `createSurfacesService({ statePath })`) | Surfaces durable state (consents, resources, observations, memberships, mandates, requests, offers, commitments, opportunities, orders)                  | Append-only JSONL; one FULL state snapshot per applied command; write-before-ack |
| S2   | `JsonlInboxStore` (exported from `packages/coordination/src/contract.ts`)                                                        | Inbox AND outbox message store (lifecycle snapshots per message id; same-id append = transition; fold = last snapshot wins at first-appearance position) | Append-only JSONL; write-before-ack                                              |

Both stores are single-file, append-only, never rewritten in place, with
torn-tail detection (counted and skipped, never trusted). There is no
compaction, no segmentation, and no multi-file layout on the frozen surface
(see §5 risks).

---

## 2. S1 — Surfaces state log (`JsonlSurfaceStateStore`)

### 2.1 Backup procedure

1. Quiesce optional (NOT required for crash-consistency): because appends
   are atomic line writes, a copy taken during live traffic contains a
   complete prefix and at worst one torn final line.
2. Copy the JSONL file (e.g. `cp state.jsonl state.jsonl.bak` or any
   filesystem/VOLUME snapshot of the file).
3. Keep the copy adjacent to deployment credentials policy (the log contains
   NO provider secrets — battery-proven, see §2.3; it does contain tenant
   business data and must be access-controlled accordingly).

Label: **PARTIAL** — the interrupted-copy SAFETY property is PROVEN (a
backup that stops mid-line is exactly the torn-tail case:
`test/security/replay-partial-failure.test.ts` "crash-during-persist: a
torn final line is reported and skipped — the store folds the last intact
snapshot and keeps working"); the operational copy step itself was not
executed as a scripted runbook in this round (round-3: script it).

### 2.2 Restore procedure

1. Place the backup file at the `statePath` the service was configured with.
2. Construct the service over it: `createSurfacesService({ statePath, now,
operatorPrincipals, developerPrincipals })` — the constructor's store
   re-reads and folds the log (last parseable, correctly-shaped snapshot
   wins).
3. Do NOT attempt log surgery: history is never rewritten in place; torn or
   corrupt lines are counted (`tornLines`) and skipped automatically.

Label: **PROVEN** — restart-over-log executed repeatedly:
`test/security/replay-partial-failure.test.ts` ("commit-then-crash…",
"authorize-then-crash…", "crash-during-persist…", "mandate expiry … ACROSS
the restart") and `test/security/isolation.test.ts` ("views only ever
expose the caller's own rows — and the isolation survives persistence and
restart").

### 2.3 Post-restore verification steps (runbook)

1. `service.durability()` → expect `snapshots >= 1` and `tornLines`
   explained (0 on a clean backup; 1 if the copy raced a live append).
2. `service.getCustomerView(<known principal>)` → spot-check known rows
   (resource share states, organization memberships, group-purchase cards
   with `orderState`).
3. `service.getOperatorView(<configured operator>)` → cross-tenant counts
   (memberships by state, request progress, fleet totals) match the
   pre-restore expectation.
4. `service.getOperatorView(<unconfigured principal>)` → must be REFUSED
   (roles fail closed after restore — proves the deployment config, not the
   log, still governs roles).
5. Issue one benign write (e.g. a consent PAUSE/RESUME on a known resource)
   and confirm `applied: true` plus the updated view — proves the restored
   instance is writable, not just readable.
6. For S2 inboxes (see §3): `store.stats()` → `loaded` equals expected
   message count; `list()` lifecycles match expected states (no budget
   reset).

Label: verification QUERIES **PROVEN** (each step's underlying behavior is
executed by the batteries: durability stats, views, role refusal,
post-restart writes, inbox fold); the assembled runbook itself is
**PROPOSED** (to be drilled end-to-end in P5-W1's restore drill).

### 2.4 RPO / RTO targets (PROPOSED — never measured)

- **RPO target: 0 acknowledged commands.** Rationale (design property, not
  a measurement): every applied command is appended BEFORE its
  acknowledgement (write-before-ack), so an acknowledged command is always
  in the log; at most the single in-flight unacknowledged command is lost
  at a crash — and even a torn in-flight line is detected and skipped
  (PROVEN, torn-tail battery). The operator must still choose a
  file-system/fsync policy that honors this target on real hardware.
- **RTO target: single-digit seconds** for logs within the round-3
  load-plan size envelope (restart = one constructor call: re-read + fold,
  single pass over the log). NOT measured; sized by the round-3 scenario
  L5 (§4) before any claim is recorded.

---

## 3. S2 — Coordination inbox/outbox log (`JsonlInboxStore`)

### 3.1 Backup procedure

Same as S1 §2.1 (append-only single file → prefix-consistent copy).
Label: **PARTIAL** (same reasoning; torn-tail safety PROVEN by the merged
P2-W2 store tests and re-proven for the fold semantics in
`test/security/replay-partial-failure.test.ts`).

### 3.2 Restore procedure

1. Place the backup at the store path.
2. `new JsonlInboxStore(path)` — the constructor reloads and folds
   snapshots by id (last intact snapshot per message id wins, position =
   first appearance); `reload()` re-folds at any time (idempotent; models a
   process restart).
3. For outbox role: hand the restored store to `OutboxSender`/endpoint
   construction as in the merged two-process harness.

Label: **PROVEN** — `test/security/replay-partial-failure.test.ts` "a
FAILED attempt's budget consumption survives reload; exhaustion
dead-letters and the budget never resets" (fold across two restarts); the
merged P2-W2/P3-W1 evidence covers two-process restore over real TCP.

### 3.3 Post-restore verification steps

1. `store.stats()` → `loaded` matches expected distinct message ids;
   `tornLines` explained.
2. `store.list()` → per message: lifecycle state, `attempts` vs
   `maxRetries`, `deadLetterReason` presence — the retry budget and
   dead-letter state must match the pre-restore values (PROVEN: budget
   consumption and dead-letter state survive the fold — battery cited
   above).
3. Attempt `beginProcessing` on a known dead-lettered message → must be
   refused with `retry budget exhausted` (proves the restored log does not
   silently resurrect retries). PROVEN — same battery.
4. Envelope replay guard note: replay protection is process-local
   (capacity-bounded FIFO; resets on restart — threat model RPL-3/RPL-4).
   After a restore-from-backup, previously-seen envelope keys are NOT
   remembered: defense against re-delivery rests on the receiver's command
   id-uniqueness, not the guard. This is a documented PARTIAL property of
   the frozen surface.

### 3.4 RPO / RTO targets (PROPOSED — never measured)

- **RPO target: 0 acknowledged messages** (write-before-ack per message
  snapshot; at most one torn in-flight line, which is skipped by design).
- **RTO target: single-digit seconds** within the round-3 size envelope
  (one `reload()` pass). NOT measured.

---

## 4. Load-test plan (PLANNED — not executed in this round)

No load test was executed in round 2 (honesty law: no invented numbers).
The plan below is the round-3 program. Constraints honored: no new
dependencies may be added to this repo (node:test/node built-ins only);
heavier external tooling is listed for the OPERATOR HOST, not the repo.

### 4.1 Scenarios

| ID  | Scenario                                                                                                                                                | What it stresses                                           | Success criteria (correctness gates to assert DURING load)                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Journey command throughput: N principals (10/100/1 000) × full journeys (enroll → consent → observation → lab → formation → purchase → order)           | S1 append path, view assembly                              | Every command result matches the single-principal golden behavior; per-participant views stay isolated                                                      |
| L2  | Commitment interleaving under threshold pressure: 3–10 members interleaving commits, duplicates, withdrawals                                            | Ledger exactly-once accounting under concurrency emulation | Distinct-participant count exact; duplicates refused; committed allocation exact (assert after every batch — same invariants as `budget-negatives.test.ts`) |
| L3  | Envelope validation throughput: 10³–10⁵ envelopes (fresh + replayed + malformed mix) through `validateEnvelope` with the bounded guard                  | B1 gates; guard memory bound                               | Replays always refused; guard `size ≤ maxEntries`; RSS stays bounded                                                                                        |
| L4  | TCP loopback transport: two processes (existing `test/integration` two-process harness pattern), sustained frames with acks, partition/reconnect cycles | Wire protocol, outbox retry budget                         | No frame corruption; dead-letter rates observed; DELIVERED_DUPLICATE semantics hold                                                                         |
| L5  | Restart/fold scaling: build logs of increasing snapshot counts (10³/10⁴/10⁵ lines), measure constructor fold time and restart-to-serving latency        | S1/S2 fold path — the primary scaling risk (§5)            | Fold completes and restores EXACT state (deep-equal against pre-restart view); torn-tail case included                                                      |
| L6  | Abuse floods (bounded-surface legs only): duplicate-id enrollment/offer/request floods + consent griefing loops                                         | Refusal-path stability under abuse                         | Refusal latency stays flat vs flood size; state never multiplies (same assertions as `abuse-collusion.test.ts`)                                             |
| L7  | Distinct-id enrollment flood (gap documentation, not a pass/fail gate): quantify log growth when the unbounded surface is exercised                     | Documents ABU-1 GAP with data                              | Report bytes/command and fold-time growth; no correctness criterion (surface is intentionally unbounded today)                                              |

### 4.2 Metrics to capture

- Per-command and per-envelope latency: p50 / p95 / p99 / max (ms).
- Throughput: commands/sec, envelopes/sec, frames/sec.
- Durability: JSONL bytes per applied command (snapshot amplification
  factor = bytes/command ÷ row-count-normalized state size), log size over
  time, snapshots count.
- Recovery: fold duration and restart-to-serving latency vs snapshot count
  (scenario L5); tornLines handling.
- Memory: process RSS over time (guard bound, view assembly).
- Abuse stability: refusal latency distribution vs flood volume; refusal
  reason stability.

### 4.3 Tooling

- In-repo (no new dependencies): `node --import tsx --test` harness with
  `node:perf_hooks` (`performance.now()`) instrumentation — same public
  contract entries as the batteries; the existing two-process TCP pattern
  from `test/integration/two-process-restart.test.ts` for L4.
- Operator host (out-of-repo, future): `k6` or `autocannon` for sustained
  TCP/HTTP-style load against a deployed gateway; system telemetry
  (`/proc`, `pidstat`) for RSS/CPU. No such tooling may be added to this
  repository (frozen dependency policy).

### 4.4 Execution label

**PLANNED** — none of L1–L7 has been executed; no latency, throughput,
byte-growth or fold-time number exists for these seams. Round-3 deliverable:
executed scenarios + a report with real numbers, replacing this section's
PLANNED labels.

---

## 5. Risks and known limits (labeled)

1. **Snapshot amplification (S1)** — every applied command appends a FULL
   state snapshot: per-write cost grows with state size, cumulative log
   grows quadratically in command count. PROVEN-as-design (observable from
   the store contract; quantified only by L5/L7 in round 3). Mitigation
   path (round-3 proposal R-5): segmented/compacted snapshots — a
   contract-shape change, TL-serialized.
2. **Single-file logs** — no rotation/segmentation on the frozen surface;
   backup copies grow with the log. PARTIAL (design property; compaction
   PLANNED).
3. **Process-local replay guard** — restores from backup do NOT restore
   replay-guard memory (threat model RPL-3/RPL-4). PARTIAL (durable
   id-uniqueness covers surfaces commands; a durable envelope replay ledger
   is round-3 proposal R-2).
4. **No live-provider restore drill** — provider-side state is behind
   adapters and BLOCKED-ON-OPERATOR (ADR-0001/ADR-0004); nothing here
   claims provider-state restore. GAP (by mandate, not by omission).
5. **RPO/RTO are targets** — every figure in §2.4/§3.4 is PROPOSED; the
   P5-W1 restore drill and round-3 L5 are the vehicles that may convert
   them into measured claims.
