import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverResources } from "../src/contract.js";
import type { ResourceProjectionReference, CapabilityObservation } from "@adcos/contracts";

const now = 1_700_000_000_000;

const resource = (
  overrides: Partial<ResourceProjectionReference> = {},
): ResourceProjectionReference => ({
  id: "res-1",
  owner: "prin-alice",
  device: "dev-1",
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
  status: "DEGRADED",
  freshness: now - 1000,
  revoked: false,
  ...overrides,
});

const observation = (
  status: CapabilityObservation["observed"]["status"],
): CapabilityObservation => ({
  declared: {
    capability: "forwarding-v1",
    version: "1.0.0",
    limits: { maxSessions: 2 },
  },
  observed: { status, freshness: now - 1000 },
  evidenceClass: "OBSERVATION",
});

describe("discoverResources", () => {
  it("matches on capability and carries the matched-on evidence", () => {
    const found = discoverResources(
      [resource()],
      [observation("DEGRADED")],
      { capability: "forwarding-v1" },
      now,
    );
    assert.equal(found.length, 1);
    assert.ok(found[0].matchedOn.includes("capability:forwarding-v1"));
    assert.equal(found[0].observationStatus, "DEGRADED");
  });

  it("filters by required modes", () => {
    const found = discoverResources(
      [resource({ modes: ["local"] }), resource({ id: "res-2" })],
      [],
      { capability: "forwarding-v1", modes: ["relay"] },
      now,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].resource.id, "res-2");
  });

  it("filters by freshness (resources without freshness are UNKNOWN and excluded)", () => {
    const stale = resource({ freshness: now - 100_000 });
    const fresh = resource({ id: "res-2", freshness: now - 100 });
    const noFreshness = resource({ id: "res-3", freshness: undefined });
    const found = discoverResources(
      [stale, fresh, noFreshness],
      [],
      {
        capability: "forwarding-v1",
        minFreshness: now - 1000,
      },
      now,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].resource.id, "res-2");
  });

  it("never matches revoked resources", () => {
    const found = discoverResources(
      [resource({ revoked: true })],
      [],
      { capability: "forwarding-v1" },
      now,
    );
    assert.equal(found.length, 0);
  });

  it("excludes resources whose OBSERVED status is unusable (observed beats declared)", () => {
    const found = discoverResources(
      [resource({ id: "a" }), resource({ id: "b" })],
      [observation("FAILED")],
      { capability: "forwarding-v1" },
      now,
    );
    assert.equal(found.length, 0);
  });

  it("allows explicitly overriding the excluded-status set", () => {
    const found = discoverResources(
      [resource()],
      [observation("TERMINATED")],
      { capability: "forwarding-v1", excludedStatuses: ["FAILED", "REJECTED"] },
      now,
    );
    assert.equal(found.length, 1);
  });
});
