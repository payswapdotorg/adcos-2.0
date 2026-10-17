# P5-W1 — Developer Onboarding Runbook

From a clean clone to gates green for the ADCOS 2.0 product lane
(P5-W2 desktop product + P5-W1 ops). Expected time: ~30–60 min (first
install dominates).

## 1. Truth sources (read order — non-negotiable)

1. `README.md` — product identity: ADCOS 2.0 — Connectivity OS
2. `AGENTS.md` — repo laws (evidence discipline: no fabricated numbers)
3. `spec/development-state/current-state.json` — roadmap truth (frontier,
   active/completed work orders with evidence)
4. `spec/work-orders.md` — the work-order catalog (your lane's `## P*-W*`
   section defines owned paths — NEVER edit outside them)
5. `spec/adr/ADR-0004-payment-references.md` — payment law (every
   live-rail mention carries BLOCKED-ON-OPERATOR honestly)
6. `architecture-policy.yaml` — module registration law
7. `docs/reports/desktop/p5w2-report.md` — the shipped product you build on

## 2. Toolchain (pinned — do not freelance)

- node 24.x (repo `engines.node >= 24`; sandbox used 24.21.0; mise pins
  24.14.0)
- pnpm **10.33.2** (`mise.toml` pin; install: `npm install -g pnpm@10.33.2`)

## 3. Clone + install

```bash
git clone git@github.com:payswapdotorg/adcos-2.0.git && cd adcos-2.0
pnpm install --ignore-scripts          # workspace install (scripts off: reproducible)
```

## 4. Governance gate (must be green BEFORE any work)

```bash
node scripts/check-project-spec.mjs    # → PASSED … (exit 0)
node scripts/architecture/architecture-check.mjs check   # → violations: 0
```

If either is red, STOP: you are on a drifted tree.

## 5. The product gate suite (P5-W2's report, re-runnable locally)

```bash
# lint the shipped product surface:
npx oxlint packages/product-web apps/desktop-adcos

# scoped typechecks (the full-repo typecheck has a recorded OOM workaround — see P0-W1 limitation):
cd packages/product-web && pnpm exec tsc --noEmit && cd ../..
cd apps/desktop-adcos && pnpm exec tsc --noEmit && cd ../..

# desktop battery — the REAL router over the REAL service + durable JSONL:
cd apps/desktop-adcos && node --import tsx --test test/router.test.ts && cd ../..
# expect: 3/3 pass (wiring / write-before-ack + restart / role gating)

# renderer build (small; does NOT build the zcode web app — that one OOMs in 4 GiB sandboxes):
cd packages/product-web && pnpm build && cd ../..   # → dist/ (226.48 kB JS)

# desktop build (main+preload via esbuild, renderer staged):
cd apps/desktop-adcos && pnpm build && cd ../..     # → out/{main,preload,renderer}

# packaging (when preparing a release — deb + AppImage):
cd apps/desktop-adcos && pnpm package:linux && cd ../..
```

## 6. The P5-W1 ops layer (this lane — run them, know them)

```bash
node scripts/ops/check-secrets.mjs                                   # credentials isolation gate
node --import tsx scripts/ops/restore-drill.mjs                      # recovery drill (verdict must be PASS)
node --import tsx scripts/ops/health-probe.mjs --state <jsonl>       # state-plane probe
node scripts/ops/run-drills.mjs                                      # all drills
node --import tsx scripts/ops/release-gate.mjs                       # the full release checklist
```

Read the contracts behind them: `ops/environments/`,
`ops/monitoring/`, `ops/drills/`, `ops/incident/`, `ops/retention/`,
`ops/costs/`.

## 7. Where truth lives (do not trust chat/memory)

- Work order status: ONLY `spec/development-state/current-state.json`
  (frontier + active_work_orders evidence arrays).
- Your lane's owned paths: ONLY your `## P*-*` section in
  `spec/work-orders.md`.
- The acceptance law (P5-W1): staging through the real UI, recovery drill
  passed, credentials isolated, target-specific limits documented — and
  serverless/staging hosting is NEVER evidence of persistent packet
  forwarding (BLOCKED-ON-OPERATOR stays BLOCKED-ON-OPERATOR).

## 8. Committing

- Branch `work/<lane>/<topic>` off the recorded base SHA.
- Commit messages: `feat(p5-w1): …` style for this lane.
- Evidence discipline: record REAL command transcripts (exit codes) in
  `docs/reports/deployment/` — label anything you could not run
  PENDING-station with the exact command the TL must run. Never fabricate.
