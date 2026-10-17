# P5-W1 — Cost Bounds (`ops/costs/`)

Owner: lane p5w1 (work order `## P5-W1`). Scope: the SHIPPED product
(P5-W2 desktop app). Every number below is either **MEASURED** (real
command, real source cited) or **ESTIMATE** (labeled) or **UNKNOWN**
(BLOCKED-ON-OPERATOR, ADR-0004 badge — never estimated as if known).

## Fixed per-install footprint (MEASURED, P5-W2 release evidence)

| Item | Value | Source |
| --- | --- | --- |
| Renderer bundle (JS) | 226.48 kB | P5-W2 gate transcript: `vite build` (27 modules) |
| Renderer bundle (CSS) | 19.84 kB | P5-W2 gate transcript |
| Ubuntu deb artifact | 80,365,602 B | P5-W2 release (`adcos-desktop_1.0.0_amd64.deb`) |
| AppImage artifact | 116,792,135 B | P5-W2 release (`adcos-desktop-1.0.0-x86_64.AppImage`) |
| Shipped files in asar | 835 (all `@adcos/*` or `out/*`) | P5-W2 product-lock verification (0 zcode entries) |
| deb runtime dependencies | libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libsecret-1-0, libgbm1, libasound2 | `dpkg -I` on the released deb |

## Per-additional-user marginal cost: state growth (MEASURED on the drill fixture)

The durable store appends ONE full state snapshot per applied command.
Measured on the P5-W1 restore-drill fixture (10 commands, one principal,
one resource, one full journey to PLACE_ORDER):

| Metric | Value |
| --- | --- |
| Total log after 10 commands | 15,764 B (10 snapshots) |
| First snapshot (1 resource row) | 416 B |
| Last snapshot (full journey state) | 2,596 B |
| Mean snapshot size | 1,576.4 B |
| Growth first → last snapshot | +524% |

**ESTIMATE (labeled):** a single-user journey of ~10 applied commands
costs ~16 kB of durable state; a heavy user at ~1,000 commands with a
~10-row steady-state view costs on the order of single-digit MB, growing
roughly linearly in command count at the current snapshot size
(~2.6 kB/snapshot at 10-row state). Snapshot size grows with ROW COUNT
(full-state snapshots), and cumulative log size grows quadratically in
command count at fixed row count (snapshot amplification — the recorded
P4-W1 round-2 risk #1; compaction is a proposed, unimplemented
contract-shape change). Beyond ~10³–10⁴ snapshots the dominant operational
costs become fold time on restart and backup copy size — the round-3 L5
load scenario is the vehicle to measure those; NOT measured here.

Memory/CPU bounds of the running app: **NOT measured in-sandbox** (the
P5-W2 smoke ran under Xvfb/`--disable-gpu` without RSS instrumentation) —
PENDING-station: run the packaged app on the operator Ubuntu machine and
record `pidstat -p <main-pid> 1 10` (RSS/CPU at idle + during enroll).

## Cost structure (what the shipped product actually costs to run)

- **Compute**: single local process per user; no server fleet, no
  control-plane hosting, no database service. Serverless/staging evidence
  is NOT forwarding evidence (work-order acceptance law).
- **Storage**: the single JSONL above + `main.log` (append-only) +
  Chromium caches.
- **Distribution**: GitHub Releases bandwidth (deb + AppImage per
  download; ~80–117 MB per install) — borne by the release channel, no
  CDN claimed.

## UNKNOWN — BLOCKED-ON-OPERATOR (ADR-0004 badge; never estimated as if known)

| Item | Status |
| --- | --- |
| Live provider costs (upstream data/SIM/infrastructure pricing, contribution earnings) | **UNKNOWN — BLOCKED-ON-OPERATOR** (P4-W2: live provider evidence requires the operator's authorized combinations; estimates are separated from actuals and actuals require live integration that does not exist) |
| Payment rail fees (per-transaction cost, settlement latency, refund costs) | **UNKNOWN — BLOCKED-ON-OPERATOR** (ADR-0004: no rail is selected; opaque references carry no fee semantics) |
| Provider-hardware unit economics (P4-W2 lane: measured direct/relay/failover behavior) | **UNKNOWN — BLOCKED-ON-OPERATOR** |

None of the three rows above has ever been measured in this repository;
any number attached to them before the operator decision lands would be
fabrication. They are cost BOUNDS the operator will set, not values this
lane asserts.

## Cost envelope summary (honest)

- Marginal cost per additional user ≈ one local app install (disk: deb
  footprint + state growth per the measured table; no per-user server
  cost exists in the shipped model).
- The product's cost ceiling is bounded by local resources; the
  unbounded axes are (a) log growth per user (measured above; no
  compaction on the frozen surface) and (b) the ADR-0004 lane items,
  which are UNKNOWN until the operator decides.
