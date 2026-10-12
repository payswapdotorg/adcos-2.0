# Connectivity Resource Provider Domain

## Purpose and resource classes

Enable people and organizations to contribute connectivity resources at the lowest practical infrastructure cost and expand capability incrementally.

Resource classes include supported phone/computer plus existing connection; home/business router, hotspot, mini-PC or Linux gateway; cellular modem/SIM and multi-WAN; existing Wi-Fi/access points; fixed/wireless/fiber handoff; satellite terminal and local gateway; towers, antennas, backhaul; authorized wholesale or network services.

A listed class does not prove a specific device/OS/operator can forward the requested traffic. Platform/provider adapter evidence decides compatibility.

## Provider workflow

1. Authenticate the owner/principal; register resource ID and its distinct device-instance ID.
2. Declare capability, schedule, location precision policy, data/capacity/budget limit, allowed beneficiaries, privacy profile, price/compensation preference, and pause/revoke policy.
3. Test technical feasibility and operator/jurisdictional constraints; reject unsupported or prohibited use.
4. Measure baseline and classify data as OWNER_DECLARATION, OBSERVATION, PROVIDER_COMMITMENT, or DERIVED.
5. Publish eligible offers through canonical ADCOS provider boundaries only when the resource may lawfully and technically serve the proposed use.
6. Accept a bounded connectivity contract/lease through ADCOS before serving committed requests.
7. Measure service/usage, reconcile discrepancies, and link evidence to commercial allocations and support incidents.
8. Let the owner pause or revoke future use immediately; handle active contract termination through explicit accepted contract semantics.

## Resource projection

Track stable resource ID, owner principal reference, device/instance reference, resource type, capability/version, supported modes, declared availability, limits, policy/jurisdiction inputs, status/freshness, evidence references and revocation state. Keep provider-native credentials out of this object.

Potential capabilities include local access, gateway/forwarding, relay, health measurement, multi-WAN, tunnel endpoint, or store-carry-forward. Declared and observed capability are separate.

## Low-infrastructure policy

- Do not require MikroTik or dedicated hotspot hardware just to register/evaluate an existing resource.
- Prefer supported OS sharing, existing hardware, native APIs, open standards, and software gateway paths when they satisfy the intent.
- Use a supported Linux gateway/router when device-wide forwarding, TUN, policy routing, isolation or multi-WAN is unavailable on an ordinary device.
- Never promise universal phone/browser forwarding. Disclose platform, plan and carrier limitations and give a supported fallback.
- Hardware investments need a Lab comparison against no change, with costs, demand, reliability, utilization, risk and payback assumptions.
- Owners retain personal-use capacity, data/time/concurrency caps, allowed beneficiaries, pause and revoke controls.
- Respect operator terms, tethering/resale, data-cap/fair-use rules, spectrum/equipment permits, privacy and laws.

## Measurements, compensation and failures

Measure appropriate reachability, uptime, latency, loss, jitter, throughput, data usage and application reachability, scoped to method/path/time. Minimize metadata; avoid payload inspection if aggregate evidence suffices.

Compensation defines service unit, measurement authority, dedupe, credit/penalty, dispute, reversal and reconciliation rules. A resource being online is not proof of useful delivery. Label forecast, accrued, disputed and settled earning states separately.

Handle quota exhaustion, throttling, captive portals, device sleep/power constraints, radio change, NAT, stale measurement, relay failure, owner revocation and provider restrictions. Report degraded/unknown/failed honestly and use accepted contract recovery.
