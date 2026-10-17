# P5-W1 — Incident Severity Matrix

Cross-refs: [`ops/incident/README.md`](./README.md) (intake/support ops),
[`docs/runbooks/incident-playbook.md`](../../docs/runbooks/incident-playbook.md)
(response expectations), [`ops/monitoring/alerts.md`](../monitoring/alerts.md)
(alert IDs).

| Severity | Definition (product-honest) | Examples | Response expectation (best effort, single maintainer lane) |
| --- | --- | --- | --- |
| **SEV-1** | Confirmed data loss or a broken recovery guarantee: the durable state is unrecoverable, or the restore drill fails at release time | state file UNHEALTHY with no snapshot; drill FAIL blocks release (A-1, A-2) | acknowledge same day; mitigation guidance (restore from snapshot) immediately; fix next release; postmortem required |
| **SEV-2** | Core journey broken for users OR a security gate red: enroll/consent/purchase/state-fold broken, or the secrets gate fails | torn-tail DEGRADED spreading; secrets pattern committed (A-3, A-5); mandate-gating regression | acknowledge within 1 business day; rollback decision per `ops/drills/rollback.md` (pin previous release); fix within the next release; postmortem required |
| **SEV-3** | Degraded but usable: release channel unreachable, app crash-loop on specific machines, station gates red outside release window | A-6, A-7, A-8 | acknowledge within 2 business days; fix opportunistically; no postmortem (a release-note entry suffices) |
| **SEV-4** | Single-user anomaly with a domain-honest explanation (refusals, UNKNOWN/STALE displays, "missing data" that folds correctly) | A-9, A-10 | triage weekly; answer with the domain reason (a REFUSED outcome is an answer, not an outage) |
| **SEV-5** | Informational/benign by design (UNKNOWN status chips, first-run FRESH states) | A-11 | no action; link the INVARIANTS #5 reading rule |

## Honesty rules baked into severity

- A domain REFUSAL (mandate expired, duplicate id, threshold unmet) is
  never an incident by itself — the system worked. Only a WRONG refusal
  (isolation broken, gate flapping) is SEV-2.
- UNKNOWN is never evidence of failure (INVARIANTS #5): no alert escalates
  on UNKNOWN alone.
- Provider/payment-shaped reports are ADR-0004-lane: parked as
  BLOCKED-ON-OPERATOR, not triaged as product bugs, never "fixed" with
  fake rails.
- Response expectations are stated as best-effort for the current
  single-maintainer reality — they are targets, not SLAs. No 24/7 on-call
  is claimed (single-node local product; there is no service to page).
