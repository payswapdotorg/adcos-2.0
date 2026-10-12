# Test-Harness Plan — Cross-Device Coordination and Group-Purchase Automation — ADCOS 2.0 (P0-W3)

Status: RESEARCH ARTIFACT — a design for automation that P2-W2 (instance coordination,
resources, integration) and P2-W3 (Lab, group economics) will build and own. **No harness code
exists in this repository at baseline**, and this work order creates none (documentation and
research only). The plan is written against the pinned ZCode v3.14.3 substrate actually
inspected in this checkout, so P2 lanes can reuse inherited tooling instead of inventing it.

## 1. Objective and scope

Automate, before any physical device is involved:

1. **Cross-device coordination lifecycle** (spec/cross-device-coordination.md): enrollment,
   pairing, capability discovery, delegated tasks, durable inbox/outbox, acks, retries,
   dedup, offline queues with expiry, revocation, lease handoff — including every negative
   case (unpaired/revoked/expired/replayed/malformed/out-of-scope; duplicate/reorder/delay;
   local denial; path-loss degradation).
2. **Group-purchase lifecycle** (spec/group-organizations-and-purchasing.md): the full state
   machine DISCOVERED → … → RECONCILED plus failure states, with authoritative event/evidence
   transitions, member mandates, thresholds, allocation math, duplicate-order prevention, and
   UNKNOWN-outcome reconciliation.

The harness must produce evidence a TL can audit: deterministic, reproducible, with logged
provenance and labeled evidence class (MOCK/SIMULATION per proof-plan.md — these tests never
claim physical or live-provider proof).

## 2. Where it plugs into the inherited substrate's test tooling

Observed substrate facts that constrain the design (all inspected at this checkout):

- **Test runner at the pin is `node:test` + `node:assert/strict`** — the only test files in
  the root workspace are `packages/services/test/*.test.ts` (3 files) and
  `packages/ui/test/*.test.ts` (1 file), all using `node:test`. There is **no vitest/jest at
  the root workspace**; installing one is a root-manifest change that must be serialized
  through the TL (dependency-graph.md §"Safe concurrency" rule 2).
  → **Decision for the plan: P2 lanes write harness tests with `node:test` first**; a
  per-package vitest addition (the pattern UniCom/PaySwap/RoamLink all use) is a deliberate,
  serialized choice later, not an assumption.
- **The RPC package ships runnable multi-process examples** — `packages/rpc/examples/
  01-basic-ipc.ts` … `04-remote-connection.ts` (package.json `demo:*` scripts). Example 04
  demonstrates exactly the remote-connection shape a two-instance harness needs.
- **Network impairment primitive exists**: `getDelayedChannel` is a public export of
  `@zcode/rpc` (`packages/rpc/src/index.ts`, from `channels.ts` / `delayedChannel.ts`) — a
  delay-injecting channel wrapper usable for reorder/delay simulation at the channel layer.
- **Network telemetry middleware exists**: `NetworkTelemetryChannelServer/Client` +
  `NetworkObservation` (`packages/rpc/src/network-telemetry-middleware.ts`) — the observation
  hook a harness uses to assert message-level behavior.
- **The server speaks HTTP + WebSocket** with the RPC stack on top (`packages/server/src/
  http.ts` wraps `ws` into `ISocket`/SocketProtocol), and `@zcode/client` provides
  `connectViaWebSocket` (`packages/client/src/websocket.ts`). A two-process harness can use
  real sockets without new dependencies.
- **Real remote backends exist for later stages**: `packages/server/src/remote/` (SSH, Docker,
  WSL, local backends with handshake + deploy machinery) and `harness/remote/` (Dockerfile +
  build.sh for an SSH-server container; README documents `docker run -d -p 2222:22` +
  `ssh-copy-id`). These are the natural escalation from two local processes to
  container-isolated instances.
- **Existing test style**: `packages/services/test/providerConfigMigration.test.ts` shows the
  house pattern — `node:test` + `node:assert/strict`, tmpdir fixtures via `node:fs/promises`,
  no framework magic. The harness should follow it.

## 3. Harness design — cross-device coordination

### 3.1 Two-process / multi-instance topology

```
harness/coordination/            (proposed P2-W2 location; NOT created in this work order)
  spawn.ts        — child_process.spawn wrapper: each instance = `node --import tsx <entry>`
                    with its own: data dir (tmpdir), port (ephemeral, conflict-checked),
                    instance identity (deterministic test key material), env config
  driver.ts       — test-side client using @zcode/client connectViaWebSocket to each instance
  topology/       — direct.ts (A↔B), relay.ts (A→R→B with a scoped relay process),
                    partitioned.ts (kill -STOP / firewall-simulating proxy between peers)
  assertions.ts   — journal-diff helpers: state digests, inbox/outbox counters, typed errors
```

- **Instance identity**: deterministic Ed25519 keypairs from fixed seeds (never the
  machine keychain). ShareNet's `adcos_test_server --provider-seed` demonstrates the
  deterministic-identity pattern; PaySwap's "no randomness, no UUIDs, injected clock"
  discipline is the rule to copy.
- **Real persistence per instance**: each instance gets its own sqlite/journal dir under a
  tmpdir; tests assert across restarts (offline queue durability is only provable with real
  restarts: `child.kill()` + respawn + journal replay).
- **Escalation ladder inside CI**:
  1. two local processes, loopback sockets (default; runs on every push);
  2. N≥3 processes with one relay process (relay-authority negative tests);
  3. (opt-in, docker-capable runners only) two containerized instances via the inherited
     `harness/remote/` SSH-container pattern or `packages/server/src/remote/docker-backend.ts`
     — real namespace isolation, still CI, still not "physical devices".

### 3.2 Deterministic simulation of offline / replay / expiry

- **Virtual clock seam**: every coordination component must accept an injected clock
  (the substrate already does this pattern-wise — e.g. PaySwap `DeterministicClock`
  "for tests/replay"; ADCOS `developerapi` "the ONLY time source is the injected clock
  seam"). The harness advances time deterministically:
  - *offline*: pause delivery (partitioned topology) + advance clock past expiry → assert
    queue entries transition to EXPIRED and are refused on reconnect (cross-device
    §Acceptance case 4);
  - *replay*: capture wire frames (via NetworkObservation sink), re-send captured frames →
    assert idempotent-effect digests and typed REPLAY outcomes, never duplicate effects;
  - *reorder/delay*: wrap channels in the inherited `getDelayedChannel` with per-message
    delays and a shuffle function → assert convergence + dedup counters (Acceptance case 3);
  - *duplicate*: driver re-sends with same idempotency key and correlation ID → exactly-one
    domain effect.
- **Fault-injecting transport proxy**: a small loopback TCP/WS proxy in the harness that can
  drop/duplicate/reorder/corrupt/close-without-reply, modeled on ShareNet's
  `adcos_test_server --fault 503:N|drop:N|garbage:N|tamper_sig:N|unsigned:N` vocabulary.
  Malformed/unknown consequential commands must fail closed at the receiver (Acceptance
  case 2).
- **Lease/ownership transition**: two owners race a task after lease handoff — assert the
  stale owner's commit is rejected (cross-device §Message and task contract).

### 3.3 Fixture strategy

- **Journal-driven golden fixtures**: a canonical scenario = ordered command/event script +
  expected final state digest + expected typed outcomes. Stored as versioned JSON fixtures;
  the runner emits actual journals and diffs them. Replay of the same script must be
  byte-stable (deterministic ids, injected clock — same discipline as ADCOS's
  content-derived ids).
- **Negative fixtures as first-class**: one file per negative case (revoked sender, expired
  delegation, wrong policy epoch, oversize payload, bad signature, unknown schema version,
  cross-scope correlation). The RoamLink conformance pattern — toggleable violations via env
  var (`ROAMLINK_CONFORMANCE_VIOLATION=<LOCK-ID>`, `tests/conformance/`) — is the model for
  wiring these into a gate that fails red when a violation is *not* rejected.
- **Instance/identity fixtures**: fixed seeds, fixed policy epochs, fixed revocation
  timelines; no machine-dependent material ever enters a fixture.

## 4. Harness design — group-purchase lifecycle

### 4.1 State-machine walker (T1, pure)

- A generic walker over the P1-W1 state model: for every legal transition, a positive
  scenario; for every illegal transition (e.g., ORDERED before THRESHOLD_MET, COMMITMENT
  after expiry, unauthorized FULFILLED), a negative fixture asserting typed rejection.
  UniCom's `packages/commerce/src/test/state-machines.test.ts` (walking every implemented
  machine) and `groupbuy-formation-machine.test.ts` are the proven pattern; the semantic
  mapping to our states (G5 in the capability inventory) is required, not name reuse.
- **Mandate/consent fixtures**: members with scoped/expired/revoked mandates; withdrawal
  before and after formation; refusal handling per stated terms.
- **Allocation math fixtures**: exact integer-minor-unit allocation across members
  (including indivisible-remainder cases), shortfall/partial-fulfillment splits summing
  exactly, refund reversals restoring balances bit-exactly. Deterministic, no floats
  (INVARIANTS-style: UniCom invariant #14 "Money never uses floating-point arithmetic").
- **Offer provenance fixtures**: offers with provenance/expiry; expired offer acceptance
  rejected; hypothetical/estimate offers never presented as live quotes (negative UI-level
  fixture later at P2-W1).

### 4.2 Scenario harness (T1→T2)

- **Group scenario runner**: N simulated members + one organizer + a fake offer source,
  driven by a scripted timeline with a virtual clock. Every case from proof-plan.md §Group
  purchasing (PC-GB-01..08) is a script: happy path, threshold-not-met, expiry (offer vs
  commitment deadline), withdrawal, duplicate submission (same idempotency key → REPLAY/
  CONFLICT), UNKNOWN payment outcome (fault-injected payment boundary returning ambiguous
  result → assert retry blocked until reconciliation resolves), partial fulfillment
  (allocation reconciliation), cancellation/refund.
- **UNKNOWN-outcome injection**: the fake payment boundary must be able to return
  CONFIRMED / FAILED / **UNKNOWN** (timeout after potentially-effective action) — the
  PaySwap provider-runtime execution-bridge envelope (CONFIRMED/UNKNOWN/FAILED +
  reconcile-before-retry) is the reference semantics. Reconciliation-before-retry is
  assertable only if the boundary can produce UNKNOWN on demand.
- **Composed two-instance run (feeds P3-W1)**: a group scenario where commitments are
  collected via the cross-device harness (members are separate instances exchanging
  delegation-scoped commitment commands) — exercises the interaction of the two lifecycles
  (delegation expiry vs commitment windows) before any UI exists.

## 5. Integration-boundary doubles for CI

Before real integration (P2-W2), the harness needs doubles of the two live boundaries we
will consume:

- **ADCOS developer API double**: the sibling's own deterministic sandbox is the honest
  first target (`sib/ADCOS@d7db35e:api/index.py` `build_sandbox_app` — pure-stdlib ASGI,
  in-memory authorities). Running it as a CI sidecar gives real route/ header/ envelope
  semantics without production credentials; artifacts stay SANDBOX-PROVIDER-labeled.
  Additionally, RoamLink's `FakeAdcos` (`sib/RoamLink@2284134:packages/integration/test/
  fake-adcos.ts`) demonstrates the in-process double pattern for fast unit tiers.
- **ShareNet boundary double**: `sib/ShareNet@662fad6:connectivity-client/src/bin/
  adcos_test_server.rs` is a complete signing/fault-injecting stand-in for the ADCOS side of
  ShareNet's `ConnectivityPort` — the reference for our own double of the ShareNet side
  (signed observations with deterministic provider seeds, tamper/replay/unsigned faults).
  Note G-1: until the wire-adaptation decision lands, doubles test *semantics*, not the
  drifted wire.

## 6. Determinism requirements (non-negotiable for reproducible evidence)

1. Injected clock everywhere (no `Date.now()`/`setTimeout` drift in domain code under test).
2. Content-derived ids/digests (no `randomUUID()` in fixtures; the substrate's own
   `randomUUID` use in servers is fine — fixture paths must not depend on it).
3. Fixed ports allocation strategy: harness binds ephemeral ports and passes them via env —
   never hard-coded ports (house rule already visible in ShareNet's `--bind 127.0.0.1:0`).
4. Isolation per test: fresh tmpdir data dirs, fresh key material from seeds, no shared
   global state between processes.
5. Every run emits: scenario id, fixture version, code commit SHA, seed list, clock
   schedule, journal dumps, outcome digests — enough to re-run byte-identically (the
   reproducibility bar that P2-W3's "reproducible decisions for fixed evidence snapshot"
   acceptance will inherit).

## 7. Ownership and sequencing

| Piece | Owning work order | Notes |
|---|---|---|
| Cross-device two-process harness + fault proxy + fixtures | P2-W2 | Uses `@zcode/rpc` examples/delayed channel/telemetry middleware as substrate; node:test runner |
| Group-purchase walker + scenario runner + allocation fixtures | P2-W3 | Pure-domain first (T1); composed runs depend on P1-W1 types |
| ADCOS sandbox sidecar double | P2-W2 | From sibling's `api/index.py` deterministic sandbox; SANDBOX-PROVIDER label |
| ShareNet-side double | P2-W2 (after G-1) | Modeled on `adcos_test_server.rs` |
| Container-isolated multi-instance tier | P2-W2 → P3-W1 | Inherited `harness/remote/` Docker pattern + `docker-backend.ts` |
| Browser-journey tier | P2-W1 | e2e-test-bridge pattern (`substrate:packages/shared/src/e2e-test-bridge.ts`); persisted-state assertions, not visual-only |
| Conformance gate wiring (negative fixtures fail red) | P0-W2 checker + lane CI | RoamLink's toggleable-violation env pattern |

Sequencing note: P1-W1 shared contracts are prerequisites for the group-purchase walker and
the coordination envelope fixtures; the two-process transport harness can be prototyped
against the inherited RPC stack independently, but its *message contract* fixtures must wait
for P1-W1 acceptance (dependency-graph.md rule: parallel work starts only after contracts
are stable).

## 8. Explicit non-goals

- No claim that any harness output constitutes physical-device, sandbox-provider, or
  live-provider evidence (proof-plan.md §Evidence classes).
- No root-manifest or CI-workflow edits from this work order; harness/CI wiring belongs to
  the owning P2 lanes and the TL-serialized changes (dependency-graph.md §"Safe
  concurrency").
- No new test-framework dependency is assumed — `node:test` first; any framework change is a
  serialized decision.
