import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonlSurfaceStateStore,
  createSurfacesService,
  type SurfaceState,
} from "../src/contract.js";

// ============================================================================
// Durability tests (write-then-reload cycles) for the surfaces service state.
// Pattern: the landed JsonlInboxStore tests in packages/coordination —
// "restart" is a brand-new store/service over the same durable file; a torn
// tail is reported, never trusted. Everything is verified through the
// service PUBLIC API (no domain-object poking).
// ============================================================================

const dir = mkdtempSync(join(tmpdir(), "adcos-surfaces-state-"));
const path = (name: string): string => join(dir, `${name}.jsonl`);

// A deterministic clock the tests can advance across "restarts".
const clockAt = (t: number): { now: () => number } => ({ now: () => t });

describe("JsonlSurfaceStateStore (durable state log)", () => {
  it("persists applied commands and restores them into a new store", () => {
    const file = path("store-a");
    const store = new JsonlSurfaceStateStore(file);
    assert.deepEqual(store.stats(), { snapshots: 0, tornLines: 0 });

    const service = createSurfacesService({ statePath: file, ...clockAt(1_000) });
    const enrolled = service.enrollResource("prin-alice", {
      id: "res-1",
      device: "dev-1",
      type: "phone",
      capability: "forwarding-v1",
      modes: ["local", "relay"],
      limits: { maxSessions: 2 },
    });
    assert.equal(enrolled.applied, true);

    // "restart": a brand-new store reading the same file.
    const restarted = new JsonlSurfaceStateStore(file);
    assert.equal(restarted.stats().snapshots, 1);
    assert.equal(restarted.stats().tornLines, 0);
    const state: SurfaceState = restarted.restore();
    assert.equal(state.resources.length, 1);
    assert.equal(state.resources[0]?.id, "res-1");
    assert.equal(state.consents[0]?.state, "NOT_SHARED");
  });

  it("treats a missing file as a fresh start (empty state)", () => {
    const store = new JsonlSurfaceStateStore(path("missing"));
    assert.deepEqual(store.stats(), { snapshots: 0, tornLines: 0 });
    assert.deepEqual(store.restore().resources, []);
  });

  it("reports and skips a torn tail line instead of trusting it", () => {
    const file = path("store-torn");
    const service = createSurfacesService({ statePath: file, ...clockAt(1_000) });
    service.enrollResource("prin-alice", {
      id: "res-1",
      device: "dev-1",
      type: "phone",
      capability: "forwarding-v1",
      modes: ["local"],
      limits: { maxSessions: 1 },
    });
    // Simulate a crash mid-append: truncate the final line.
    const content = readFileSync(file, "utf8");
    writeFileSync(file, content.slice(0, content.length - 20), "utf8");

    const restarted = new JsonlSurfaceStateStore(file);
    assert.equal(restarted.stats().tornLines, 1);
    // The torn snapshot is NOT trusted: the folded state is the empty state
    // (the only snapshot in the file was the torn one).
    assert.deepEqual(restarted.restore().resources, []);
  });

  it("falls back to the last intact snapshot when the tail is torn", () => {
    const file = path("store-torn-mid");
    const service = createSurfacesService({ statePath: file, ...clockAt(1_000) });
    service.enrollResource("prin-alice", {
      id: "res-1",
      device: "dev-1",
      type: "phone",
      capability: "forwarding-v1",
      modes: ["local"],
      limits: { maxSessions: 1 },
    });
    const firstView = service.getCustomerView("prin-alice");
    assert.equal(firstView.resources.length, 1);
    // A second applied command (a second snapshot)...
    const optedIn = service.applyConsentEvent("prin-alice", "res-1", "OPT_IN");
    assert.equal(optedIn.applied, true);
    // ...then a crash mid-append of a hypothetical third snapshot.
    const content = readFileSync(file, "utf8");
    writeFileSync(file, `${content}{"consents":[{"resourceId":"res-1","sta`, "utf8");

    const restarted = new JsonlSurfaceStateStore(file);
    assert.equal(restarted.stats().tornLines, 1);
    assert.equal(restarted.stats().snapshots, 2);
    const state = restarted.restore();
    // The last INTACT snapshot wins: the opt-in survived, the torn line did not.
    assert.equal(state.consents[0]?.state, "SHARED");
  });

  it("treats a parseable but wrongly-shaped line as corrupt (not trusted)", () => {
    const file = path("store-shape");
    writeFileSync(file, `${JSON.stringify({ hello: "world" })}\n`, "utf8");
    const store = new JsonlSurfaceStateStore(file);
    assert.equal(store.stats().tornLines, 1);
    assert.equal(store.stats().snapshots, 0);
    assert.deepEqual(store.restore().resources, []);
  });

  it("survives write-then-reload cycles (append after restart)", () => {
    const file = path("store-cycles");
    const first = createSurfacesService({ statePath: file, ...clockAt(1_000) });
    assert.equal(
      first.enrollResource("prin-a", {
        id: "res-a",
        device: "dev-a",
        type: "phone",
        capability: "forwarding-v1",
        modes: ["local"],
        limits: { maxSessions: 1 },
      }).applied,
      true,
    );
    const second = createSurfacesService({ statePath: file, ...clockAt(2_000) });
    assert.equal(second.getCustomerView("prin-a").resources.length, 1);
    assert.equal(
      second.enrollResource("prin-b", {
        id: "res-b",
        device: "dev-b",
        type: "router",
        capability: "forwarding-v1",
        modes: ["relay"],
        limits: { maxSessions: 4 },
      }).applied,
      true,
    );
    const third = createSurfacesService({ statePath: file, ...clockAt(3_000) });
    const viewA = third.getCustomerView("prin-a");
    const viewB = third.getCustomerView("prin-b");
    assert.equal(viewA.resources.length, 1);
    assert.equal(viewB.resources.length, 1);
    assert.equal(third.durability().snapshots, 2);
  });
});

describe("service restart continuity (public API only)", () => {
  it("continues the consent journey across a restart at the exact persisted state", () => {
    const file = path("service-restart");
    const t0 = 1_700_000_000_000;
    const first = createSurfacesService({ statePath: file, now: () => t0 });
    first.enrollResource("prin-alice", {
      id: "res-1",
      device: "dev-1",
      type: "phone",
      capability: "forwarding-v1",
      modes: ["local", "relay"],
      limits: { maxSessions: 2 },
    });
    // PAUSE before the "crash" — the journey continues after restart.
    assert.equal(first.applyConsentEvent("prin-alice", "res-1", "OPT_IN").applied, true);
    assert.equal(first.applyConsentEvent("prin-alice", "res-1", "PAUSE").applied, true);

    // New process, same durable log, later clock.
    const t1 = t0 + 60_000;
    const second = createSurfacesService({ statePath: file, now: () => t1 });
    const view = second.getCustomerView("prin-alice");
    assert.equal(view.resources.length, 1);
    assert.equal(view.resources[0]?.share, "PAUSED");
    assert.equal(view.resources[0]?.status, "UNKNOWN");

    // RESUME is legal from PAUSED; OPT_IN is NOT (no silent resume paths).
    assert.equal(second.applyConsentEvent("prin-alice", "res-1", "RESUME").applied, true);
    assert.equal(second.getCustomerView("prin-alice").resources[0]?.share, "SHARED");
    const refused = second.applyConsentEvent("prin-alice", "res-1", "RESUME");
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /not legal in state SHARED/);
  });

  it("refused commands never persist anything (log stays clean)", () => {
    const file = path("service-refused");
    const service = createSurfacesService({ statePath: file, ...clockAt(1_000) });
    const refused = service.applyConsentEvent("prin-alice", "res-none", "OPT_IN");
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /unknown resource/);
    // No snapshot was written: the durable log is absent/empty.
    const store = new JsonlSurfaceStateStore(file);
    assert.equal(store.stats().snapshots, 0);
    assert.deepEqual(store.restore().resources, []);
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
