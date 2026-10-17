# Restore drill (P5-W1) — runbook

**The drill**: `scripts/ops/restore-drill.mjs` — a REAL executable
recovery exercise against the REAL durable store (the public
`createSurfacesService` from `@adcos/surfaces` over the JSONL state log).

## What it proves

1. **Write-before-ack durability**: every applied journey step is already
   in the log before the caller sees success (the store is append-only).
2. **Backup/restore procedure**: snapshot → corrupt → restore → reopen
   yields the EXACT same customer view (sha256 of the view payload).
3. **Replay-on-load**: a NEW service instance over the restored file
   reconstructs resources, organizations, group purchases and order state
   identically (write-before-ack replay, the P2 durability doctrine).

## What it does NOT prove (honest scope)

- **NOT live-provider recovery** — provider/hardware integration is
  BLOCKED-ON-OPERATOR per ADR-0004; no drill may claim it.
- **NOT payment-rail recovery** — payment references are opaque records
  by construction; no live money exists to recover.
- **NOT multi-node consensus** — the product is single-node by design;
  there is no distributed state to restore.

## How to run (station / CI)

```bash
node --import tsx scripts/ops/restore-drill.mjs                # verdict to stdout; exit 0 PASS / 1 FAIL
node --import tsx scripts/ops/restore-drill.mjs --out report.json   # also writes the machine-readable report
node scripts/ops/run-drills.mjs                                # every drill, aggregated
```

The report JSON records: the 13-step journey, snapshot sha256 + bytes +
lines, the corruption class simulated, restore hash match, the reopened
view summary (resource/organization/purchase row ids), phase timings.

## Production procedure (operator, on an end-user machine)

1. **Locate state**: `<userData>/state/adcos-state.jsonl`
   (Linux: `~/.config/ADCOS/state/adcos-state.jsonl`; see
   `ops/environments/matrix.md`).
2. **Snapshot (backup)**: with the app closed (single-instance lock
   released), copy the JSONL to dated storage and record its sha256:
   `sha256sum adcos-state.jsonl > adcos-state.jsonl.sha256`.
3. **Restore**: copy the snapshot back over the live path, verify
   `sha256sum -c`, relaunch the app. The service replays the log on
   load; the view returns exactly.
4. **Verify**: open the product — resources, organizations and group
   purchases render as before (the drill's assertions are the same
   checks, automated).

## Cadence + escalation

- Run the automated drill at every release gate
  (`scripts/ops/release-gate.mjs` step 3) and after any storage-layer
  change.
- A FAILED drill is a release blocker: triage via
  `docs/runbooks/incident-playbook.md` (severity S2 — data-at-rest
  integrity), collect the drill report JSON, do not ship.
- Torn-final-line tolerance: the shipped store's loader skips a torn
  tail (the corruption class the drill simulates) — a restore is still
  the canonical remedy because it also removes junk blocks the loader
  would carry.
