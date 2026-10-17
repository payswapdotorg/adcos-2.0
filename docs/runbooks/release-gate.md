# P5-W1 — Release Gate Runbook (THE checklist)

Owner: lane p5w1 (work order `## P5-W1`). Executable runner:
`scripts/ops/release-gate.mjs` (script-checked where possible; every item
below maps to a gate step or a human item marked accordingly).

**Law:** a release of the ADCOS Desktop product ships ONLY when every
HARD item below is green. PENDING-station items (things the current
station cannot execute) are REPORTED with the exact command — never
silently passed, never faked.

## The checklist

| # | Item | Kind | Pass condition |
| --- | --- | --- | --- |
| 1 | Spec checker | script | `node scripts/check-project-spec.mjs` → exit 0 |
| 2 | Architecture baseline | script | `node scripts/architecture/architecture-check.mjs check` → violations 0, NEW violations 0 |
| 3 | Credentials isolation (secrets gate) | script | `node scripts/ops/check-secrets.mjs` → exit 0 |
| 4 | Product lint | script | `npx oxlint packages/product-web apps/desktop-adcos` → 0 errors |
| 5 | Product typechecks | script | `tsc --noEmit` in product-web AND desktop-adcos → exit 0 |
| 6 | Desktop battery | script | `node --import tsx --test test/router.test.ts` (in apps/desktop-adcos) → 3/3 |
| 7 | Restore drill FRESH pass | script | `node --import tsx scripts/ops/restore-drill.mjs --out <workspace>` → verdict PASS, exit 0 |
| 8 | Health probe on the drill fixture | script | `node --import tsx scripts/ops/health-probe.mjs --state <workspace>/fixture/adcos-state.jsonl` → HEALTHY (exit 0) |
| 9 | Staging through the REAL UI | script | `node --import tsx scripts/ops/release-gate.mjs` step 5: built product-web served over loopback under headless chromium; identity + resources + group-purchase panels render; one REAL bridge round-trip (enroll) persists to the staging state file |
| 10 | Renderer build current | script | `packages/product-web/dist` rebuilt during the gate when stale (vite build) |
| 11 | Assets built + SHA256SUMS | human/station | `pnpm package:linux` in apps/desktop-adcos; `sha256sum` over deb + AppImage → SHA256SUMS.md committed to the release |
| 12 | Anonymous download verification | script/human | probe `--release-channel <tag>` after publish → all assets HTTP 200 (no credentials) |
| 13 | current-state.json updated | human | frontier/active/completed entries reflect this release; evidence arrays cite real transcripts |
| 14 | Work-order evidence recorded | human | `spec/work-orders.md` lane evidence + `docs/reports/deployment/` report committed |

## Running the gate (one command, real transcripts)

```bash
node --import tsx scripts/ops/release-gate.mjs \
  [--workspace .run-logs/ops/gate-workspace] \
  [--report docs/reports/deployment/evidence/release-gate-report.json]
```

- Steps 1–10 run script-checked (spawned, exit codes recorded, transcript
  to stdout + report JSON).
- Any hard-fail → gate exits non-zero with the failing step named.
- PENDING-station items are reported as `PENDING-station` entries with the
  exact command the TL/station must run (e.g. packaging on a machine with
  electron-builder caches; anonymous download verification AFTER publish;
  real-GPU smoke on the operator's Ubuntu machine — never faked here).

## Post-publish verification (in order)

1. `node --import tsx scripts/ops/health-probe.mjs --release-channel <tag>`
   → every asset anonymously reachable (HTTP 200).
2. Operator installs from the release (operator runbook §1) and runs the
   first-run checks (§2) + probe (§5).
3. Record the release evidence in current-state.json + the deployment
   report (items 13–14).

## Honesty rules (binding)

- Staging evidence is UI/bridge/durability evidence ONLY — it is never
  forwarding/provider/payment evidence (work-order acceptance law:
  "Serverless control-plane hosting is not evidence that persistent
  packet forwarding is deployed"; ADR-0004 badge carries through).
- A PENDING-station item never blocks a station-side release verdict, but
  it MUST appear in the gate report and the release notes as pending, with
  the exact command.
- No fabricated transcripts: the gate writes what actually ran.
