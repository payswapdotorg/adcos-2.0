# Upstream ZCode Baseline and Update Policy

## Pinned baseline

- Repository: https://github.com/zai-org/ZCode
- Baseline commit: 29628c9acdb81b703bbd4080c207a0e7ce5e276e
- Baseline version: v3.14.3
- ADCOS 2.0 main initially matches that upstream commit.
- The inherited root package declares Node >=24 and pnpm 10.33.2; mise.toml is the toolchain version authority.
- Preserve LICENSE and THIRD-PARTY-NOTICES.md, updating notices when dependency or upstream source changes require it.

## Update policy

Do not silently track upstream main, upgrade dependencies, import broad refactors, or rename imported packages just to cosmetically rebrand the repository.

Before an upstream update: fetch and record current commit/release; compare with the pin; classify changes to packages, public contracts, generated assets, dependencies and platform behavior; choose a minimal reviewable update or deliberate rebase; run baseline/touched-surface regressions; record accepted pin, dropped patches, conflicts and rollback in an ADR and current-state.

On 2026-10-12 the live upstream main was observed at commit aac4755666d09fdcd70272fcf063c077a639015f, described upstream as v3.15.1. This timestamped observation is not permission to upgrade automatically; recheck before acting.

Treat ZCode as the inherited application substrate. Add ADCOS features behind stable modules and public packages wherever possible. Do not break inherited builds to accelerate product identity changes.
