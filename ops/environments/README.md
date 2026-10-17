# ADCOS environment contracts

Environment contract law for the shipped ADCOS product (P5-W1):
**every runtime input is enumerated, typed, owned, and sourced** — no
ambient configuration, no hidden defaults, no secret in the repo.

## Scope truth (read this first)

The shipped product is the P5-W2 pair:

- `packages/product-web` (`@adcos/product-web`) — the product UI (vite
  SPA; zero `@zcode/*` deps; renderer-side only)
- `apps/desktop-adcos` (`@adcos/desktop-app`) — the Electron main
  composing the REAL `createSurfacesService` from `@adcos/surfaces`

The repo's `config/` tree (`default.json`, `provider/zcode-builtin.json`)
belongs to the **inherited ZCode substrate** and is **not consumed by the
shipped product** (verified: no import/reference from `product-web` or
`desktop-adcos`; the desktop app loads only local `file://` assets). It is
listed in `contracts.json` with `consumedBy: "substrate (NOT the shipped
product)"` so no reader mistakes it for an ADCOS input.

## Contract law

1. **Enumerated**: every input appears in `contracts.json` (machine
   contract) and `matrix.md` (human per-env binding).
2. **Typed + owned**: each input declares type, consumer, default,
   required-ness, secret-ness, allowed values.
3. **Sourced**: secrets declare their injection channel — env var, OS
   keyring, or `0600` file — and are NEVER committed, NEVER written to
   the JSONL state, NEVER logged (enforced by `scripts/ops/check-secrets.mjs`,
   wired into `scripts/ops/release-gate.mjs`).
4. **Per-env delta law**: staging and production differ by **bindings
   only, never by code flags**. The repo has no env-flag mechanism by
   construction (no `NODE_ENV`-style branches in the shipped product);
   keep it that way. Differences live in WHERE the state file lives and
   WHICH release channel is tracked — not in code paths.
5. **Clock law**: the service clock is injected (`now: () => Date.now()`
   in the shipped app; a fixed clock in tests/drills). No ambient time
   inside the domain.
6. **Role lists are deployment configuration, not runtime state**:
   `operatorPrincipals` / `developerPrincipals` are composed at service
   creation (see `packages/surfaces/src/contract.ts`).

## The inputs (summary — full truth in contracts.json)

| Input | Consumer | Default | Secret |
| --- | --- | --- | --- |
| `userData` directory (Electron) | desktop main | OS per-user app-data dir | no |
| `state/adcos-state.jsonl` (under userData) | SurfacesService JSONL store | `<userData>/state/adcos-state.jsonl` | no (contains journey events; see retention) |
| `operatorPrincipals` | `createSurfacesService` | `["ops@local"]` (local demo identities) | no |
| `developerPrincipals` | `createSurfacesService` | `["dev@local"]` (local demo identities) | no |
| injected clock | `createSurfacesService` | `() => Date.now()` | no |
| Release channel (GitHub Releases) | operators/installers | `payswapdotorg/adcos-2.0` tag `adcos-desktop-v1.0.0` | no |
| Build-time `ELECTRON_MIRROR` | CI/build host only | unset | no |
| `GITHUB_TOKEN`-class PATs | CI/release publishing only | unset | **YES** — env channel, never in repo |

ADR-0004 law carried into every environment: live provider / payment-rail
integration is **BLOCKED-ON-OPERATOR**; no environment binding may claim
live money or live provider traffic.
