# P5-W1 — Restore Drill Runbook (`scripts/ops/restore-drill.mjs`)

Owner: lane p5w1 (work order `## P5-W1`, acceptance item "recovery drill
passed"). This is the operational runbook for the restore drill; the
P4-W1 round-2 plan (`docs/reports/security/backup-restore-load-plan.md`)
is the design source — this drill is the vehicle that converts its
"PROPOSED" post-restore verification runbook into an executed procedure.

## What the drill proves (and what it does not)

**Proves** — control-plane state durability of the surfaces durable store
(`JsonlSurfaceStateStore` behind `createSurfacesService`):

1. a full customer journey (enroll → consent → observation → Lab evaluation →
   organization formation → group purchase → offer → commitment → AUTHORIZE →
   PLACE_ORDER with an opaque payment reference) applies through the REAL
   public contract and every applied command is durably appended BEFORE its
   acknowledgement (write-before-ack — the log reaches 10 lines for 10
   applied commands);
2. a snapshot (file copy) of the append-only JSONL log is a valid backup
   (content hash verified on re-read);
3. a torn final line (crash mid-append) is DETECTED, counted and skipped —
   never trusted — and the last intact snapshot still folds to the exact
   reference state;
4. total loss of the live log reopens the service EMPTY (fail-honest: the
   service does not crash and does not invent state) — the failure the
   backup recovers from;
5. restoring the backup (byte-identical copy) and re-opening the service
   reproduces the customer view and the order-lifecycle state EXACTLY
   (deep-equality against the pre-failure reference; `ORDERED` after
   PLACE_ORDER);
6. the restored instance is role-fail-closed (an unconfigured principal is
   refused the operator view — deployment config governs roles, not the
   log) and WRITABLE (a benign consent write appends before its ack and
   survives a further restart).

**Does NOT prove** (ADR-0004 badge — never claimed here):

- live provider recovery, persistent packet forwarding, or payment
  settlement: those remain BLOCKED-ON-OPERATOR (P4-W2; ADR-0004);
- multi-file/segmented restore: the frozen store is a single JSONL file by
  design (P4-W1 round-2 risk #2);
- provider-side state behind adapters: nothing in this drill touches
  provider state (GAP by mandate, `backup-restore-load-plan.md` §5.4).

## How to run

```bash
# dev / drill-as-gate (temp workspace, auto-cleaned):
node --import tsx scripts/ops/restore-drill.mjs

# pinned workspace (kept — what the release gate uses):
node --import tsx scripts/ops/restore-drill.mjs --out .run-logs/ops/drill-workspace

# also write the drill report into the evidence tree:
node --import tsx scripts/ops/restore-drill.mjs \
  --report docs/reports/deployment/evidence/restore-drill-report.json

# all drills (restore drill today; more as ops/drills/ grows):
node scripts/ops/run-drills.mjs
```

Options: `--out <dir>` (workspace, kept), `--report <path>` (copy of the
drill report JSON), `--keep` (preserve a default temp workspace).

## Workspace layout

```
<out>/
  live/adcos-state.jsonl     # the "production" log: seeded → torn → destroyed → restored
  backup/adcos-state.jsonl   # the snapshot (sha256-verified copy)
  fixture/adcos-state.jsonl  # pristine seeded log (staging reuse by the release gate)
  drill-report.json          # timings, checks, verdict
```

## Cadence

- **Every release** (mandatory gate item: `scripts/ops/release-gate.mjs`
  step 3 re-runs the drill fresh and requires verdict PASS).
- **Operator cadence** (production): run monthly, and after any
  state-store-adjacent upgrade (a new desktop release that changes
  `SurfaceState` shapes), against a COPY of production state — never the
  live file. Copy first: `cp ~/.config/adcos-desktop/state/adcos-state.jsonl
  /tmp/adcos-state.copy.jsonl`, then point the drill's phases at the copy
  manually per `backup-restore-load-plan.md` §2.2 (place the backup at the
  `statePath`, construct the service, run the §2.3 verification steps).
- The committed evidence at
  `docs/reports/deployment/evidence/restore-drill-report.json` records the
  sandbox-executed run; re-running overwrites nothing unless `--report`
  points there.

## Pass / fail

- **PASS** = every phase ok: seed applied 10/10, snapshot hash verified,
  torn-tail detected + skipped with exact fold, total-loss honest-empty,
  restore hash-identical, reopen deep-equal, order state `ORDERED`,
  roles fail closed, writable, restart-safe. Exit code 0.
- **FAIL** = any assertion above broke (exit 1). A failure means the
  durability contract changed or regressed — treat as a release blocker.

## Escalation

1. Drill FAIL → re-run once to rule out flake (tempfs hiccups).
2. Still FAIL → capture `drill-report.json` + the workspace paths and open
   an incident per `docs/runbooks/incident-playbook.md` (severity per
   `ops/incident/severity-matrix.md` — a restore-drill failure is SEV-2:
   no data is lost yet, but the recovery guarantee is unproven).
3. Do NOT ship a release while the drill is failing (release gate hard-fails
   on it by construction).
