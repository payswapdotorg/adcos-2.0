import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCustomerView, resourceShareState, advanceConsent } from "../src/contract.js";
import type {
  ResourceProjectionReference,
  OrganizationMembership,
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  OpportunityEvidence,
  LabComparisonEvidence,
} from "@adcos/contracts";

const now = 1_700_000_000_000;

const resource = (
  owner: string,
  overrides: Partial<ResourceProjectionReference> = {},
): ResourceProjectionReference => ({
  id: `res-${owner}`,
  owner,
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

const membership = (principal: string, org: string): OrganizationMembership => ({
  id: `mem-${principal}-${org}`,
  organization: org,
  principal,
  state: "MEMBER",
  role: "member",
  joinedAt: now - 5000,
});

const request = (id: string, intent: string, org: string): GroupPurchaseRequest => ({
  id,
  intent,
  organization: org,
  requirements: { product: "data-bundle" },
  participants: ["prin-alice"],
  threshold: 2,
  expiresAt: now + 86_400_000,
});

const offer = (requestId: string): GroupPurchaseOffer => ({
  id: `gpo-${requestId}`,
  request: requestId,
  supplier: "teleco-x",
  product: "data-bundle-10gb",
  capability: "data-plan-v2",
  region: "GH",
  quantity: 10,
  perMemberCost: 12.5,
  totalCost: 125,
  recurringCharges: [{ amount: 12.5, frequency: "monthly", description: "per member" }],
  oneTimeCharges: [{ amount: 5, description: "activation" }],
  term: "12-months",
  limitations: ["fair-use"],
  expiry: now + 172_800_000,
  provenance: "unicom-listing",
});

const commitment = (id: string, req: string, participant: string): GroupPurchaseCommitment => ({
  id,
  request: req,
  offer: `gpo-${req}`,
  participant,
  allocation: { lines: 1 },
  acceptedAt: now - 100,
});

const labEvidence: LabComparisonEvidence = {
  id: "lab-1",
  intent: "intent-1",
  baseline: "baseline-status-quo",
  alternatives: ["alt-sharenet"],
  noChange: { cost: 100 },
  selected: { strategy: "alt-sharenet", cost: 80, confidence: 0.8, assumptions: [] },
  comparison: {},
  evaluatedAt: now - 2000,
};

const opportunity: OpportunityEvidence = {
  id: "opp-1",
  intent: "intent-1",
  evidence: labEvidence,
  confidence: 0.8,
  cost: 80,
  recommendation: "pursue alt-sharenet",
};

const snapshot = {
  resources: [resource("prin-alice"), resource("prin-bob")],
  memberships: [membership("prin-alice", "org-1"), membership("prin-bob", "org-2")],
  requests: [request("gpr-1", "intent-1", "org-1"), request("gpr-2", "intent-2", "org-2")],
  offers: [offer("gpr-1")],
  commitments: [
    commitment("gpc-1", "gpr-1", "prin-alice"),
    commitment("gpc-2", "gpr-1", "prin-bob"),
  ],
  opportunities: [opportunity],
};

describe("buildCustomerView (tenant isolation)", () => {
  it("exposes only the principal's own resources", () => {
    const view = buildCustomerView(snapshot, "prin-alice", now);
    assert.equal(view.resources.length, 1);
    assert.equal(view.resources[0].resourceId, "res-prin-alice");
  });

  it("exposes only the principal's own organizations and their requests", () => {
    const view = buildCustomerView(snapshot, "prin-alice", now);
    assert.deepEqual(
      view.organizations.map((o) => o.organization),
      ["org-1"],
    );
    assert.deepEqual(
      view.groupPurchases.map((g) => g.requestId),
      ["gpr-1"],
    );
  });

  it("never leaks another organization request to a non-member", () => {
    const view = buildCustomerView(snapshot, "prin-bob", now);
    assert.deepEqual(
      view.groupPurchases.map((g) => g.requestId),
      ["gpr-2"],
    );
  });

  it("shows threshold progress and the own commitment", () => {
    const view = buildCustomerView(snapshot, "prin-alice", now);
    const g = view.groupPurchases[0];
    assert.equal(g.committedParticipants, 2);
    assert.equal(g.threshold, 2);
    assert.equal(g.myCommitmentId, "gpc-1");
    assert.equal(g.state, "OPEN");
  });

  it("surfaces request expiry as EXPIRED", () => {
    const view = buildCustomerView(snapshot, "prin-alice", snapshot.requests[0].expiresAt + 1);
    assert.equal(view.groupPurchases[0].state, "EXPIRED");
  });

  it("scopes opportunities to the intents of the visible requests", () => {
    const alice = buildCustomerView(snapshot, "prin-alice", now);
    assert.deepEqual(
      alice.opportunities.map((o) => o.id),
      ["opp-1"],
    );
    const bob = buildCustomerView(snapshot, "prin-bob", now);
    assert.deepEqual(bob.opportunities, []);
  });
});

describe("resourceShareState (explicit states)", () => {
  it("REVOKED dominates; unusable statuses read as PAUSED; else SHARED", () => {
    assert.equal(resourceShareState(resource("a", { revoked: true })), "REVOKED");
    assert.equal(resourceShareState(resource("a", { status: "FAILED" })), "PAUSED");
    assert.equal(resourceShareState(resource("a", { status: "TERMINATED" })), "PAUSED");
    assert.equal(resourceShareState(resource("a", { status: "STALE" })), "SHARED");
    assert.equal(resourceShareState(resource("a", { status: "UNKNOWN" })), "SHARED");
  });
});

describe("advanceConsent (opt-in/opt-out journey)", () => {
  it("requires an explicit OPT_IN to enter SHARED (no silent resume)", () => {
    const r = advanceConsent("NOT_SHARED", "RESUME");
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /not legal in state NOT_SHARED/);
  });

  it("walks OPT_IN → PAUSE → RESUME and OPT_OUT from either", () => {
    assert.deepEqual(advanceConsent("NOT_SHARED", "OPT_IN"), { state: "SHARED", applied: true });
    assert.deepEqual(advanceConsent("SHARED", "PAUSE"), { state: "PAUSED", applied: true });
    assert.deepEqual(advanceConsent("PAUSED", "RESUME"), { state: "SHARED", applied: true });
    assert.deepEqual(advanceConsent("PAUSED", "OPT_OUT"), { state: "NOT_SHARED", applied: true });
    assert.deepEqual(advanceConsent("SHARED", "OPT_OUT"), { state: "NOT_SHARED", applied: true });
  });
});
