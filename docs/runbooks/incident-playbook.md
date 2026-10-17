# P5-W1 — Incident Playbook (runbook)

Cross-refs: severity [`ops/incident/severity-matrix.md`](../../ops/incident/severity-matrix.md),
intake/support [`ops/incident/README.md`](../../ops/incident/README.md),
alerts [`ops/monitoring/alerts.md`](../../ops/monitoring/alerts.md).

## 1. Intake & triage

1. A GitHub issue arrives (the intake surface that exists today).
2. Label: `incident` or `support`; severity `sev-1..sev-5` within one
   business day (definitions in the matrix).
3. Classify the plane:
   - **state plane** (durable JSONL) → probe first (below);
   - **app plane** (Electron window/process) → rollback doctrine if
     broken, repro next;
   - **release channel** → probe `--release-channel`;
   - **domain refusal** → answer with the reason (A-9 class, not an
     outage);
   - **provider/payment-shaped** → label `adr-0004-scope`, park as
     BLOCKED-ON-OPERATOR, escalate (never fake).

## 2. First diagnostic commands (real, in order)

```bash
# state plane verdict (machine-readable; exit 0/2/1 = HEALTHY/DEGRADED/UNHEALTHY):
node --import tsx scripts/ops/health-probe.mjs --state ~/.config/adcos-desktop/state/adcos-state.jsonl
# or the whole installed profile:
node --import tsx scripts/ops/health-probe.mjs --desktop ~/.config/adcos-desktop

# size/shape without shipping data:
wc -c -l ~/.config/adcos-desktop/state/adcos-state.jsonl
tail -n 50 ~/.config/adcos-desktop/main.log 2>/dev/null

# process plane:
pgrep -af adcos-desktop
```

If the reporter must send data: a redacted excerpt (probe output + last
line with principals masked) — full JSONL only when reproduction is
blocked (see intake/support ops for the secret-safe procedure).

## 3. Mitigations

### State plane

- `UNHEALTHY` (A-1) → restore from the newest snapshot copy:
  `cp <snapshot> ~/.config/adcos-desktop/state/adcos-state.jsonl`, then
  probe again, then run the §2.3 verification steps (backup/restore plan)
  — one benign write, read it back. SEV-1, postmortem.
- `DEGRADED` (A-3) → snapshot the file NOW (evidence), then let the fold
  self-heal; find the writer crash that tore the line (check main.log
  around the incident time). SEV-2 while unexplained.

### App plane

- Crash loop / blank window (A-7) → rollback: pin the previous release
  version per `ops/drills/rollback.md` (deb downgrade or old AppImage).
  Back up state BEFORE launching the old version.

### Release channel

- Assets unreachable (A-6) → re-probe; if the release is genuinely
  broken, re-run the release gate and re-publish.

### Governance plane

- Spec checker or architecture:check red (A-8) → stop release work; fix
  the drift; re-run gates.

## 4. Escalation to the operator

Escalate (issue comment + the operator decision channel) when:
- the incident is in the ADR-0004 lane (provider/payment scope) — record
  BLOCKED-ON-OPERATOR, park;
- a fix needs a business decision (pricing, rail selection, data-sharing
  policy);
- SEV-1 with no snapshot available (accept-and-recover vs
  reset-and-re-enroll decision is the operator's, with the user).

## 5. Postmortem template (SEV-1/SEV-2)

```markdown
## Postmortem: <issue#> — <one-line>
- Severity / plane: SEV-x / <state|app|release|governance>
- Timeline (UTC): detected → acknowledged → mitigated → closed
- Impact: <users/machines/state rows affected — exact numbers or "unknown, why">
- Root cause: <technical cause, file/line where possible>
- What caught it: <probe / drill / gate / user report>
- What missed it and why: <honest gap>
- Prevention (wired where?): <one concrete item + the runbook/gate/check it landed in>
```

## 6. Support ops quick reference

- State file locations per platform: `ops/incident/README.md`.
- Diagnostics without secrets: probe output + redacted last line (the
  JSONL has NO credentials by construction, but it IS tenant business
  data — full files travel privately, never pasted).
- The ADR-0004 badge means: opaque references only, no live rail, live
  money movement BLOCKED-ON-OPERATOR. A user asking "when does payment
  settle?" gets the honest answer: never claimed, rail selection pending
  with the operator.
