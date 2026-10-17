# Cost bounds (P5-W1)

What the shipped product costs to run and distribute — measured where
measurable, labeled ESTIMATE where estimated, and listed as UNKNOWN
where the operator decision is still pending (ADR-0004). Never
presented as if known.

## Measured (P5-W2 build evidence)

| Item | Value (measured at build/publish time) |
| --- | --- |
| Desktop bundle (deb) | 80,365,602 bytes (~76.7 MiB) |
| Desktop bundle (AppImage) | 116,792,135 bytes (~111.4 MiB) |
| Product web bundle | 27 modules, 226.48 kB (vite build) |
| Install footprint | ≈ deb size on disk (Electron baseline) |
| Runtime memory | Electron main + renderer baseline (single window, product-locked; no substrate modules loaded — the P5-W2 build kept the renderer small precisely because it has zero `@zcode/*` deps) |
| Distribution cost | GitHub Releases hosting — free tier, anonymous downloads verified |

## Estimated (labeled ESTIMATE)

- **State growth per journey event** — ESTIMATE: the 13-step drill
  journey produced a 23,342-byte log (≈1.8 KB/event average; the
  P5-W1 drill's measured fixture). A heavy user running hundreds of
  commands/day stays in the low-MB/year band. Verify per release with
  `scripts/ops/restore-drill.mjs` output (snapshot bytes are recorded).
- **Per-additional-user marginal cost** — ESTIMATE: zero product-side
  (each user is their own node; no server). The only marginal cost is
  release-channel bandwidth (GitHub-hosted).

## UNKNOWN — BLOCKED-ON-OPERATOR (ADR-0004)

These cannot be bounded until the operator selects the live
provider/hardware and payment rail (P4-W2):

- Live provider integration costs (per-provider account/plan fees,
  API costs, traffic costs)
- Payment-rail fees (per-transaction or recurring, per rail)
- Live hardware costs (target devices/topology from the provider plan)
- Any server-side hosting beyond the control plane (and the
  acceptance law already states: serverless control-plane hosting is
  NOT evidence that persistent packet forwarding is deployed)

This document will gain a measured live-cost table ONLY from real
integration evidence after the operator unblocks P4-W2 — estimates
before that would be fabrication.
