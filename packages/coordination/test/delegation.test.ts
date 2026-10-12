import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkDelegationChain } from "../src/contract.js";
import type { Delegation } from "@adcos/contracts";

const now = 1_700_000_000_000;

const delegation = (overrides: Partial<Delegation> = {}): Delegation => ({
  id: "deleg-1",
  principal: "prin-alice",
  delegate: "prin-bob",
  scope: "device.forwarding",
  issuedAt: now - 10_000,
  revoked: false,
  ...overrides,
});

describe("checkDelegationChain", () => {
  it("authorizes a valid chain covering the requested scope", () => {
    const chain = [
      delegation({ id: "leaf", scope: "device.forwarding" }),
      delegation({ id: "root", scope: "device" }),
    ];
    const r = checkDelegationChain(chain, "device.forwarding", now);
    assert.equal(r.authorized, true);
  });

  it("refuses an empty chain (fail closed — no authority is implied)", () => {
    const r = checkDelegationChain([], "device.forwarding", now);
    assert.equal(r.authorized, false);
    assert.match(r.reason ?? "", /no delegation/);
  });

  it("refuses revoked or expired links", () => {
    assert.equal(
      checkDelegationChain([delegation({ revoked: true })], "device.forwarding", now).authorized,
      false,
    );
    assert.equal(
      checkDelegationChain([delegation({ expiresAt: now - 1 })], "device.forwarding", now)
        .authorized,
      false,
    );
  });

  it("refuses when the leaf scope does not cover the request", () => {
    const r = checkDelegationChain(
      [delegation({ scope: "device.stats" })],
      "device.forwarding",
      now,
    );
    assert.equal(r.authorized, false);
    assert.match(r.reason ?? "", /does not cover/);
  });

  it("refuses attenuation violations (inner wider than outer)", () => {
    const chain = [
      delegation({ id: "leaf", scope: "device" }),
      delegation({ id: "root", scope: "device.forwarding" }),
    ];
    const r = checkDelegationChain(chain, "device", now);
    assert.equal(r.authorized, false);
    assert.match(r.reason ?? "", /attenuation violation/);
  });

  it("prefix semantics: outer covers inner descendants, not siblings", () => {
    const chain = [
      delegation({ id: "leaf", scope: "device.forwarding.read" }),
      delegation({ id: "root", scope: "device.forwarding" }),
    ];
    assert.equal(checkDelegationChain(chain, "device.forwarding.read", now).authorized, true);
    assert.equal(checkDelegationChain(chain, "device.forwarding.write", now).authorized, false);
  });
});
