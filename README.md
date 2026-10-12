# ADCOS 2.0 — Connectivity OS

ADCOS 2.0 is a ZCode-derived Connectivity Operating System for customers, individual resource contributors, community/provider Organizations, and connectivity applications.

**Status:** this commit establishes the project architecture and work governance. It does not assert that the described product capabilities are implemented or live-verified.

## Product thesis

Users express a connectivity outcome. The platform discovers eligible resources and real provider offers, recommends or coordinates an appropriate provider Organization, arranges authorized connectivity, measures delivery, and continuously looks for safer, more reliable, or less expensive approaches.

People should be able to begin with supported existing devices/connections, then add routers, access points, multiple SIMs, satellite, towers, or other infrastructure only where technically, commercially, and legally appropriate. Instances of the software on different devices must securely collaborate when needed while every device and resource retains its own authorization boundary.

## Product capabilities

- Connectivity intent, offer exchange, eligibility, contracts, execution plans, usage evidence, assurance, and failover through the canonical ADCOS domain.
- Permissioned connectivity resource contribution, from supported low-infrastructure device sharing to professional network infrastructure.
- Secure cross-device instance cooperation: authenticated identity, scoped delegation, revocation, durable messaging, idempotency, and offline reconciliation.
- Integration boundaries for ADCOS, ShareNet, and RoamLink; no competing connectivity-contract or routing authority.
- A Reality Engineering Lab that compares strategies, Organizations, provider upgrades, and investment opportunities.
- Group provider Organizations and collective purchasing for eligible data plans, upstream bandwidth, hardware, backhaul, maintenance, and infrastructure.
- Customer/provider/admin/developer experiences on the inherited ZCode Web/Desktop/CLI/agent substrate.

## Repository source of truth

Conversation history is non-authoritative. Read in this order:

1. [Architecture lock](spec/architecture/ADCOS-2.0.md)
2. [Invariants](spec/architecture/INVARIANTS.md)
3. [Authority model](spec/authority-model.md)
4. [Resource provider model](spec/connectivity-resource-provider.md)
5. [Cross-device coordination](spec/cross-device-coordination.md)
6. [Reality Engineering Lab](spec/reality-lab.md)
7. [Group Organizations and purchasing](spec/group-organizations-and-purchasing.md)
8. [Dependency graph](spec/dependency-graph.md)
9. [Work orders](spec/work-orders.md)
10. [Current state](spec/development-state/current-state.json)
11. [ZCode lineage](spec/UPSTREAM-ZCODE.md)
12. [Tech Lead handoff](docs/LLM-ARCHITECT-HANDOFF.md)
13. [Reference register](docs/research/ARCHITECTURE-REFERENCES.md)

## Upstream substrate

This repo inherits ZCode v3.14.3 at commit 29628c9acdb81b703bbd4080c207a0e7ce5e276e. Preserve upstream history, licensing and third-party notices. See spec/UPSTREAM-ZCODE.md; upstream updates require explicit review.

## Development and evidence

Use the toolchain pinned in mise.toml and package.json. From the repository root, baseline commands include pnpm bootstrap, pnpm dev:web, pnpm dev:desktop, pnpm typecheck, pnpm lint, pnpm fmt:check, and node scripts/check-project-spec.mjs.

Run commands actually supported by the inherited workspace. Record real exit codes, tests, limitations, and commit evidence. Do not describe a mock, simulation, catalog listing, user declaration, or vendor claim as proof of live connectivity. A capability is complete only after the work-order acceptance evidence is committed.
