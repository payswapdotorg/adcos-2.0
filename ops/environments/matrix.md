# ADCOS per-environment binding matrix (P5-W1)

Human view of `contracts.json`. Law: **staging and production differ by
BINDINGS ONLY, never by code flags** — the shipped product contains no
env-flag mechanism (no `NODE_ENV`-style branches in `product-web` /
`desktop-adcos`), and this lane adds none. What differs per environment
is WHERE state lives and WHICH release is tracked.

| Binding | dev (repo workstation) | staging (drill/staging gate) | production (end user) |
| --- | --- | --- | --- |
| Product runtime | `pnpm --filter @adcos/product-web dev` (browser, in-memory bridge fallback) + node battery | built `packages/product-web/dist` under headless browser vs a seeded state file (release-gate staging item) | installed `adcos-desktop_<v>_amd64.deb` / AppImage |
| `surfaces.statePath` | temp JSONL under `mkdtemp` (test harness) | drill fixture state file (`ops/drills/` flow) | `<userData>/state/adcos-state.jsonl` (Electron userData) |
| `surfaces.now` | fixed `FIXED_NOW` (tests) / injected in drills | fixed or real clock per drill design | `() => Date.now()` (shipped app) |
| `operatorPrincipals` | `["ops@local"]` (harness) | `["ops@local"]` | `["ops@local"]` (honest local demo identity — NOT an auth claim) |
| `developerPrincipals` | `["dev@local"]` (harness) | `["dev@local"]` | `["dev@local"]` (honest local demo identity) |
| Renderer assets | vite dev server | `dist/index.html` (base './', file:// compatible) | `<app.asar>/out/renderer/index.html` |
| Release channel | none (working tree) | the candidate build under test | GitHub Release `adcos-desktop-v1.0.0` (anonymous, SHA256SUMS-verified) |
| Secrets present | none | none (release-gate secrets check enforces) | none on the user machine; PAT only on the publishing host's env |
| Live provider / payment rail | — | — | **BLOCKED-ON-OPERATOR (ADR-0004)** in ALL environments; no binding exists |
| `ELECTRON_MIRROR` | optional (egress-restricted hosts) | optional | n/a (not shipped) |

## Credentials isolation (acceptance item — how it is enforced)

- The repo tree contains **no secret material**: `scripts/ops/check-secrets.mjs`
  scans tracked files for GitHub PAT / Bearer-token / private-key literal
  patterns and fails the release gate on any hit.
- The product writes **no secrets into the JSONL state** (journey events
  and opaque references only — ADR-0004).
- The durable app log (`main.log`) is append-only ops lines; the app logs
  **no secrets** (composition has none to log).
- The single secret in the product lifecycle — the release-publishing PAT —
  lives ONLY in the publishing host's environment variable channel, never
  in the repo, never in an artifact, never in state.
- `0600` law: any local secret file a future lane might introduce (none
  today) must be `0600` and outside the tracked tree; the check-secrets
  scanner is the standing tripwire.

## Honest limits of this matrix

- The shipped product is a **single-node local desktop app**: there is no
  multi-node topology, no cluster config, no server-side environment.
  "Production" = the end-user's machine.
- Serverless control-plane hosting claims are explicitly NOT evidence of
  persistent packet forwarding deployment (work-order acceptance law).
- The substrate config tree (`config/`) is out of the shipped product's
  scope (see `ops/environments/README.md` scope truth).
