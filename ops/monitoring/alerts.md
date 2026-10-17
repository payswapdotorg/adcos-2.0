# P5-W1 — Alert Catalog (`ops/monitoring/alerts.md`)

Owner: lane p5w1 (work order `## P5-W1`). Health semantics:
[`health-contracts.md`](./health-contracts.md). Severity definitions:
[`ops/incident/severity-matrix.md`](../incident/severity-matrix.md).

**Honest scope note (single-node desktop product):** monitoring is
LOCAL-FIRST — logs + OS-level signals + the health probe. No cluster
telemetry exists or is claimed; alerts below fire from operator- or
station-run checks (probe, gate, release channel check), not from a
always-on monitoring service. SEV-4/5 are user-visible-first.

| ID | Severity | Symptom | Detection | Runbook |
| --- | --- | --- | --- | --- |
| A-1 | SEV-1 | State file UNHEALTHY: zero foldable snapshots / unreadable | health probe exit 1 | [`ops/drills/restore-drill.md`](../drills/restore-drill.md) — restore from the latest snapshot copy; then incident per playbook |
| A-2 | SEV-1 | Restore drill FAIL at release time | release gate step 3 (non-zero exit) | [`docs/runbooks/release-gate.md`](../../docs/runbooks/release-gate.md) — release is BLOCKED until drill passes; escalate |
| A-3 | SEV-2 | State DEGRADED: torn tail lines detected (skipped; service self-heals) | health probe exit 2 (`DEGRADED` verdict) | [`ops/monitoring/health-contracts.md`](./health-contracts.md) §store-plane — snapshot the file, run the probe again; investigate the writer crash that tore the line |
| A-4 | SEV-2 | Fleet-wide STALE observations (all resources STALE after a fresh observation round) | product panels; probe does not assert this (domain-level state) | re-run observations; if the observation path itself is broken, incident SEV-2 |
| A-5 | SEV-2 | Secrets gate FAIL (a tracked file matched a secret pattern / 0600 violation) | `node scripts/ops/check-secrets.mjs` exit 1 | [`docs/runbooks/release-gate.md`](../../docs/runbooks/release-gate.md) — rotate the exposed credential FIRST, then remove from repo; never just delete the string |
| A-6 | SEV-3 | Release assets not anonymously reachable (HTTP != 200) | `node --import tsx scripts/ops/health-probe.mjs --release-channel` | re-run; if GitHub is down, wait; if the asset is gone, re-publish the release per release-gate runbook |
| A-7 | SEV-3 | App crash loop: single-instance lock flapping / window never appears | operator-visible; `pgrep -af adcos-desktop`; `main.log` | rollback per [`ops/drills/rollback.md`](../drills/rollback.md) — pin to previous release version |
| A-8 | SEV-3 | Spec checker / architecture:check red at station | gate step 1 | fix the governance drift BEFORE any release work continues |
| A-9 | SEV-4 | A journey command is REFUSED with a domain reason (mandate expired, duplicate id, threshold) | product error banner shows `label: reason` | NOT an outage — the domain refused honestly; verify the precondition, retry only when legitimately satisfiable |
| A-10 | SEV-4 | User reports data "missing" after upgrade | GitHub issue | probe the state file; run the §2.3 verification steps (backup/restore plan); check whether the app folded an older snapshot |
| A-11 | SEV-5 | UNKNOWN resource status shown | product panel chips | benign by INVARIANTS #5 — record an observation; never treated as failure |

## UNKNOWN / STALE / DEGRADED reading rules (cross-ref)

- UNKNOWN = absence of observation — do NOT page anyone.
- STALE = evidence age violation — refresh evidence before concluding.
- DEGRADED = partial capability — distinct from FAILED; never masked.
- Any live-provider condition is UNKNOWN by construction
  (BLOCKED-ON-OPERATOR, ADR-0004) — no alert may assert provider health
  or provider failure from a timeout.

## Escalation path

1. Operator (GitHub issues) → triage per severity matrix.
2. SEV-1/SEV-2 → incident playbook
   ([`docs/runbooks/incident-playbook.md`](../../docs/runbooks/incident-playbook.md));
   escalate to the operator decision-channel for anything touching
   provider/payment scope (ADR-0004 lane).
3. Every SEV-1/SEV-2 closes with a postmortem entry
   (template in the incident playbook).
