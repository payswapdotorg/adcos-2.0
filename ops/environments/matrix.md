# P5-W1 — Environment Binding Matrix (human view)

Machine-readable source of truth: [`contracts.json`](./contracts.json).
Laws: [`README.md`](./README.md). Every row below is a BINDING, never a code
flag — the repo has no env-var/flag mechanism (verified; see README law #2).

| Input | Type | Consumer | Default | Req | Secret | dev | staging | production |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `surfaces.statePath` | path | desktop main → `createSurfacesService` | — | ✔ | ✘ | temp dir file | drill-fixture-seeded `staging-state.jsonl` | `<userData>/state/adcos-state.jsonl` (Linux **PROVEN**: `~/.config/adcos-desktop/…`) |
| `surfaces.now` | `() => ms` | desktop main (injected clock) | — | ✔ | ✘ | `Date.now` (tests: fixed) | `Date.now` (drills: fixed) | `Date.now` |
| `surfaces.operatorPrincipals` | `string[]` | role gate (operator view) | `[]` fail-closed | opt | ✘ | `["ops@local"]` | `["ops@local"]` | `["ops@local"]` (demo identity, not auth) |
| `surfaces.developerPrincipals` | `string[]` | role gate (developer view) | `[]` fail-closed | opt | ✘ | `["dev@local"]` | `["dev@local"]` | `["dev@local"]` (demo identity, not auth) |
| `desktop.userDataPath` | dir | Electron `app.getPath("userData")` | — | ✔ | ✘ | per-harness | n/a (staging stages the renderer, not the packaged app) | Linux **PROVEN**; macOS/Windows **PENDING-station** |
| `desktop.mainLog` | file | `logMain()` append-only | — | opt | ✘ | `<userData>/main.log` | n/a | `~/.config/adcos-desktop/main.log` |
| `desktop.ipcChannel` | const | preload ↔ main | `adcos:request` | ✔ | ✘ | frozen | frozen | frozen |
| `product.bridgeGlobal` | const | `contextBridge` ↔ renderer | `__adcos_bridge__` | ✔ | ✘ | frozen | frozen | frozen |
| `product.localPrincipals` | const | identity switcher | 4 demo principals | ✔ | ✘ | frozen | frozen | frozen |
| `product.defaultPrincipal` | const | session boot | `ada@local` | ✔ | ✘ | frozen | frozen | frozen |
| `desktop.windowPolicy` | const | geometry + product lock | 1280×840, sandboxed, file://-only | ✔ | ✘ | frozen | n/a | frozen |
| `ops.healthProbe.state` | CLI | health prober | — | opt | ✘ | any store | drill fixture | production state file |
| `ops.healthProbe.desktop` | CLI | health prober | — | opt | ✘ | n/a | n/a | `~/.config/adcos-desktop` |
| `ops.restoreDrill.out` | CLI | restore drill | mkdtemp | opt | ✘ | temp | `.run-logs/ops/drill-workspace` | operator scratch dir |
| `ops.releaseGate.stagingPort` | CLI | release gate staging | 4173 | opt | ✘ | 4173 | 4173 loopback | n/a (station tool) |

## Build-time (station) inputs — not runtime, but contract-owned

| Input | Pinned value | Consumer |
| --- | --- | --- |
| node | 24.14.0 (`mise.toml`; `engines.node >= 24`) | workspace toolchain |
| pnpm | 10.33.2 (`mise.toml`) | workspace install (`--ignore-scripts`) |
| tsx | 4.19.4 (root devDep) | drill/probe/gate loaders (`node --import tsx`) |
| esbuild | ^0.27.4 (`apps/desktop-adcos`) | main+preload bundling (`build:main`) |
| vite | ^8.0.2 (`packages/product-web`) | renderer build (`build`) → `dist/` → `out/renderer` |
| electron | ^39.2.8 | packaged runtime (39 at build time) |
| electron-builder | 26.0.12 | deb + AppImage packaging (`package:linux`) |
| SHA256SUMS | `sha256sum` (coreutils) | release checksums |

## Substrate surfaces (inherited; NOT consumed by the shipped product)

| Surface | Keys | Real consumer | Used by ADCOS desktop? |
| --- | --- | --- | --- |
| `config/default.json` | `feedback_url`, `feedback_use_external_form`, `community_urls.{zh-CN,en-US}` | substrate settings/help tooling | **NO** (product-locked; 0 zcode entries in shipped asar) |
| `config/provider/zcode-builtin.json` | `schemaVersion`, `revision`, `templateRules[].templateId`, `config.access.type` (`zhipu-coding-plan-api-key` \| `api-key`), `config.api.baseUrl`, `builtinModelIds` | substrate provider tooling (`packages/provider-node`) | **NO** |

Templates carry access TYPES and URLs only — no literal credential values are
committed anywhere (secrets gate enforces; see README credentials law).

## Per-environment binding notes (honest deltas)

- **dev** — the developer runs the desktop battery
  (`node --import tsx --test test/router.test.ts`) and the drill/probe/gate
  tools against temp-dir state; principals are the frozen demo set.
- **staging** — the release gate's staging step serves the BUILT
  `packages/product-web/dist` over loopback HTTP under headless chromium,
  injects `window.__adcos_bridge__` before page scripts, and routes it to the
  REAL desktop router (`apps/desktop-adcos/src/main/router.ts`) over the REAL
  `createSurfacesService` on a staging state file seeded by the drill
  fixture. Same code, same frozen constants; only the transport differs
  (CDP binding instead of Electron IPC — the IPC/preload layer is proven by
  the P5-W2 packaged-app smoke instead).
- **production** — the installed Ubuntu app (deb/AppImage). State lives in
  `~/.config/adcos-desktop/state/adcos-state.jsonl`; the durable log and
  `main.log` are the two files the app writes. No env vars, no remote
  endpoints, no telemetry (product lock: `file://` only, window-open denied).
