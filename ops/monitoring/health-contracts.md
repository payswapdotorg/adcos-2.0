# P5-W1 — Health & Monitoring Contracts (`ops/monitoring/`)

Owner: lane p5w1 (work order `## P5-W1`). Executable prober:
`scripts/ops/health-probe.mjs`. Alert catalog: [`alerts.md`](./alerts.md).

## What HEALTHY means, per shipped surface

### S1 — The desktop app (Electron, installed from deb/AppImage)

| Signal | HEALTHY means | How observed |
| --- | --- | --- |
| Main process up | the `adcos-desktop` process is running; single-instance lock held by exactly one process | OS process table (`pgrep -af adcos-desktop`); a second launch focuses the existing window instead of starting a new process |
| Renderer loaded | the product window shows the 7-panel shell (Identity, My resources, Reality Lab, Organizations, Group purchase, Role views, About) and the header carries the ADR-0004 badge | visible window; the App shows `ADCOS — Connectivity OS` title from `app.asar/out/renderer/index.html` (P5-W2 smoke evidence) |
| IPC bridge responsive | a bridge call (`session`) answers with the principal, roles, product version and durability stats; an `enrollResource` round-trip persists to the state file | any panel action (enroll, consent switch, identity switch) visibly updates state; the Identity panel shows live durability counters |
| Durable state plane | the state JSONL exists, every line parses, the service rehydrates over it | `node --import tsx scripts/ops/health-probe.mjs --desktop ~/.config/adcos-desktop` → verdict HEALTHY |

Honest limit (labeled): a STATIC probe cannot prove the main process is up
right now. Live liveness is operator-visible (window present, panels
respond). The probe covers the durable-state plane and the log plane
(`main.log` presence/mtime).

### S2 — The surfaces service (JSONL writable, replay-on-load consistent, clock injected)

| Signal | HEALTHY means | How observed |
| --- | --- | --- |
| JSONL writable | an applied command appends its snapshot BEFORE acknowledgement; the log grows by exactly one line per applied command | drill check "write-before-ack" (`scripts/ops/restore-drill.mjs`); probe scan stats |
| Replay-on-load consistent | constructing the service re-reads and folds the log; the fold reproduces the exact pre-restart views; torn tails counted and skipped, never trusted | drill phases verify-reopen / corrupt-torn-tail; probe rehydration check (constructor fold over a temp copy) |
| Clock injected | the domain never reads ambient time — the deployment injects `now` at construction | contract law (ops/environments/README.md); code inspection of `createSurfacesService` composition; FIXED clock in every drill/test |
| Role config governs, not state | operator/developer views fail closed for unconfigured principals, across restarts and restores | drill check "role gating fails closed after restore"; probe role-query check |

### S3 — The release channel (GitHub Release `adcos-desktop-v*`)

| Signal | HEALTHY means | How observed |
| --- | --- | --- |
| Assets anonymously reachable | deb + AppImage + SHA256SUMS fetch without credentials (HTTP 200) | `node --import tsx scripts/ops/health-probe.mjs --release-channel [tag]` |
| Integrity published | SHA256SUMS.md lists every asset; installers verify against it | `sha256sum -c SHA256SUMS.md` (operator runbook) |

## The UNKNOWN / STALE / DEGRADED triad → operational signals

INVARIANTS #5: UNKNOWN, STALE, DEGRADED, FAILED, REJECTED, TERMINATED are
distinct; timeout does not prove an external action failed. The product
surfaces these states as themselves (never masked as success); operations
must read them the same way.

| Domain state | Meaning in the product | Operational signal (what the operator sees) | Response |
| --- | --- | --- | --- |
| **UNKNOWN** | no observation has ever been recorded for the resource — absence of evidence, NOT evidence of failure | resource card shows `UNKNOWN` chip (fuchsia); `status: UNKNOWN` in the persisted observation | benign — record an observation; no alert |
| **STALE** | the newest observation is older than the freshness policy | `STALE` chip on the resource card | schedule re-observation; alert A-4 if fleet-wide |
| **DEGRADED** | the resource still shares but its observed quality dropped below its declared capability | `DEGRADED` chip (orange) | check the physical device; notify the contributing owner |
| FAILED / REJECTED / TERMINATED | terminal or refused outcomes (revocation, expiry, refusal) | rose chips; refusal reasons in the UI error banner | no retry theater: a REFUSED command is a domain answer, not an outage |

**Store-plane mapping** (probe verdicts — distinct, never masked):
- `HEALTHY` — every line parses; last line well-formed; constructor fold
  matches the scan; role query answered.
- `FRESH` — no state file/lines yet (first run). NOT an error.
- `DEGRADED` — torn/corrupt tail lines detected AND skipped (the fold still
  reproduces the last intact snapshot; the tail is reported, never
  trusted). Exit code 2 — investigate, but the service self-heals
  (drill-proven).
- `UNHEALTHY` — unreadable file, zero foldable snapshots, or the
  constructor fold disagrees with the scan. Exit code 1 — restore per
  `ops/drills/restore-drill.md`.

**Process-plane mapping**: app not running = UNKNOWN (nothing asserted);
app running but bridge unresponsive = DEGRADED; app crash-looping
(single-instance lock flapping) = FAILED.

**Provider-plane**: any live-provider signal is UNKNOWN by construction —
BLOCKED-ON-OPERATOR (ADR-0004/P4-W2). No provider liveness is claimed,
monitored or inferred from timeouts. Monitoring never invents a green.

## Local-first monitoring doctrine (honest scope)

The shipped product is a SINGLE-NODE desktop application. There is no
cluster, no telemetry pipeline, and none is claimed. Monitoring is:

1. **Local state plane** — the health probe over the state file (usable by
   the operator and by the release gate against the drill fixture).
2. **Local log plane** — `main.log` (append-only, userData) plus the OS
   process table for liveness.
3. **Release channel** — anonymous reachability probing (S3).

What this doctrine explicitly does NOT include (labeled, not hidden): no
central telemetry, no crash aggregation service, no fleet dashboards, no
cluster metrics. If the operator later wants fleet monitoring, that is a
new work order — not this one.
