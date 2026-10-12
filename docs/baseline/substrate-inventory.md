# ADCOS 2.0 — Substrate Inventory (Inherited ZCode Baseline)

- Work order: **P0-W1 — Inherited ZCode baseline and migration inventory** (see `spec/work-orders.md`)
- Owner: Worker 1 (platform substrate / migration / product surfaces lane)
- Branch: `p0-w1/baseline-inventory`
- Baseline under review: ADCOS-2.0 `main` @ `6ba5dcdd03339a657951750c100a7b446a6d5624`
- Upstream pin: zai-org/ZCode `29628c9acdb81b703bbd4080c207a0e7ce5e276e` (v3.14.3)
- Evidence window: 2026-10-12, 11:16–12:0x UTC; all commands run in the pinned checkout on this branch (tree identical to `main` at `6ba5dcd`; no substrate files touched)
- Verbatim command/output evidence: `docs/baseline/evidence/01-upstream-pin.txt`, `02-toolchain.txt`, `03-baseline-checks.txt`

---

## 1. Upstream pin verification

**Pinned commit (verified by fetch + `git log -1`):**

```
commit 29628c9acdb81b703bbd4080c207a0e7ce5e276e
Author: wuweiqi <weiqi.wu@aminer.cn>
Date:   2026-09-23 17:36:31 +0800
Subject: feat: update v3.14.3
```

**ADCOS-2.0 history equals the pin plus exactly three ADCOS architecture commits (verified):**

```
$ git rev-parse 6ad4623^            # parent of first ADCOS commit
29628c9acdb81b703bbd4080c207a0e7ce5e276e          # == the pin

$ git log --oneline | wc -l         # full history length
6
 6ba5dcd docs: align TL handoff with spec checker starter
 bf39b3a docs: clarify spec-checker hardening work order
 6ad4623 docs: establish ADCOS 2.0 architecture and implementation handoff
 29628c9 feat: update v3.14.3        # <- upstream pin
 872ad96 feat: open source
```

**Tree identity cross-check (same git object in both clones):**

```
$ git rev-parse 29628c9^{tree}   # in shallow clone of zai-org/ZCode
e7458be062f467b465abc91509adb0558e023605
$ git rev-parse 29628c9^{tree}   # in ADCOS-2.0 clone
e7458be062f467b465abc91509adb0558e023605    # identical
```

**What differs between ADCOS main and the pin — docs/spec only, zero substrate code:**

`git diff --name-status 29628c9..HEAD` (17 files, +693/−486):

| Status | Path | Class |
|---|---|---|
| M | `AGENTS.md`, `README.md`, `README.en.md` | doc rewrites (product identity) |
| A | `docs/LLM-ARCHITECT-HANDOFF.md`, `docs/research/ARCHITECTURE-REFERENCES.md` | ADCOS governance docs |
| A | `spec/*.md`, `spec/architecture/*.md`, `spec/development-state/current-state.json` | ADCOS spec tree |
| A | `scripts/check-project-spec.mjs` | governance checker starter (Worker 2 owns) |

No file under `packages/`, `apps/`, `patches/`, `pnpm-lock.yaml`, root manifests, or license files was touched. **The inherited substrate at ADCOS main is byte-identical to upstream v3.14.3.**

**Live upstream main observation (timestamped, observation only — NOT permission to upgrade):**

```
$ git log -1 origin/main   # observed 2026-10-12T11:19Z in shallow clone
commit aac4755666d09fdcd70272fcf063c077a639015f
Author: wuweiqi <weiqi.wu@aminer.cn>
Date:   2026-10-10 18:57:01 +0800
Subject: feat: update to v3.15.1
```

This re-verification matches the observation already recorded in `spec/UPSTREAM-ZCODE.md` (aac4755 / v3.15.1, 2026-10-12); no edit to that file was required. Drift pin→upstream main is 1 commit, `--stat` tail: `11736 files changed, 1942850 insertions(+), 25090 deletions(-)` (includes generated/lockfile artifacts; also adds `vitest.config.ts`, `vitest.setup.ts`, and a `.husky/pre-push` hook — see §6 I-7/I-8). Nothing from upstream was merged.

---

## 2. Toolchain pins

| Source | Pin | Value |
|---|---|---|
| `.nvmrc` | node major | `24` |
| `mise.toml` | node / pnpm | `24.14.0` / `10.33.2` (mise is declared toolchain authority; also sets `COREPACK_ENABLE_PROJECT_SPEC=0`, `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`) |
| `package.json` (root `zcode@3.14.3`) | packageManager | `pnpm@10.33.2` |
| `package.json` engines | node | `>=24.0.0` |
| `pnpm-lock.yaml` | lockfileVersion / settings | `9.0`, `autoInstallPeers: true`, `excludeLinksFromLockfile: false`; root `react`/`react-dom` overridden to `19.2.7`; 3 patched deps (`@ai-sdk/anthropic@3.0.81`, `@ai-sdk/openai-compatible@2.0.60`, `@arms/rum-electron@0.0.3`) |
| `apps/zcode-cli` engines | node | **exact `24.14.0`** (stricter than root) |

**Sandbox reality (recorded):** `node v24.21.0` (satisfies root `>=24.0.0`, violates the CLI's exact `24.14.0` — warning only); `git 2.47.3`; `mise` **not installed**; `pnpm` **not on PATH** (satisfied instead via `corepack` → `pnpm 10.33.2` exactly matching the pin; `npx pnpm` would yield 12.11.2 and was NOT used). Disk 8.0 GB free at start, 4.1 GiB RAM, 2 CPUs.

---

## 3. Workspace map

`pnpm-workspace.yaml` globs: `packages/*`, `apps/zcode-cli`, `apps/zcode-cli/packages/*`, `apps/zcode-cli/tools/*` — **33 packages with `package.json`** (root + 14 + 1 + 16 + 2). Two additional glob matches, `apps/zcode-cli/packages/bundled-skills` (skill markdown assets) and `apps/zcode-cli/packages/superpowers-plugin` (content + LICENSE only), have no `package.json` and are therefore **not** workspace packages. `apps/zcode-cli` is a plain directory tree (gitlink-free; no `.gitmodules` in either repo — the `git submodule update` call in `scripts/bootstrap.mjs` is a no-op vestige). `supportedArchitectures` pre-declares darwin/linux/win32 × x64/arm64 × glibc; `allowBuilds` gates native postinstalls (electron, node-pty, ssh2, esbuild, koffi, msw, protobufjs…).

All workspace packages are `private: true` **except `@zcode/rpc`** (`private: false`, v1.0.0) — the only nominally publishable package.

### 3.1 `packages/*` — platform substrate

| Package | Name | Substrate role | Key facts / deps | Build | Tests |
|---|---|---|---|---|---|
| `packages/shared` | `@zcode/shared` | Foundation types, paths, env normalization | inbound ws-deps: **17** (most-used); deps `@zcode/model-option-map` | tsc only | — |
| `packages/model-option-map` | `@zcode/model-option-map` | Model option DSL: parser/compiler/evaluator, tokenizer map, merge-patch | leaf | tsup | — |
| `packages/rpc` | `@zcode/rpc` (v1.0.0, **not private**) | "VS Code style IPC communication abstraction framework" — the RPC/IPC backbone | inbound 6 | tsup | — |
| `packages/provider` | `@zcode/provider` | Model-provider abstraction (provider registry/config runtime) | deps shared, model-option-map; inbound 6 | tsup | — |
| `packages/provider-node` | `@zcode/provider-node` | Node bindings for the provider layer (loading npm providers) | deps provider, shared, model-option-map | tsup | — |
| `packages/services` | `@zcode/services` | Domain services (session, storage, bots, model-provider runtime) | declares the two enforced **publicEntrypoints** (see §4); inbound 5 | tsc only | 3 `node:test` files (10 tests) |
| `packages/client` | `@zcode/client` | Client-side RPC access used by web/desktop (messageport, websocket, remote access) | deps rpc, services, shared | tsc only | — |
| `packages/server` | `@zcode/server` | Headless server: HTTP (hono) + stdio entries, remote deploy backend (ssh/docker/wsl) | deps client, rpc, services, shared; externals: hono, ws, ssh2, node-pty, undici | tsup (+ `build:remote` → `dist/remote/zcode-server.cjs`) | — |
| `packages/zcode-server-cli` | `@zcode/server-cli` | Standalone server launcher; **bin: `zcode`** | deps rpc, services, shared | tsup | — |
| `packages/ui` | `@zcode/ui` | The entire React platform UI (stores, settings, tool-call renderers, bots, workflows) | 62 deps (radix, zustand, swr, lexical, xterm, pdfjs, xyflow, streamdown…); inbound 2 (consumed as source by web/desktop vite builds — **no build script**) | — (tsc emits dist) | 1 `node:test` file (fails, see I-4) |
| `packages/web` | `@zcode/web` | Web app shell (vite/rolldown, auth/OAuth, main.tsx) | deps client, shared, ui | vite | — |
| `packages/desktop` | `@zcode/desktop` | Electron desktop app (host process, browser views, remote workspace, updater) | 35 deps incl. electron, playwright-core, OTel, `@arms/rum-electron` (patched); **productName "ZCode"** | electron-builder + vite | — |
| `packages/zcode-cua` | `@zcode/zcode-cua` (v0.6.3) | **Fail-closed Computer-Use placeholder**: every CUA surface reports unavailable; privacy fail-closed | leaf, 0 deps | — | — |
| `packages/formal-proof` | `@zcode/formal-proof` | Formal-proof helpers (bootstrap dep of the CLI) | leaf | tsup | — |

### 3.2 `apps/zcode-cli` — CLI / agent runtime stack

App root `zcode-cli@0.16.9` ("A cross-platform TypeScript Node.js CLI with a small TUI and optional SEA packaging"), engine-strict `node 24.14.0`, built via **turbo** (16 build tasks; SEA optional packaging; `dependencies/native-search/` vendors ripgrep/ugrep/bfs tarballs with SHA256SUMS).

| Package | Name | Role |
|---|---|---|
| `packages/cli` | `@zcode/cli` | Main CLI application; **bin: `zcode`**; bundles to `dist/zcode.cjs` (29.7 MB) |
| `packages/tui` | `@zcode/tui` | Terminal UI (ink-style React TUI: transcript, sidebar, approvals, themes) |
| `packages/core` | `@zcode/core` | Agent runtime core (session loop, tools, prompts); heaviest tsc build |
| `packages/contracts` | `@zcode/contracts` | CLI-side shared contracts (inbound 9) |
| `packages/shared-types` | `@zcode/shared-types` | Type-only shared surface (incl. Swift bridge types) |
| `packages/adapters` | `@zcode/adapters` | Runtime adapters: MCP client (`@modelcontextprotocol/client`), ai-sdk providers (`@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` — both patched), storage/session store, logging, commands, plugins |
| `packages/bootstrap` | `@zcode/bootstrap` | CLI bootstrap composition root (wires core+adapters+telemetry+provider) |
| `packages/dynamic-workflow` / `-runtime` | `@zcode/dynamic-workflow{,-runtime}` | Dynamic workflow engine + runtime host |
| `packages/node-repl-host` | `@zcode/node-repl-host` (v0.6.0) | `node_repl` MCP host; owns JS execution surface + Browser/CUA bridges |
| `packages/browser-use-plugin` | `@zcode/browser-use-plugin` (v0.5.1) | Official builtin plugin: Browser Use skill + client runtime |
| `packages/i18n` | `@zcode/i18n` | Locale catalogs `en-US`, `zh-CN` (typed `ZCodeCopy` — user-visible product strings) |
| `packages/telemetry` | `@zcode/telemetry` | OTLP exporter, agent trace runtime, model-API recorder, error sanitizer |
| `packages/debug` | `debug` (unscoped name!) | Devtools web app (vite) + debug server (network capture, gantt) |
| `packages/swift-bridge` | `@zcode/swift-bridge` | Swift interop placeholder (macOS) |
| `tools/prompt-trajectory` | `@zcode/prompt-trajectory` | Prompt/model-io analysis tool |
| `tools/typescript` | `@zcode/typescript` | Vendored TS tooling pin for the CLI |

Asset-only dirs (no package.json): `packages/bundled-skills` (dynamic-workflows SKILL.md content), `packages/superpowers-plugin` (plugin content + its own LICENSE).

### 3.3 Supporting top-level surfaces

- `harness/remote/` — Dockerfile + build.sh for remote-deploy smoke harness (README documents usage).
- `scripts/` — build/orchestration: `bootstrap.mjs`, `build-zcode.mjs`, `zcode-distribution/` (installer/runner/assets), native-search tooling (build/pack/verify, windows CMake), `architecture/` (boundary checker, §4), `check-project-spec.mjs` (governance, Worker 2), `check-workspace-freshness.mjs`, `dependency-graph.mjs` (generates `dependency-graph.mmd`, 2449 nodes / 9829 edges on this tree), license/third-party-notice generators (`licenses.mjs`, `third-party-npm.mjs`, `third-party-notices.mjs`, `generate-third-party-notices.mjs` + `scripts/license-texts/`).
- `DESIGN.md` — normative UI design system (mandatory `text-ui-*` typographic scale, product character: "desktop-first and web-compatible AI workspace"); `CONTEXT.md` — Plugin Store domain glossary (zh). AGENTS.md requires consulting both before inherited UI changes.
- License surfaces (untouched, preserved): `LICENSE` (Apache-2.0), `NOTICE.md`, `THIRD-PARTY-NOTICES.md`.

### 3.4 Public surface vs internal

**De-facto public surface** (highest inbound ws-deps, depended on across app boundaries): `@zcode/shared` (17), `@zcode/contracts` (9), `@zcode/rpc` (6), `@zcode/provider` (6), `@zcode/services` (5), `@zcode/zcode-cua` (5), `@zcode/provider-node`/`@zcode/model-option-map`/`@zcode/dynamic-workflow`/`@zcode/core` (4). **App-internal shells**: `@zcode/web`, `@zcode/desktop`, `@zcode/server` (consumed whole), `@zcode/ui` (source-consumed by web/desktop only). **Nominal publishable surface**: only `@zcode/rpc` (`private: false`). Binary surface: `zcode` bin from both `@zcode/server-cli` and `@zcode/cli`; distribution artifacts `dist/zcode.cjs`, `dist/remote/zcode-server.cjs`; the `zcode-plugins-official` marketplace id.

---

## 4. Boundary enforcement: `architecture-policy.yaml` + `architecture:check`

Mechanism (verified by reading `scripts/architecture/{policy,index,architecture-check}.mjs`, ~650 LOC, and by running the check):

- `architecture-policy.yaml` declares **modules** with `id`, `roots`, `managed` flag, `requires` (allowed module deps), `publicEntrypoints`, `layers`/`layerOrder`, `owner`. 15 modules are declared; **only `storage` is `managed: true`** — all other substrate modules are marked legacy (`managed: false`, comment: 存量模块先标记为 legacy；新模块或完成迁移的模块设置 managed: true). `session` and `storage` are the only modules with declared `publicEntrypoints` (`packages/services/src/{session,storage}/contract.ts`); `storage` has a domain→app→adapters layer order.
- `global:` rules — `maxFileLines: 400`, `maxContractLines: 300`, `maxPublicMethods: 12`, `forbidCycles: true`, `forbidDeepImports: true`, `managedOnly: true` (rules enforced on managed modules only; exceptions list is empty).
- `checkArchitecture` walks all `.ts/.tsx/.js/...` sources (excluding node_modules/dist/out/coverage/.git) and emits violation kinds: `cycle`, `expired-exception`, `missing-module-artifact`, `max-file-lines`, `max-contract-lines`, `disable-count`, `max-public-methods`, `domain-io`, `layer-direction`, `ui-implementation-import`, `module-dependency` (imports must respect `requires`), `deep-import` (cross-module imports must target `publicEntrypoints`).
- CLI: `pnpm run architecture:check` (exit 1 on **new** violations), `architecture:report` (JSON/markdown), `architecture:baseline:update` (grandfathers current violations into `.architecture-baseline.json` — file absent today ⇒ baseline is empty), `architecture:context <module-id>`, and `--changed` mode via `git-file-names.mjs`. `verify:pre-push` = `lint && architecture:check -- --changed`.
- **Result on this tree: `architecture: OK / violations: 0 / baseline: 0 / new: 0`, exit 0.**

**Where the connectivity-OS domain plugs in without rewriting the substrate** (proposal-level guidance for P1/P2):

1. New domain code enters as **new workspace packages** (e.g. under `packages/*`, automatically matched by the existing `pnpm-workspace.yaml` glob — no manifest surgery) rather than edits inside legacy modules.
2. Register each new package as a **`managed: true` module** in `architecture-policy.yaml` with explicit `requires` + `publicEntrypoints` (contract files). This is exactly the pattern `session`/`storage` model: domain logic behind a contract file, adapters at the edge. New modules get full rule enforcement from day one (`managedOnly: true` does not exempt them).
3. Consume the substrate only through the de-facto public surface (`@zcode/shared`, `@zcode/rpc`, `@zcode/provider`, `@zcode/services` contracts, `@zcode/client`) — the `deep-import` and `module-dependency` rules then mechanically prevent reaching into internals.
4. Product UI (P2-W1) extends `@zcode/ui` (new stores/renderers/routes follow the existing extension patterns: `store/*`, `ToolCallBlocks/renderers/*`, `settings/*`) while keeping domain logic out of UI per the `ui-implementation-import` rule; agent-side integration (P2-W2) follows the adapters/contracts pattern of `apps/zcode-cli/packages/{adapters,contracts}`.
5. Boundary changes (new public ports, sibling-API integration per `spec/authority-model.md`) go through an ADR per the architecture lock — the checker's `publicEntrypoints` list is the natural registry for the "public command boundary" the invariants require.

---

## 5. Baseline checks (all evidence verbatim in `docs/baseline/evidence/03-baseline-checks.txt`)

| # | Command (as run) | Exit | Key output |
|---|---|---|---|
| 1 | `node scripts/check-project-spec.mjs` | **0** | `ADCOS 2.0 project-spec check PASSED (15 required files; current-state and frontier valid)` |
| 2 | `corepack pnpm install` (pnpm 10.33.2) | **0** | `Done in 49.4s using pnpm v10.33.2`; ssh2 crypto binding + node-pty electron rebuild built; husky prepare OK; node_modules 2.6 GB |
| 3 | `corepack pnpm run lint` (oxlint) | **0** | `Found 70 warnings and 0 errors. Finished in 1.1s on 2617 files` |
| 4 | `corepack pnpm run typecheck` (tsc -b, 11 projects) | **0** | clean, no diagnostics, 117 s |
| 5 | `corepack pnpm run fmt:check` (oxfmt) | **1** | `Format issues found in above 38 files` (7 ADCOS-added + 31 inherited) |
| 6 | `node scripts/check-workspace-freshness.mjs` | **0** | `基线新鲜：p0-w1/baseline-inventory，相对 origin/main：ahead 0 / behind 0（阈值 50）` |
| 7 | `corepack pnpm run architecture:check` | **0** | `architecture: OK / violations: 0 / baseline: 0 / new: 0` |
| 8 | `pnpm run verify:pre-push` | **0** | lint + `architecture:check -- --changed` OK, 3 s |
| 9 | `pnpm run build:bootstrap` | **137** | OOM: `packages/web build: Killed` during vite `rendering chunks` (7737 modules transformed); 7 package builds before it succeeded (model-option-map, formal-proof, rpc, provider, provider-node, zcode-server-cli, server incl. `dist/remote/zcode-server.cjs`) |
| 10 | `NODE_OPTIONS=--max-old-space-size=2200 pnpm --filter @zcode/web build` | **137** | same OOM at rendering chunks (12 s) — environmental, not flaky |
| 11 | `pnpm --filter @zcode/desktop build:no-runtime-assets` | **1** | inner `pnpm exec vite build` **killed with SIGKILL** (OOM) reported by `run-production-build.mjs` |
| 12 | `TURBO_CONCURRENCY=1 NODE_OPTIONS=--max-old-space-size=2400 pnpm --filter zcode-cli run build` | **0** | `Tasks: 16 successful, 16 total`, `dist/zcode.cjs 29.7mb`; first parallel attempt exit 137 (@zcode/core tsc OOM at 7/11) |
| 13 | `node --import tsx --test packages/services/test/*.test.ts packages/ui/test/*.test.ts` | **1** | `tests 11 / pass 10 / fail 1`; ui test fails `ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'` |

**Build-subset justification.** Full `pnpm run build` (= `pnpm -r build`) was not completable: the two renderer vite builds (`@zcode/web`, desktop bundle) deterministically OOM-kill in this 4.1 GiB sandbox (attempts #9–#11, two retry strategies). The recorded subset covers every package with a build script except those two renderer bundles: #9 built all server-side/shared packages (incl. the remote server bundle), #12 built the entire `zcode-cli` app stack (16/16 turbo tasks, including `@zcode/core`, tui, adapters, node-repl-host, browser-use-plugin, and the `zcode` binary bundle). `packages/ui` has no build script (source-consumed). Renderer bundling remains **unverified in-sandbox** and needs re-running on ≥8 GB host or CI. Note: upstream's own `scripts/bootstrap.mjs` comments acknowledge tsup/vite paths being SIGKILLed "in local low-memory environments" (E-1 is a known substrate constraint, not an ADCOS regression).

---

## 6. Issues inventory

### Inherited (present at the pin, unchanged by ADCOS commits)

- **I-1 fmt drift on 31 package files.** `pnpm run fmt:check` fails on 31 files under `packages/{desktop,services,ui}` (bots/session/UI) that are untouched since `29628c9` (verified via `git diff --name-only 29628c9..HEAD` intersection). Upstream ships a tree its own `fmt:check` rejects.
- **I-2 lint warnings.** 70 oxlint warnings, 0 errors (unused imports etc., e.g. `packages/shared/src/validation.ts:27`).
- **I-3 near-zero test infrastructure.** No package declares a `test` script; no test runner in the lockfile; only 4 tracked `node:test` files (3 in `packages/services/test`, 1 in `packages/ui/test`); `harness/remote` is a manual Docker harness. AGENTS.md's required verification ladder has almost nothing to stand on at the substrate level.
- **I-4 one inherited test un-runnable as-is.** `packages/ui/test/nonCliAcpRetirement.test.ts` fails under the only available runner (`node --import tsx --test`) with `ERR_MODULE_NOT_FOUND: '@/lib'` — the ui package's path alias isn't resolvable by tsx without extra config (services tests: 10/10 pass).
- **I-5 no CI.** No `.github/workflows` in the repo (nor upstream at the pin); all gates are local scripts.
- **I-6 no git hooks at the pin.** `.husky/` contains only generated internals; `verify:pre-push` exists but nothing invokes it. (Upstream added `.husky/pre-push` → `pnpm run verify:pre-push` in v3.15.1, i.e. after the pin.)
- **I-7 upstream drift available (v3.15.1).** One commit ahead of pin; 11,736-file diffstat incl. vitest config/setup, pre-push hook (freshness observation only; upgrade requires ADR per `spec/UPSTREAM-ZCODE.md`).
- **I-8 unscoped package name.** `apps/zcode-cli/packages/debug` is named plain `debug` (collides with the ubiquitous `debug` npm package name; private so no direct conflict, but rename hygiene risk).
- **I-9 turbo output-cache warnings.** `no output files found for task @zcode/typescript#build` / `@zcode/browser-use-plugin#build` — `turbo.json` `outputs` keys stale for those tasks (build succeeds; cache degraded).
- **I-10 engine pin divergence.** Root engines `node >=24.0.0` vs `apps/zcode-cli` exact `24.14.0` — running the sanctioned newer Node (24.21.0 here) emits `Unsupported engine` warnings on every CLI workspace command.
- **I-11 mixed-language tooling UX.** Dev tooling logs/comments are largely zh-CN (`check-workspace-freshness.mjs`, architecture checker messages, bootstrap comments) while product/i18n catalogs ship en-US/zh-CN — fine internally, but worth knowing for future tooling work.

### ADCOS-specific (architecture commits interacting with substrate)

- **A-1 seven ADCOS-added files fail `fmt:check`.** `AGENTS.md`, `docs/LLM-ARCHITECT-HANDOFF.md`, `scripts/check-project-spec.mjs`, `spec/architecture/INVARIANTS.md`, `spec/authority-model.md`, `spec/development-state/current-state.json`, `spec/work-orders.md` (oxfmt formats md/json/mjs). Makes the *inherited* `fmt:check` gate red on main — either format them (one-command fix, but touches files outside P0-W1's owned paths) or scope fmt to source dirs. Flag to TL; simplest disposition lands with Worker 2's checker hardening or a TL-approved fmt commit.
- **A-2 checker not wired.** `scripts/check-project-spec.mjs` passes but nothing (CI/hooks/scripts) runs it — exactly what P0-W2 is scoped to fix. Handoff note in §9.
- **A-3 product-identity fork of root docs.** `README.md`/`README.en.md`/`AGENTS.md` were rewritten from upstream's; future upstream doc merges will conflict textually there by design (accepted; recorded so it isn't rediscovered as an accident).

### Environmental (sandbox limits; all with exact errors in evidence file)

- **E-1 RAM ceiling blocks renderer bundling.** 4.1 GiB total; `vite build` for `@zcode/web` and desktop both SIGKILL (exit 137 / "Command was killed with SIGKILL: vite build") at `rendering chunks` after 7737 modules; persisted across retry with capped V8 heap (workers each hold heaps).
- **E-2 RAM ceiling forces serialized CLI build.** Default turbo concurrency OOM-killed `@zcode/core#build` tsc (exit 137 at 7/11 tasks); `TURBO_CONCURRENCY=1` + `--max-old-space-size=2400` succeeds. CI/large hosts unaffected.
- **E-3 toolchain availability.** `mise` absent, `pnpm` not on PATH (solved via corepack shim → exact pinned 10.33.2); node 24.21.0 ≠ mise pin 24.14.0 (see I-10).
- **E-4 no swap** configured; OOM is a hard kill, not degradation.

---

## 7. Product identity migration proposal — **PROPOSAL ONLY, nothing executed**

### 7.1 Where "zcode" identity lives today (measured on the pinned tree)

| Layer | Inventory | Scale / examples |
|---|---|---|
| Package names | root `zcode@3.14.3`; app `zcode-cli@0.16.9`; `@zcode/*` scope × 32; one unscoped `debug` | rename ⇒ churn across all manifests, lockfile, imports |
| Binaries / artifacts | bin `zcode` (`@zcode/server-cli`, `@zcode/cli`); `dist/zcode.cjs`; `dist/remote/zcode-server.cjs` | wire-level names for launchers/remote deploy |
| Desktop identity | `packages/desktop/scripts/desktop-product-identity.mjs`: prod `{appId: dev.zcode.app, productName: "ZCode", linuxExecutableName: "zcode"}`, preview `{dev.zcode.app.preview, "ZCode Preview", zcode-preview}`; dev AUMID `cn.aminer.zcode`; `package.json` productName "ZCode" | **purpose-built rename seam** |
| UI strings | ~4,132 `ZCode` occurrences across `packages/ui`, `packages/web`, tui, i18n (`ZCodeCopy` catalogs en-US/zh-CN: "Run the ZCode Protocol stdio app server", "Starting ZCode…") | user-visible |
| Env vars | `ZCODE_*`: ZCODE_VERSION (99), ZCODE_AGENT_PROVIDER (98), ZCODE_ENV (95), ZCODE_ENDPOINT_ORIGIN, ZCODE_OFFICIAL_PLUGIN_MARKETPLACE(_ID), ZCODE_JWT_TOKEN_KEY, ZCODE_BASE_URL, ZCODE_PRODUCT_FLAVOR, ZCODE_MCP_DESCRIPTOR, ZCODE_ATTACHMENT_FAULT_CODES, ZCODE_UGREP_SOURCE_DIR, ZCODE_CUA_OFFICIAL_PLUGIN_ID, ZCODE_VIIZ_SOURCE_DIR… (25+ distinct) | machine contract |
| Config / data dirs | `~/.zcode/cli/config.json`, `~/.zcode/cli/plugins/{cache,data,marketplaces}`, `~/.zcode-dev-home` (mise dev), workspace `.zcode/tmp/…` | **user state; breaking = data loss** |
| Marketplace & plugin ids | `zcode-plugins-official` (16 files); plugin coords `browser-use@zcode-plugins-official` etc.; builtin `zcode-guide` plugin | wire + persisted install state + CDN catalog |
| Web/protocol tokens | localStorage `zcodejwttoken`, `zcode-theme`, `zcode:share:mock-auth`; OAuth `bigmodelAppId` default `"zcode"` (server-registered app id); RPC channel `zcode/session`; marker names `zcode-host`, `zcode-desktop-iab`, `zcode-playwright-*`, telemetry event prefixes `zcode_protocol.*` | cross-process + server-side contracts |
| Source identifiers | ~22,842 case-insensitive `zcode` in ts/tsx (module names like `zcodeSessionStore`, `legacyZCodeConfigProviderReader`, protocol `zcode-protocol-v4`) | internal; rename = pure churn |
| Scripts/docs | `build-zcode.mjs`, `zcode-distribution/`, `zcode-distribution-smoke.mjs`, `zcode-stdio-tap.mjs`, README.en/CONTEXT/DESIGN (`ZCode Design System`) | mixed |

### 7.2 Minimal identity migration (ordered, each step gated)

The architecture policy (`spec/UPSTREAM-ZCODE.md`) already rules out cosmetic package renames: *"Do not … rename imported packages just to cosmetically rebrand the repository."* So the minimal migration rebrands only what a **user or an external system can observe**, and leaves code-level identity intact until an ADR says otherwise.

- **Step 0 — baseline guard (no-op).** Keep LICENSE/NOTICE/THIRD-PARTY-NOTICES, upstream history, `@zcode/*` package scope, internal module/protocol names, and the pin. Add identity-rename coverage to the eventual UI test suite before Step 1 (needs the test-investment work first; cf. I-3).
- **Step 1 — build-time product identity (low risk).** The desktop seam `resolveDesktopProductIdentity()` exists precisely for this: change `PRODUCTION_IDENTITY`/`PREVIEW_IDENTITY` to ADCOS values (productName "ADCOS"/"ADCOS Preview", new appId namespace e.g. `app.adcos.*`, linux executable `adcos(-preview)`), and update the Windows AUMID dev fallback. Update i18n `ZCodeCopy` product-name strings (en-US, zh-CN) + the handful of web/desktop title strings. Risks: update paths & app-id migration on already-installed builds (upstream `electron-updater` keyed by appId) — ship as a new major install side-by-side rather than an in-place identity swap if any installed base exists.
- **Step 2 — distribution naming (medium risk).** Rename release artifacts/installer metadata (`build:zcode`, `zcode-distribution` output names) and the CLI bundle's user-facing invocation if desired (`zcode` → `adcos` bin alias, keeping `zcode` as alias for compatibility). Do **not** remove the old bin name in the same release.
- **Step 3 — machine contracts (high risk, compat-first).** `ZCODE_*` env vars and `~/.zcode` data dir: introduce ADCOS-prefixed reads with fallback to legacy names (read old+new, write new, one-time migration of `~/.zcode` with backup + rollback), mirroring the existing `legacyZCodeConfigProviderReader` migration pattern already present in `packages/services` (evidence: `providerConfigMigration.test.ts`). Never break stored OAuth/JWT material (`zcodejwttoken`) — re-login cost and locked-out users are the failure mode.
- **Step 4 — ecosystem ids (defer; needs ADR + external coordination).** `zcode-plugins-official` marketplace id, plugin coords, CDN catalog ids, `bigmodelAppId: "zcode"` OAuth registration: these are **shared with the outside world** (CDN contents, provider-registered OAuth apps). Renaming breaks installed-state and server-side registrations; requires alias/migration on the catalog side and new OAuth app registrations. Keep ids, rebrand display names only, until the ADCOS-owned distribution exists.
- **Keep permanently (recommended):** internal identifiers, `@zcode/*` scope, protocol/event names — they are lineage, and upstream merges stay trivially diffable (invariant #27: no unreviewed upstream drift).

Each step = separate ADR + work order; ordering respects the dependency graph (P1 contracts before P2 surfaces, so Step 1 lands with P2-W1's surfaces work, not ad hoc).

---

## 8. Acceptance-criteria cross-check (self-assessment for TL)

- Licenses/notices preserved — ✔ no LICENSE/NOTICE/THIRD-PARTY-NOTICES edits (diff in §1 is docs/spec only).
- Compared against upstream commit `29628c9` with recorded evidence — ✔ §1 + `evidence/01-upstream-pin.txt` (tree-hash identity, name-status diff, rev-list).
- Platform/UI/runtime/package boundaries inspected and documented — ✔ §3, §4.
- Available freshness, lint, typecheck, build checks run with recorded commands and exit codes — ✔ §5 table + `evidence/03-baseline-checks.txt` (13 commands; two renderer builds recorded as environmental OOM with exact errors, plus a successful serialized CLI build and successful server/shared package builds).
- No unreviewed upgrades or feature edits — ✔ docs/reports only; `git status` clean of substrate changes; upstream observed but not merged.

## 9. Handoff notes

- **TL:** A-1 (fmt:check red on main via ADCOS-added files) needs a disposition — smallest fix is an oxfmt pass over those 7 files, but they span Worker 2/3-adjacent paths; suggest TL-approved one-off. Renderer builds (web/desktop vite) need a ≥8 GB runner — the sandbox result is an environmental limitation, not a substrate regression (upstream comments acknowledge low-memory SIGKILL; E-1/E-2).
- **P1-W1 (contract owner):** the substrate's public-port pattern to follow is `packages/services/src/{session,storage}/contract.ts` + `architecture-policy.yaml` `publicEntrypoints` (+ `managed: true`); the checker's `--changed` mode and empty `.architecture-baseline.json` mean new modules are fully enforced from commit one.
- **Worker 2 (P0-W2):** `check-project-spec.mjs` currently validates 15 required files + current-state/frontier (exit 0). Smallest wiring targets: `verify:pre-push` (root script, currently hook-less — I-6) or bootstrap; upstream v3.15.1 added `.husky/pre-push` running `verify:pre-push` — useful reference, do not import wholesale.
- **Worker 3 (P0-W3):** capability claims should assume near-zero automated tests (I-3/I-4) and no CI (I-5); anything "verified" today means the commands in §5.
- Identity migration (§7) is a proposal only; Step 1's seam (`desktop-product-identity.mjs`) is the single highest-leverage file.
