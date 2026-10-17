# Incident playbook (P5-W1)

Step-by-step for the on-... operator (there is no on-call — see
`ops/incident/README.md` honest limits).

## 0. Classify

Use `ops/incident/severity-matrix.md`. The alert ids below reference
`ops/monitoring/alerts.md`.

## 1. Collect diagnostics (never ship secrets)

```bash
# store health (read-only, never issues commands):
node --import tsx scripts/ops/health-probe.mjs --state <state.jsonl>

# state + logs the user sends (or you copy from the machine):
<userData>/state/adcos-state.jsonl     # journey events; opaque refs only (ADR-0004)
<userData>/main.log                    # append-only crash-pad hygiene lines
```

The probe verdict + the last good known operation bracket the incident
window. If the state file is DEGRADED/DOWN, stop collecting and go to
step 2-restore.

## 2. Mitigate — choose the axis

- **Store fault (A1/A2)** → restore procedure in
  `ops/drills/restore-drill.md` (production section): snapshot back over
  the live path, verify sha256, relaunch. NEVER hand-edit the log.
- **Binary fault (A4/A5)** → rollback procedure in
  `ops/drills/rollback.md`: reinstall the previous release deb (or run
  the previous AppImage). State survives; snapshot only if the newer
  version had already appended events (see state-compatibility law
  there).
- **Distribution fault (A6/A7/A8)** → release gate re-run
  (`scripts/ops/release-gate.mjs`) after re-publishing assets; treat
  SHA256 mismatch as a potential integrity incident — rotate anything
  that touched the artifacts if tampering is suspected.
- **Secret exposure (A9)** → the credential is burned: rotate it at its
  provider, remove from the tree, re-run `check-secrets.mjs`. Document
  in the postmortem what wrote it there.

## 3. Verify

- Re-run the health probe: verdict HEALTHY.
- Re-run the restore drill (proves the storage layer still honors
  write-before-ack + replay).
- For binary rollbacks: the P5-W2 smoke class (window opens, panels
  render, a bridge round-trip applies).

## 4. Communicate

- Open/update the GitHub issue with: severity, impact, timeline,
  mitigation taken, and what the user should do (reinstall link with
  SHA256SUMS, or nothing if state-side).
- S1s get a postmortem (template in `severity-matrix.md`) attached to
  the issue before it closes.

## 5. Feed the gates back

Every postmortem answers: **which check would have caught this
earlier?** If none — add one to `scripts/ops/release-gate.mjs` or the
alert catalog. That answer is the incident's real deliverable.
