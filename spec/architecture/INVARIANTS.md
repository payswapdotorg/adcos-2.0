# ADCOS 2.0 Architecture Invariants

These are acceptance rules. Encode them as schema checks, architecture checks, and negative-proof tests where practical.

## Authority and evidence
1. Existing ADCOS owns canonical connectivity offers, eligibility, ConnectivityContract, ExecutionPlan, paths/sessions, usage evidence, assurance, and settlement references.
2. UI, cache, Lab model, Organization projection, or instance cannot write canonical state except through the owning public command boundary.
3. Provider-native topology, credentials, subscriber and radio/core state remain provider-owned and behind adapters.
4. Declaration, observation, commitment, attestation, derivation, and inference are distinct evidence classes with provenance and freshness.
5. UNKNOWN, STALE, DEGRADED, FAILED, REJECTED, and TERMINATED are distinct. Timeout does not prove an external action failed.
6. Simulation, synthetic fixture, catalog listing, model prediction, and marketing claim do not prove live capability.

## Cross-device
7. User/org principal, device, agent body, runtime instance, and resource are distinct identities.
8. Pairing and discovery are authenticated and scoped. Proximity, a shared network, or a shared account grants no command authority.
9. Receiver-side local policy and owner consent can deny every remote consequential action.
10. Every command/event is schema-versioned, bounded, correlated, fresh/expiring where applicable, authorized, and replay-protected.
11. State changes use durable inbox/outbox, deduplication, idempotent handling, bounded retries, acknowledgement and reconciliation. Never promise exactly-once transport.
12. Revocation and delegation expiry are enforced. Offline queues cannot extend permissions silently.
13. Discovery exposes only minimum necessary metadata. Relays do not acquire task, financial, or resource authority.
14. A coordination channel is not automatically a VPN or a general-purpose packet-forwarding capability.

## Resource provider and network
15. A resource is eligible only if owner authorization, technical compatibility, provider/operator terms, applicable laws and policy all permit the requested use.
16. Never bypass tethering, resale, radio, spectrum, service, or subscription restrictions.
17. Measurements state resource/path, method, time window, provenance and freshness; owner assertions are not measurements.
18. Different SIMs/operators are not assumed independent; shared failure domains are modeled or marked UNKNOWN.
19. Failover/optimization cannot violate hard security, privacy, budget, data cap, residency, or application constraints.
20. Owners can limit and revoke resource contribution, data, capacity, schedule, and beneficiaries.

## Lab and economy
21. Lab/AI proposes; deterministic policy, eligibility, authority, budget, consent and payment systems decide/commit.
22. Hard constraints cannot be traded away by a weighted reward function.
23. Group purchase requires an attributable real offer, explicit individual commitments, threshold/deadline, allocation, cancellation and failure outcomes.
24. Organization membership is not incorporation or blanket authority. Resource and financial mandates remain individually scoped.
25. Shared revenue/cost allocations are exact, versioned, auditable and reconciled. Estimated earnings are not settled earnings.
26. Upgrades show no-change baseline, costs, assumptions, confidence, risk and alternatives; purchases require appropriate approval.

## Engineering
27. No unreviewed upstream drift or dependency upgrade; preserve ZCode license/third-party notices.
28. Every work order has one owner, disjoint paths, prerequisites, outputs, tests, and committed evidence.
29. Parallel work starts only after boundaries/contracts are stable; shared-contract changes are serialized through TL.
30. Completion claims identify commits, commands, evidence, known limitations, and live-versus-simulated scope.
