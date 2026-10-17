# Developer onboarding (P5-W1)

From a clean clone to every gate green. Everything below is REAL and
current as of P5-W1 (main `d4d4436` lineage).

## 1. Setup

```bash
git clone https://github.com/payswapdotorg/adcos-2.0.git
cd adcos-2.0
npm install -g pnpm@10.33.2        # PINNED (repo packageManager + mise pin;
pnpm install --ignore-scripts      #  corepack default is WRONG for this repo)
```

Toolchain truth: node ≥ 24 (repo uses node 24.21 in CI/station),
pnpm **10.33.2**. `--ignore-scripts` skips native postinstalls you do
not need for the gates (electron binary download included — needed only
for packaging).

## 2. Read the law (authority order)

1. `README.md` / `README.en.md` — product identity (ADCOS — Connectivity OS)
2. `AGENTS.md` — repo laws
3. `spec/development-state/current-state.json` — roadmap truth
   (frontier + active work orders)
4. `spec/work-orders.md` — the work-order catalog (your lane's owned paths)
5. `spec/adr/ADR-0004-payment-references.md` — payment law
6. `architecture-policy.yaml` — module registration law
   (managed modules, contract-only cross-imports, file/contract line caps)

## 3. The gate suite (run before every push)

```bash
node scripts/check-project-spec.mjs                 # spec checker must PASS
node scripts/architecture/architecture-check.mjs check   # 0 NEW violations
pnpm lint                                           # 0 errors on your files
pnpm --filter @adcos/product-web exec tsc --noEmit -p tsconfig.json
pnpm --filter @adcos/desktop-app exec tsc --noEmit -p tsconfig.host.json
pnpm --filter @adcos/product-web test && pnpm --filter @adcos/desktop-app test
pnpm --filter @adcos/product-web build              # vite build (small, no zcode deps)
```

Ops gates (P5-W1 additions — you are touching ops/docs/scripts only in
most cases, but run them anyway; they are fast):

```bash
node scripts/ops/check-secrets.mjs                  # CLEAN
node scripts/ops/run-drills.mjs                     # restore drill PASS
```

## 4. The desktop battery (P5-W2)

`pnpm --filter @adcos/desktop-app test` runs the 3-battery suite
driving the SAME router the Electron ipcMain handlers delegate to,
against the REAL SurfacesService over a temp JSONL store:
full journey wiring, write-before-ack + restart recovery, role-gating
negatives.

## 5. Where truth lives

- Roadmap: `spec/development-state/current-state.json`
- Work orders: `spec/work-orders.md` (add your lane's section there per
  the governance pattern)
- Reports: `docs/reports/<lane>/` — PROVEN/PARTIAL/GAP labels, real
  transcripts, no fabricated numbers
- Ops tree: `ops/**` (environments, monitoring, retention, costs,
  incident, drills) + `docs/runbooks/**` + `scripts/ops/**`

## 6. Branch discipline

`work/<phase>-<lane>/<topic>` off the base SHA named in your work
order; `feat(<phase>-<lane>): …` commits; the TL reviews/merges (husky
pre-push runs the spec checker).

## 7. Packaging (only when your lane ships artifacts)

electron-builder linux x64 (deb + AppImage) with
`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` on
egress-restricted hosts; memory-window note from P5-W2: the build box
needs ~2 GB free or the packager gets OOM-killed. The release itself
(GitHub Release + SHA256SUMS + anonymous-download verification) is a
TL/station step per `release-gate.md`.
