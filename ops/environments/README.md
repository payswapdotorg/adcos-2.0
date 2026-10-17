# P5-W1 — Environment Contracts (`ops/environments/`)

Owner: lane p5w1 (work order `## P5-W1`). Scope: the SHIPPED product stack from
P5-W2 — `packages/product-web` (renderer) + `apps/desktop-adcos` (Electron
main/preload) composing the REAL `createSurfacesService` from the surfaces
public contract — plus the P5-W1 ops tooling (`scripts/ops/**`).

Status labels used throughout: **PROVEN** (executed in this repo, transcript in
`docs/reports/deployment/`), **PARTIAL**, **PLANNED**, **PENDING-station**
(cannot execute in the sandbox; exact command recorded).

## Contract law

1. **Every runtime input of the shipped product is enumerated, typed, owned,
   and sourced.** The machine-readable inventory is
   [`contracts.json`](./contracts.json); the human-readable per-environment
   binding matrix is [`matrix.md`](./matrix.md). If an input is not in those
   two files, it is not a contract — it does not exist.
2. **No environment-variable mechanism exists in the shipped product.** This
   is an honest, verified property, not an omission: the ADCOS desktop app
   reads ZERO env vars at runtime. Its entire runtime configuration is
   (a) constructor arguments handed to `createSurfacesService`
   (`statePath`, `now`, `operatorPrincipals`, `developerPrincipals`) and
   (b) frozen constants in the desktop contract
   (`ADCOS_IPC_CHANNEL`, `ADCOS_BRIDGE_GLOBAL`, `ADCOS_LOCAL_PRINCIPALS`,
   `ADCOS_DEFAULT_PRINCIPAL`, window geometry, product-lock policy).
   There is no `.env` loading, no config service, no feature-flag surface in
   the shipped code path. Evidence: PROVEN — static scan of
   `apps/desktop-adcos/src` and `packages/product-web/src` for
   `process.env`/`import.meta.env` yields zero runtime reads (transcript in
   the P5-W1 report §gates).
3. **Per-environment deltas are BINDINGS, never code flags.** dev / staging /
   production run the SAME build of the same code; they differ only in WHERE
   the state file lives, WHO the configured principals are, and WHAT the
   injected clock is (real wall clock in all shipped configurations; fixed
   clock in drills/tests). Because the repo has no env-flag mechanism, an
   environment is fully described by the constructor bindings in
   `matrix.md` — there is no second axis of variation to audit.
4. **Frozen contract names are untouched.** `ADCOS_IPC_CHANNEL`,
   `ADCOS_BRIDGE_GLOBAL`, `ADCOS_PAYMENT_NOTICE`, the `AdcosRequest` method
   vocabulary, and every public entrypoint in
   `packages/surfaces/src/contract.ts` are inherited frozen surfaces; this
   lane documents them, never renames them.
5. **The inherited substrate config surface is documented as NOT-consumed.**
   `config/default.json` and `config/provider/zcode-builtin.json` are inputs
   of the inherited ZCode substrate (settings/provider tooling), NOT of the
   ADCOS desktop product. They are enumerated in `contracts.json` under
   `substrateSurfaces` with their real consumers, so the inventory is
   complete without implying the shipped product reads them.

## Credentials isolation law (acceptance item)

- **Secrets are NEVER in the repo.** Enforced by
  `scripts/ops/check-secrets.mjs` (grep-style gate over tracked files),
  wired into the release-gate checklist
  ([`docs/runbooks/release-gate.md`](../../docs/runbooks/release-gate.md)),
  NOT into package.json (scope law: zero edits outside owned paths).
- **Secrets are NEVER in JSONL state.** The durable store persists
  contracts-typed projection rows only; every row shape is enforced by
  `isSurfaceStateLike` on reload and the P4-W1 round-2 secrets battery
  (6/6) proves sentinel-shaped values never surface in command results or
  views. The store file contains tenant business data (journey events,
  opaque payment references) and must be access-controlled accordingly —
  but it is credential-free by construction.
- **Secrets are NEVER in logs.** `main.log` (the only log the shipped app
  writes) records timestamped lifecycle lines from the main process; the
  substrate redaction law (`packages/shared/src/feedbackPrivacy.ts`) and
  the INVARIANTS #3/#13 discipline apply to anything a diagnostic bundle
  might ever include.
- **Every secret declares its injection channel** (see the `secrets` section
  of `contracts.json`): environment variable, OS keyring, or a file with
  permissions `0600`. A secret file declared with any other permission, or
  any tracked file that IS a private key, fails the secrets gate.

## Honest gaps (labeled)

- **Live provider credentials: UNKNOWN / BLOCKED-ON-OPERATOR (ADR-0004).**
  No payment rail is selected, no live provider integration exists; their
  cost/credential shapes are recorded as UNKNOWN entries, never invented.
- The desktop `userData` path on Windows/macOS is documented from Electron's
  documented behavior; only the Linux (Ubuntu x64) binding is PROVEN by the
  P5-W2 packaged-app smoke (Linux: `~/.config/adcos-desktop`). macOS/Windows
  bindings are PENDING-station for the operator.
