import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { advanceMembership, mandateCovers } from "../src/contract.js";
import type { OrganizationMembership, OrganizationMandate } from "@adcos/contracts";

const now = 1_700_000_000_000;

const member = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: "mem-1",
  organization: "org-1",
  principal: "prin-alice",
  state: "CANDIDATE",
  role: "member",
  joinedAt: now,
  ...overrides,
});

const mandate = (overrides: Partial<OrganizationMandate> = {}): OrganizationMandate => ({
  id: "mand-1",
  organization: "org-1",
  principal: "prin-alice",
  scope: "group.purchase",
  permissions: ["offer:read", "commitment:write"],
  issuedAt: now,
  ...overrides,
});

describe("advanceMembership", () => {
  it("walks the legal CANDIDATE → INVITED → MEMBER path", () => {
    const invited = advanceMembership(member(), "INVITE", now);
    assert.deepEqual(invited, { state: "INVITED", applied: true });
    const joined = advanceMembership(member({ state: "INVITED" }), "ACCEPT_INVITE", now);
    assert.deepEqual(joined, { state: "MEMBER", applied: true });
  });

  it("DECLINE_INVITE returns to CANDIDATE, never silently MEMBER", () => {
    const r = advanceMembership(member({ state: "INVITED" }), "DECLINE_INVITE", now);
    assert.deepEqual(r, { state: "CANDIDATE", applied: true });
  });

  it("suspends and resumes members", () => {
    assert.deepEqual(advanceMembership(member({ state: "MEMBER" }), "SUSPEND", now), {
      state: "SUSPENDED",
      applied: true,
    });
    assert.deepEqual(advanceMembership(member({ state: "SUSPENDED" }), "RESUME", now), {
      state: "MEMBER",
      applied: true,
    });
  });

  it("rejects illegal transitions with a reason", () => {
    const r = advanceMembership(member({ state: "CANDIDATE" }), "RESUME", now);
    assert.equal(r.applied, false);
    assert.equal(r.state, "CANDIDATE");
    assert.match(r.reason ?? "", /not legal in state CANDIDATE/);
  });

  it("REVOKE is terminal — nothing applies after it", () => {
    const revoked = advanceMembership(member({ state: "MEMBER" }), "REVOKE", now);
    assert.deepEqual(revoked, { state: "REVOKED", applied: true });
    for (const event of ["INVITE", "ACCEPT_INVITE", "RESUME"] as const) {
      const r = advanceMembership(member({ state: "REVOKED" }), event, now);
      assert.equal(r.applied, false);
      assert.match(r.reason ?? "", /terminal/);
    }
  });

  it("rejects events on expired memberships (renewal flow required)", () => {
    const r = advanceMembership(member({ state: "MEMBER", expiresAt: now - 1 }), "SUSPEND", now);
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /expired/);
  });
});

describe("mandateCovers", () => {
  it("covers the literal scope and its descendants, not siblings or parents", () => {
    const m = mandate();
    assert.equal(mandateCovers(m, "group.purchase", now), true);
    assert.equal(mandateCovers(m, "group.purchase.offers", now), true);
    assert.equal(mandateCovers(m, "group.purchasing", now), false);
    assert.equal(mandateCovers(m, "group", now), false);
    assert.equal(mandateCovers(m, "", now), false);
  });

  it("denies revoked and expired mandates (fail closed)", () => {
    assert.equal(mandateCovers(mandate({ revoked: true }), "group.purchase", now), false);
    assert.equal(mandateCovers(mandate({ expiresAt: now - 1 }), "group.purchase", now), false);
  });
});
