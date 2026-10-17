# P5-W1 Report — Deployment and production readiness

Work order: `spec/work-orders.md` §P5-W1. Base SHA `d4d4436` (P5-W2
merged). Branch `work/p5-w1/deployment-readiness`.

## Execution provenance (honest)

Dispatched as worker packet p5w1 (agents tab, GLM-5.3, Full-Stack;
prompt 13,049 chars server-verified, chat `10e6f7ad`). The platform
generation drought (429/null-commit class) blocked the worker's turn —
same as the recorded P5-W2 precedent. **TL-executed at the integration
station** per the repo's recorded precedent (P2-W1-TL-SLICE
"TL-executed under deadline"; Task 17/18), honestly labeled in
`current-state.json`. If the worker's generation opens later, its output
is reviewed on top of this merge.

## Task P5W1-0 — governance — PROVEN

- `spec/work-orders.md` §P5-W1 extended with the dependency state at
  dispatch (P4-W1 accepted; P4-W2 BLOCKED-ON-OPERATOR per ADR-0004) and
  owned paths.
- `spec/development-state/current-state.json`: frontier
  `["P4-W2","P5-W1"]` (P4-W2 kept FIRST); P5-W1 active entry with the
  drought note.
- Gate: `node scripts/check-project-spec.mjs` → **PASSED** (15 required
  files; 5 locked sections; 12 unique work orders; frontier valid).

## Task P5W1-1 — environment contracts — PROVEN

- `ops/environments/README.md` (contract law + scope truth: the
  substrate `config/` tree is NOT consumed by the shipped product),
  `ops/environments/contracts.json` (10 enumerated inputs, typed/owned/
  sourced; the single secret — release-publishing PAT — declares its
  env channel), `ops/environments/matrix.md` (dev/staging/production
  bindings-differ-not-code-flags law + credentials isolation section).
- `scripts/ops/check-secrets.mjs`: **CLEAN** on the tracked tree (gate
  step 2).

## Task P5W1-2 — rollback + restore drill — PROVEN (run for real)

- `scripts/ops/restore-drill.mjs` — REAL run against the REAL
  `createSurfacesService` over a temp JSONL:
  - 13-step journey (enroll → consent → observe → Lab eval → founding →
    purchase → offer → commitment → order lifecycle to RECONCILED with
    an opaque payment reference).
  - Snapshot 23,342 B / 13 lines, sha256 recorded; corruption simulated
    (torn final line + junk block); restore → sha256 **EXACT MATCH**;
    reopen through a NEW service instance → customer view sha256
    **EXACT MATCH**; row-level parity: resources `[res-drill-1]`,
    organizations `[org-drill]`, groupPurchases `[req-drill]`;
    durability stats parity (snapshots equal, tornLines 0).
  - Verdict **PASS**, totalMs 13. (One vacuous assertion
    `lastWriteSize` was caught and replaced with the real
    `SurfaceStoreStats` shape — honest test law.)
- `ops/drills/restore-drill.md` (runbook + production procedure +
  honest scope: control-plane durability only, NOT live-provider
  recovery), `ops/drills/rollback.md` (release pin-back + state
  compatibility law + never-hand-edit), `scripts/ops/run-drills.mjs`
  (aggregator, verdict PASS).

## Task P5W1-3 — monitoring — PROVEN

- `ops/monitoring/health-contracts.md` (per-surface HEALTHY tables +
  UNKNOWN/STALE/DEGRADED law), `ops/monitoring/alerts.md` (A1–A11
  catalog with severities and runbook cross-links + honest limits).
- `scripts/ops/health-probe.mjs` — REAL run on a seeded fixture:
  **HEALTHY** (file exists; 1 line; 0 bad lines; rehydrates through the
  real service; view read + durability stats; read-only by
  construction).

## Task P5W1-4 — incident/support, retention/privacy, cost bounds — PROVEN

- `ops/incident/README.md` + `ops/incident/severity-matrix.md` (S1–S3 +
  classification rules + postmortem template) +
  `docs/runbooks/incident-playbook.md` (collect → mitigate → verify →
  communicate → feed-the-gates-back).
- `ops/retention/README.md`: what the JSONL contains (journey events +
  opaque references only — verified against the store implementation),
  where it lives, **delete-the-file = full-erasure claim verified**,
  backups inherit the contract, honest limits.
- `ops/costs/README.md`: measured (deb 80,365,602 B; AppImage
  116,792,135 B; web bundle 226.48 kB; GitHub-hosted distribution),
  ESTIMATE-labeled (state growth ~1.8 KB/event from the drill fixture),
  UNKNOWN-labeled (live provider/rail/hardware — BLOCKED-ON-OPERATOR).

## Task P5W1-5 — onboarding runbooks — PROVEN

- `docs/runbooks/developer-onboarding.md` (clean clone → every gate,
  real commands), `docs/runbooks/operator-onboarding.md` (install +
  verify + state + health + rollback + the pending ADR-0004 decision),
  `docs/runbooks/release-gate.md` (the 14-step checklist).

## Task P5W1-6 — staging & release gate — PROVEN (run for real)

- `scripts/ops/release-gate.mjs` — the executable checklist. REAL RUN
  (2026-10-17T10:2xZ, station):
  1–11 **PASS** (spec checker; secrets CLEAN; restore drill PASS;
  health probe HEALTHY; architecture 0/0/0; product-web tsc+tests;
  desktop tsc+battery 3/3; lint 0 errors; vite build 27 modules).
- **Step 12 — staging through the REAL UI — PASS** via
  `scripts/ops/staging-smoke.mjs` (built for this work order): REAL
  Electron app (dev tree, `out/main` + `out/renderer`) under Xvfb with
  CDP; window title `ADCOS — Connectivity OS`; 7-panel nav renders;
  ADR-0004 badge present; bridge `session` round-trip ok
  (`ada@local`, customer role, persistence stats); Resources panel
  renders the seeded row; a NEW enroll through the REAL IPC bridge
  applied; staging state file **grew 426 → 1123 B** (write-before-ack
  through the app). Honest scope noted in the report JSON: dev-tree
  app, not the packaged asar (the P5-W2 smoke covered the asar).
  The smoke loop found and fixed TWO of its own harness defects during
  bring-up (leaked app processes on a fixed CDP port; strict title
  assertion) — recorded here as evidence the loop is real.
- Steps 13–14 (packaging + anonymous-download verification) are
  **PENDING-station by design** — they apply when cutting a NEW release.
  For THIS work order their substance is already evidenced: the current
  release `adcos-desktop-v1.0.0` assets (deb/AppImage/SHA256SUMS/
  INSTALL) were verified **HTTP 200 anonymous** today at this station.

## Task P5W1-7 — gates — PROVEN

Full `release-gate.mjs` verdict: **PASS, 0 fails** (transcripts above).
No new managed modules (ops tree is non-managed paths by scope law) —
architecture check baseline untouched: 0/0/0.

## Honest limitations (GAPs, not hidden)

- The staging smoke runs the **dev tree** (`out/main`), not a packaged
  `.deb`/asar — the packaged-app smoke remains the P5-W2 evidence
  class; the release gate wires both.
- The drought-blocked worker session was not able to independently
  re-derive this lane; the TL-executed provenance is recorded instead.
- Live-provider deployment readiness is BLOCKED-ON-OPERATOR (ADR-0004):
  documented as the blocked remainder in every artifact — never
  claimed. Serverless control-plane hosting is not evidence of
  persistent packet forwarding deployment.
- Retention/erasure claims verified against the current single-file
  JSONL store; any future store change re-opens
  `ops/retention/README.md`.

## File manifest

```
ops/environments/README.md            ops/monitoring/health-contracts.md
ops/environments/contracts.json      ops/monitoring/alerts.md
ops/environments/matrix.md           ops/retention/README.md
ops/drills/restore-drill.md          ops/costs/README.md
ops/drills/rollback.md               ops/incident/README.md
scripts/ops/check-secrets.mjs        ops/incident/severity-matrix.md
scripts/ops/restore-drill.mjs        docs/runbooks/developer-onboarding.md
scripts/ops/run-drills.mjs           docs/runbooks/operator-onboarding.md
scripts/ops/health-probe.mjs         docs/runbooks/release-gate.md
scripts/ops/staging-smoke.mjs        docs/runbooks/incident-playbook.md
scripts/ops/release-gate.mjs         docs/reports/deployment/p5w1-report.md
spec/work-orders.md (P5-W1 section only)
spec/development-state/current-state.json (frontier + active entry)
```
