# P5-W2 Report — Desktop product distribution (Ubuntu)

Work order: `## P5-W2` in `spec/work-orders.md` (operator directive 2026-10-16).
Executor: TL at the integration station (see Delivery note).
Date: 2026-10-16.

## Directive (verbatim intent, operator)

> "Make sure there's a downloadable desktop app my local agent can install on my
> Ubuntu desktop. The app should be the product we're building and not zcode."
> — corrected scope 2026-10-16: the product is **ADCOS 2.0 — Connectivity OS**
> (repo `payswapdotorg/adcos-2.0`), not Sporta or any other repo.

## What shipped

| Artifact | Path |
| --- | --- |
| Product UI package | `packages/product-web` (`@adcos/product-web` v1.0.0) |
| Desktop app | `apps/desktop-adcos` (`@adcos/desktop-app` v1.0.0) |
| Ubuntu deb | `adcos-desktop_1.0.0_amd64.deb` (80,365,602 B) |
| Ubuntu AppImage | `adcos-desktop-1.0.0-x86_64.AppImage` (116,792,135 B) |
| Checksums | `SHA256SUMS.md` |
| Install guide | `INSTALL-UBUNTU.md` |

### Architecture (honest, no theater)

- The Electron **main process** composes the REAL domain through the surfaces
  public contract: `createSurfacesService({ statePath, now, operatorPrincipals,
  developerPrincipals })` — the real SurfacesService over the durable JSONL
  store (write-before-ack, restart-safe), with an injected clock.
- The **preload** exposes exactly one typed bridge (`window.__adcos_bridge__`,
  `AdcosBridge` from `@adcos/product-web`) over one IPC channel.
- The **renderer** is the ADCOS product surface (React 19 + tailwind 4,
  226 KB bundle): Identity (local demo identities, honestly labeled),
  My resources (enroll/consent machine/observation), Reality Lab
  (evaluations → advisory opportunities), Organizations (founding from PURSUE
  evidence, membership events, invites), Group purchase (open → offer →
  commitments → order lifecycle stepper with opaque payment references and the
  permanent ADR-0004 BLOCKED-ON-OPERATOR badge), Role views (operator aggregate
  + developer contract surface, role-gated by the real service), About.
- **Product lock**: the window loads only local files; `will-navigate`
  blocks non-file URLs; `setWindowOpenHandler` denies all new windows.
  Verified: the shipped asar contains **0** zcode entries (`asar list` piped
  through grep; 835 files, all `@adcos/*` or `out/*`).

## Evidence — gates (real commands, real results)

Run at the integration station (`/home/z/adcos-2.0` @ base 3e24860 + this lane):

- `node scripts/check-project-spec.mjs` → **PASSED** (15 required files; 5
  locked sections; 12 unique work orders; current-state, architecture version,
  and frontier valid).
- `node scripts/architecture/architecture-check.mjs check` →
  **violations: 0, baseline: 0, new: 0**.
- `npx oxlint packages/product-web apps/desktop-adcos` →
  **0 warnings, 0 errors** (24 files, 94 rules).
- `pnpm exec tsc --noEmit` (product-web) → **exit 0**.
- `pnpm exec tsc --noEmit` (desktop-adcos) → **exit 0**.
- `node --import tsx --test test/router.test.ts` (desktop battery) →
  **3/3 pass**:
  1. wiring: full customer journey through every request (enroll → consent →
     observe → Lab evaluation (verdict PURSUE) → founding → group purchase →
     offer → commit → order lifecycle AUTHORIZE→PLACE_ORDER→CONFIRM_CONTRACT→
     MARK_FULFILLED→RECONCILED);
  2. durability: write-before-ack + restart recovery over the same JSONL log
     (a NEW service instance restores the enrolled resource);
  3. role gating: customer refused operator/developer views with reasons;
     operator principal reads the aggregate; empty-principal switch refused.
- `vite build` (product-web) → **27 modules, 226.48 kB JS + 19.84 kB CSS,
  built in 231 ms** (no zcode deps; no renderer OOM by construction).
- `electron-builder --linux --x64` → deb + AppImage built;
  `dpkg-deb -I` verifies standard control fields (Depends: libgtk-3-0,
  libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0,
  libsecret-1-0, libgbm1, libasound2).

## Evidence — packaged-app smoke (headless Xvfb + CDP)

- Launch: `Xvfb :99` + `linux-unpacked/adcos-desktop --disable-gpu
  --remote-debugging-port=9333` → window target **"ADCOS — Connectivity OS"**
  loading `app.asar/out/renderer/index.html`.
- Bridge probe (Playwright over CDP, `page.evaluate`): `session()` →
  `{principal: "ada@local", roles: ["customer"], productVersion: "1.0.0",
  persistence: {snapshots: 0, tornLines: 0}}`; `customerView()` → real scoped
  view; `enrollResource` through the bridge → `applied: true` with the real
  domain result; the durable log `~/.config/adcos-desktop/state/
  adcos-state.jsonl` gained the snapshot (verified by re-reading the file).
- DOM verification: all 7 nav panels render (Identity, My resources, Reality
  Lab, Organizations, Group purchase, Role views, About); panel clicks switch
  headers; the ADR-0004 payment badge renders in the header.
- Screenshots: `docs/reports/desktop/evidence-app-identity.png`,
  `evidence-app-resources.png`, `evidence-app-about.png`.
- Two real bugs were found and fixed BY this smoke loop (honest record):
  1. ESM main lacked `__dirname` (Electron 39) → fixed via the esbuild banner
     (`createRequire`/`fileURLToPath`/`dirname`).
  2. vite absolute asset paths broke `file://` loading → fixed with
     `base: "./"`.

## Honest limitations (GAPs, not hidden)

- The smoke test ran with `--disable-gpu` under Xvfb (headless Debian
  sandbox); real-GPU/desktop-environment rendering on the operator's Ubuntu
  machine is expected but not evidenced from here.
- Local demo identities are NOT authentication (labeled as such in the UI).
- No live provider integration, no physical-device cooperation, no payment
  settlement is claimed or shipped (ADR-0004; P4-W2 remains
  BLOCKED-ON-OPERATOR).
- The substrate renderer OOM debt (P0-W1 limitation) is untouched — this lane
  ships its own small renderer and does not build the zcode web app.

## Delivery note

- Worker dispatch WAS attempted first per the standing rule: session `p5w2`
  (chat.z.ai, agents tab, GLM-5.3, Full-Stack) — prompt server-verified
  accepted (session 5cbfd298-8dec-41f5-a5dc-a80603f825b); the platform's
  generation service did not open the turn (429 drought, the same class the
  W12-C review and the Task-17 log recorded); one nudge sent and verified
  delivered; `drought_watch_p5w2.py` armed. The lane was then executed by the
  TL at the integration station under the work order, per the recorded
  precedent in this repository's own state file ("TL-executed under deadline",
  P2-W1-TL-SLICE et al.). If the worker's turn opens later, its output will
  be reviewed and merged on top.
- Review/packaging/release were TL-owned by design (the same split the
  w13a/w12d packets used: the worker builds, the TL gates + publishes).

## Release

GitHub Release `adcos-desktop-v1.0.0` on `payswapdotorg/adcos-2.0` with the
deb, the AppImage, `SHA256SUMS.md`, and this report's install guide
(`INSTALL-UBUNTU.md`). Assets verified downloadable anonymously (HTTP 200
without credentials).
