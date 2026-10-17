# ADCOS health contracts (P5-W1)

What HEALTHY means, per shipped surface — and how it is probed
(`scripts/ops/health-probe.mjs`).

## The UNKNOWN/STALE/DEGRADED law (INVARIANTS #5)

The product renders UNKNOWN / STALE / DEGRADED as their real statuses —
never masked as healthy. Operations inherits the same law: a probe
result is one of `HEALTHY | UNKNOWN | STALE | DEGRADED`, and an honest
UNKNOWN always beats a fabricated HEALTHY.

## Surface 1 — the desktop app (installed product)

| Signal | HEALTHY | Detection |
| --- | --- | --- |
| Main process | single instance running (lock held), window created | OS process list / single-instance lock behavior |
| Renderer | product surface loaded (file:// assets, no error overlay) | window content — operator visual check; headless smoke at release gate |
| IPC bridge | a `session` request returns principal + roles + persistence stats | bridge round-trip (the P5-W2 battery asserts this wiring) |
| Durable store | state JSONL exists, every line parses, service rehydrates | `health-probe.mjs --state <path>` |

Local-first: the product keeps a small append-only `main.log` under
`userData` (crash-pad hygiene, P5-W2); monitoring is local inspection —
no telemetry egress exists by construction (product lock: no remote
URLs).

## Surface 2 — the surfaces service (control-plane state)

| Signal | HEALTHY | Detection |
| --- | --- | --- |
| State file | exists, non-empty, every line well-formed JSON | probe parses each line |
| Replay-on-load | a NEW service instance over the log reconstructs views | probe rehydrates + reads `durability()` |
| Write path | append succeeds before ack (write-before-ack) | the restore drill asserts it; a failing append surfaces as a refused command (never a silent loss) |
| Clock | injected clock present (no ambient time) | by construction; composition reviewed in `apps/desktop-adcos/src/main/index.ts` |

## Surface 3 — the release channel (distribution)

| Signal | HEALTHY | Detection |
| --- | --- | --- |
| Assets reachable | deb + AppImage + SHA256SUMS + INSTALL-UBUNTU.md return HTTP 200 ANONYMOUS | release gate step (curl, no auth) |
| Integrity | asset sha256 matches SHA256SUMS.md | release gate step (download + sha256sum -c style check) |
| Product lock | shipped archive contains zero zcode entries | asar listing check (P5-W2 evidence) |

## Honest scope note

This is a **single-node desktop product**: there is no cluster
telemetry, no scrape endpoint, no metrics pipeline — claiming one would
be fabrication. Health is: local probes (this file's tooling) + release-
channel checks (at gate time) + the operator's eyes on the UI. When the
operator unblocks live-provider deployment (ADR-0004 / P4-W2), provider
health contracts will be ADDED here from real integration evidence —
not before.
