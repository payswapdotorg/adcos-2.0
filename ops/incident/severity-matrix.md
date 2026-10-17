# Incident severity matrix (P5-W1)

| Sev | Definition | Examples (alert ids) | Response expectation | Escalation |
| --- | --- | --- | --- | --- |
| **S1** | Release or launch blocker; integrity of distribution or state audit trail at risk | restore-drill FAIL (A3); release asset unreachable (A6); SHA256 mismatch (A7); zcode in archive (A8); secret in tree (A9) | Release gate holds; fix before any ship | Operator decision required to proceed |
| **S2** | User-visible fault with a working procedure | state unparseable (A1); state missing (A2); renderer fail (A4); IPC unresponsive (A5) | Runbook procedure same day where possible | Issue on the repo; operator reviews |
| **S3** | Degraded but usable | stale single-instance lock (A10); repeated crash-pad lines (A11) | Next maintenance window | Issue on the repo |

## Classification rules

1. **Data-at-rest integrity is S2 minimum, S1 if the audit trail
   (append-only log) is at risk** — the log is the product's honesty
   spine (rollback doctrine).
2. **Distribution integrity is always S1** — a tampered or broken
   release channel compromises every future install.
3. **Honesty violations are S1** — anything that would make the product
   claim a state it is not in (masked UNKNOWN/STALE/DEGRADED, fabricated
   provider success) is a release blocker by INVARIANTS #5 and ADR-0004.
4. When in doubt, classify UP — never down.

## Postmortem template (S1/S2)

```
Title / Date / Severity / Discovered-by (gate step, alert id, or issue #)
Impact: what a user could/could not do; for how long; how many known.
Root cause: the mechanism, verified (not guessed).
Timeline: discovery → triage → mitigation (restore/rollback/fix) → verification.
Evidence: probe/drill report JSONs, release-gate output, asar listing.
Action items: linked issues with owners; each item says which check
  (gate step / alert / drill) would have caught it earlier.
Honesty note: what this incident almost made us claim that was not true.
```
