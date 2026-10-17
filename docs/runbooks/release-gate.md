# Release gate (P5-W1)

The checklist every release passes before it is announced. Human steps
are marked; the rest are script-checked by
`scripts/ops/release-gate.mjs` (exit non-zero = gate FAIL).

## Gate steps

| # | Step | How | Hard-fail? |
| --- | --- | --- | --- |
| 1 | Spec checker | `node scripts/check-project-spec.mjs` | YES |
| 2 | Secrets check (credentials isolation) | `node scripts/ops/check-secrets.mjs` | YES |
| 3 | Restore drill (recovery drill) | `node scripts/ops/run-drills.mjs` — verdict PASS with real transcript | YES |
| 4 | Health probe on the drill fixture | release-gate runs `health-probe.mjs --fixture` — HEALTHY | YES |
| 5 | Architecture check (0 NEW violations) | `node scripts/architecture/architecture-check.mjs check` | YES |
| 6 | Product-web tsc + tests | `pnpm --filter @adcos/product-web exec tsc --noEmit -p tsconfig.json` + `test` | YES |
| 7 | Desktop tsc + battery | `pnpm --filter @adcos/desktop-app exec tsc --noEmit -p tsconfig.host.json` + `test` | YES |
| 8 | Lint | `pnpm lint` (0 errors on changed files) | YES |
| 9 | Product build | `pnpm --filter @adcos/product-web build` (vite) | YES |
| 10 | **Staging through the REAL UI** | release-gate headless staging item (below) | PENDING-station allowed (honest) |
| 11 | **Packaged artifacts** (deb + AppImage + SHA256SUMS) | electron-builder at the station; dpkg-deb -I + asar list verified | PENDING-station allowed |
| 12 | **Anonymous download verification** | curl (no auth) → HTTP 200 on every asset; sha256 exact match | HUMAN/station |
| 13 | State truth updated | `spec/development-state/current-state.json` reflects the release; work-order evidence recorded | HUMAN |

### Step 10 — staging through the real UI (the acceptance item)

Launch the BUILT product-web (`packages/product-web/dist`) under a
headless browser against a seeded staging state file; assert the
identity + resources + group-purchase panels render and ONE REAL
bridge round-trip (an enroll) persists to the staging file. If the
running host has no browser capability, the gate reports this item
PENDING-station with the exact command the station must run — never
silently passes, never fabricates.

## Announce only after

- Every hard-fail step green; every PENDING-station item executed at
  the station (with transcript filed under `docs/reports/`).
- The GitHub Release page carries: deb, AppImage, SHA256SUMS.md,
  INSTALL-UBUNTU.md.
- The operator has the download links in the mission board.

## Post-release (the feedback loop)

- Re-run the release gate once against the PUBLISHED channel (step 12)
  the same day — catches channel-side breakage early.
- File any incident per `ops/incident/README.md`; postmortems answer
  "which gate step catches this earlier?" and amend this file.
