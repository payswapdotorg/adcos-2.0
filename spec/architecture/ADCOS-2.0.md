# ADCOS 2.0 Architecture Lock

Status: FROZEN FOR IMPLEMENTATION — version adcos-2.0-foundation-2026-10-12.

This is the normative product architecture baseline. It records intent and boundaries, not an assertion that implementations or live-network proof already exist.

## Mission

Make connectivity an outcome-oriented, programmable service and an open resource economy. Individuals, devices, businesses, communities, network operators, and applications can request, supply, combine, monitor, and improve connectivity under explicit permission and observable commitments.

Users can begin with supported existing devices and connections; add multi-WAN routers, SIMs, access points, satellite, towers, backhaul, or other equipment only where it is worthwhile and permitted; aggregate demand; form provider Organizations; and use the Reality Engineering Lab to identify better strategies.

Instances of the software on different devices securely cooperate when needed to fulfill bounded user or organizational intents without erasing device-local authority.

## Upstream and integration boundaries

ZCode supplies the inherited Web/Desktop/CLI/agent substrate, model/tool integrations, workflows, RPC, and cross-platform abstractions. Preserve its upstream lineage and notices; see spec/UPSTREAM-ZCODE.md.

- payswapdotorg/ADCOS is the canonical connectivity exchange and execution domain.
- payswapdotorg/ShareNet owns its peer/gateway transport, content and routing semantics, opportunistic/store-carry-forward behavior, and contribution accounting.
- payswapdotorg/RoamLink provides experience/device-context and customer-operations patterns behind its own authority model.
- payswapdotorg/UniCom is the design reference for group-buy discovery and collective commerce.
- payswapdotorg/PaySwap-3.0 is the design reference for the Reality Engineering Lab, Organizations, opportunity discovery, economic execution graphs, and controlled learning.

Integrate through supported public contracts. Do not duplicate a sibling's authority or import its private internals. A necessary boundary change requires an ADR and a migration plan.

## Logical planes

1. Experience: customer, contributor, Organization member/admin, operator, and developer journeys on supported surfaces.
2. Identity and trust: principals, instance enrollment, membership, scoped delegation, policy epochs, and revocation.
3. Resource and capability: owner-authorized resources, device capabilities, observations, constraints, eligibility, and offers.
4. Connectivity exchange: intent, offer, eligibility, connectivity contract, execution plan, adapters, usage evidence, assurance, failover, settlement references through the canonical ADCOS boundary.
5. Cross-device coordination: authenticated instance channels, capability announcements, bounded task delegation, observations/evidence exchange, durable inbox/outbox, acknowledgements, lease/ownership transitions, and offline reconciliation.
6. Reality Engineering Lab: candidate Strategy/Organization search, replay/counterfactuals, economic opportunities, group-provider formation, group purchasing, simulation, shadow/canary and learning.
7. Commercial: quotes and costs, group commitments, member allocation, invoice/payout projections, and external payment references. Actual money movement remains with the appropriate authorized financial system.
8. Operations and assurance: telemetry, freshness, incidents, audit, support, recovery, and proof-bearing release gates.

These are logical boundaries, not a requirement to run eight separate services.

## Canonical lifecycle

Intent -> capability/resource discovery -> eligible offers -> deterministic policy and authorization -> connectivity contract at ADCOS -> execution plan -> provider/device execution -> measured delivery/usage -> assurance/replan/recovery -> commercial reconciliation -> Lab evaluation and learning.

Product projections cannot become competing canonical state. A recommendation or accepted offer is not active connectivity. A timeout after a potentially effective external action requires reconciliation before retry.

## Resource contribution

Support levels from a phone/computer and existing connection, through home router/hotspot/compatible Linux gateway, to multiple SIMs, multi-WAN, access points, satellite, fixed wireless, tower/backhaul and professional network services. Select the lowest-cost supported option that satisfies the user's hard requirements.

A device/OS/operator combination may not support transparent forwarding. The UX must report verified support, limitations, and alternatives; never imply every browser or ordinary iOS app can become a general-purpose router. Owner consent, quotas, usage boundaries, revocation, operator terms and applicable laws are mandatory.

## Cross-device cooperation

A software instance is distinct from a user, organization, agent body, and device. Each instance has its own identity, capabilities, security state, owner, policy scope, and revocation status. Linked account or Organization membership does not provide blanket trust.

Use existing authenticated transports and adapters such as supported TLS/QUIC or WebSocket/WebTransport channels, platform-native peer channels, approved relays, or ShareNet paths. Direct path, authorized relay, and store-carry-forward are different delivery modes; the latter is permitted only for intents that tolerate delay. Do not invent a custom cryptographic protocol or confuse task-control messages with IP packet forwarding.

Every remote command validates sender, recipient, scope, schema/version, freshness/expiry, authorization, policy epoch, deduplication/replay state, and local resource permission. Use durable inbox/outbox, acknowledgements, idempotent effects, bounded retry, dead letters, and reconciliation. Do not promise global exactly-once delivery. Expired delegated work must not execute offline without renewed authorization.

## Lab and economic coordination

The Lab searches provider choices, resource combinations, timing, task allocation, Strategy/Organization structures, group purchasing, higher-tier plans, additional independent links, and equipment investment. Keep a no-change baseline. Predictions require provenance, assumptions, costs, risk, confidence, expiry, and post-action measurement. Hard constraints cannot be overridden by learned scores.

Group provider Organizations and group purchases require explicit member consent, valid mandates, role/resource commitments, cost and revenue allocation, real attributed offers, minimum thresholds, deadlines, failure/exit/refund terms, and reconciliation. Group formation alone creates no legal incorporation or unlimited authority to bind members.

## Security and operations

Apply least privilege, tenant/resource isolation, revocable identity, auditability, abuse/rate controls, privacy minimization, secrets isolation, budget/data limits, rollback, and fail-closed authorization for consequential commands. Respect operator subscriptions, tethering/resale restrictions, spectrum and equipment rules, privacy, and jurisdictions.

Keep cloud control/UI separate from persistent edge data-plane forwarding. Low-cost serverless hosting may support control-plane APIs but must not be assumed to support always-on packet forwarding or tunnel termination.

## Acceptance and change control

A feature requires code, tests, public-boundary conformance, security/failure/stale/unknown/replay/revocation coverage as applicable, real UI verification, current-state evidence, and real-device/provider proof where claimed. Mock and simulation output is never evidence of physical delivery.

Architecture changes require an ADR in spec/adr/ with alternatives, risks, changed contracts/locks, migration, tests, and rollback. The TL accepts the ADR and updates this architecture, dependency graph, work orders, and current-state before dependent code continues.
