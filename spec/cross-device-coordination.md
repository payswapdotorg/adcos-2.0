# Cross-Device Instance Coordination

## Goal

Independent ADCOS 2.0 instances on a phone, laptop, desktop, gateway, server or community node may collaborate to fulfill a bounded customer/provider intent. They remain distinct security principals with separate device capability and local execution authority.

## Supported patterns

- Explicitly enroll/link a user's or organization's instances.
- Discover minimal, permissioned capability and availability metadata.
- Delegate a specific task to an authorized instance.
- Exchange measured observations, diagnostics, provider offer references and results.
- Coordinate multiple steps, resource allocation and handoff for a task or provider Organization.
- Request gateway/relay service where separately authorized.
- Queue permitted work while offline and reconcile on reconnect.
- Aggregate independent results; record source, time, provenance and confidence.

## Identity and trust

Principal, Organization, device, agent body, runtime instance and connectivity resource are different objects. The stable Agent Body defines capability/role; an Instance is that body plus model/algorithm, runtime, device, capability set, authority scope and current security state.

Pairing must be explicit and authenticated. Device-bound keys or approved platform credentials identify instances. Shared accounts, local network, proximity or Organization membership do not confer blanket access. Revocation must block new commands within the defined session/credential expiry behavior.

Discovery is opt-in or governed by an explicit policy; minimize location and capability metadata. Never broadcast private task payload, credentials, browsing history or raw customer traffic.

## Transport and routing

Use a replaceable public coordination port and established transports: authenticated TLS/QUIC, approved WebSocket/WebTransport, platform-native channels, authorized relays or ShareNet peer/gateway paths. Choose direct path when viable, relay when needed, and store-carry-forward only for intents permitting delay. Do not invent cryptography or presume native OS APIs expose arbitrary forwarding.

Control-plane task coordination is distinct from the connectivity data plane. A trusted message channel is not itself a VPN or general purpose gateway. Relays have only narrowly scoped forwarding authority.

## Message and task contract

As applicable, each message includes schema/version, event/command ID, sender and receiver instance IDs, principal/org scope, issue and expiry time, correlation and causation IDs, idempotency key, payload digest, authorization/delegation reference, policy/security epoch, and authenticated origin/signature provenance.

Before dispatch, validate identity, scope, schema, size, freshness/expiry, policy epoch, authorization, replay/duplicate status and local resource permissions. Unknown or malformed consequential commands fail closed.

Use durable inbox/outbox, ack, bounded retries, idempotent handlers, duplicate suppression, ordering/version rules, dead-letter queue and reconciliation. Do not promise exactly-once transport; provide effectively-once domain effects through idempotency and authoritative reads. A task has owner/lease, deadline, retry budget, cancellation semantics and evidence requirements. A stale former owner cannot commit after a lease handoff.

Offline queues have quotas and expiry. Delegation cannot outlive authorization. Expired or ambiguous effects require renewed authorization or reconciliation, never blind replay.

## Acceptance cases

1. Two separately running instances authenticate, discover a scoped capability and exchange a bounded task.
2. Unpaired, revoked, expired, replayed, malformed and out-of-scope messages are rejected.
3. Duplicate, reordered and delayed deliveries yield no duplicate effects and converge after reconciliation.
4. Offline reconnect executes only permitted unexpired tasks; expired commands require renewed authorization.
5. An owner revokes one instance and proves future consequential commands are blocked.
6. Local policy can deny requests from otherwise trusted peers.
7. Direct path and relay loss produce observable fallback/degraded states; no silent authority transfer.
8. A test spans two independent processes, then physical devices. Mock-only tests cannot claim cross-device support.
