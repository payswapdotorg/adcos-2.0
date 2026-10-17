# ADCOS alert catalog (P5-W1)

Severity ladder + symptom → runbook cross-links. Local-first product:
"alerting" is the operator noticing (or the release gate catching) a
condition below and acting per the linked runbook.

| # | Alert | Sev | Symptom | Action (runbook) |
| --- | --- | --- | --- | --- |
| A1 | State file unparseable | S2 | `health-probe --state` reports non-JSONL lines / rehydration failure | `ops/drills/restore-drill.md` production procedure (restore snapshot); if no snapshot: `docs/runbooks/incident-playbook.md` |
| A2 | State file missing | S2 | probe: file absent | If a snapshot exists → restore. If not: the product starts a fresh log (data loss — file incident, collect what exists) |
| A3 | Restore drill FAIL | S1 | `run-drills.mjs` non-zero at release gate | Release blocker — triage per incident playbook; do not ship |
| A4 | Renderer fails to load | S2 | blank/window-error on launch | binary rollback (`ops/drills/rollback.md`); if state untouched, no snapshot needed |
| A5 | IPC bridge unresponsive | S2 | `session` bridge request errors/timeouts | binary rollback; verify store health with probe; file incident |
| A6 | Release asset unreachable anonymously | S1 | gate step: HTTP != 200 without auth | Release blocker — re-publish assets; verify GitHub Release state |
| A7 | SHA256 mismatch | S1 | gate step: hash differs from SHA256SUMS | Release blocker — re-publish; treat as integrity incident |
| A8 | zcode entries in shipped archive | S1 | asar listing shows zcode | Release blocker — product lock violated; rebuild |
| A9 | Secret literal in tracked tree | S1 | `check-secrets.mjs` fails | Release blocker — remove; rotate the exposed credential (it is burned); re-run |
| A10 | Single-instance lock stuck | S3 | second launch quits immediately though no window | stale lock after crash; clear per OS app-data; verify state file health after |
| A11 | main.log shows repeated crash-pad lines | S3 | append-only log grows with crash entries | collect diagnostics per incident playbook; check store health; consider rollback |

Severity meaning (full matrix in `ops/incident/severity-matrix.md`):
S1 release/launch blocker, S2 user-visible fault with a procedure, S3
degraded-but-usable. All severities escalate to the operator via the
intake channel (GitHub issues — see `ops/incident/README.md`).

## Honest limits

- No automated watchdog exists INSIDE the product (local desktop app;
  by construction). The executable checks run at: release gate (A3,
  A6–A9), operator-initiated probes (A1, A2), operator observation
  (A4, A5, A10, A11).
- Live-provider alerts DO NOT EXIST yet — BLOCKED-ON-OPERATOR
  (ADR-0004); any provider alerting would be fabricated until the
  operator selects the live integration.
