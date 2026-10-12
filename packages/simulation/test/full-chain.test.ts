import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runScenario } from "../src/contract.js";
import {
  validateEnvelope,
  createEnvelopeReplayGuard,
  checkDelegationChain,
  discoverResources,
  recordOutcome,
} from "@adcos/coordination";
import { buildCustomerView, advanceConsent } from "@adcos/surfaces";
import { advanceMembership, mandateCovers } from "@adcos/organizations";
import { advanceOrder } from "@adcos/group-purchasing";
import type {
  ResourceProjectionReference,
  CapabilityObservation,
  OrganizationMembership,
  OrganizationMandate,
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  Delegation,
  Message,
} from "@adcos/contracts";

// ============================================================================
// Full-chain dogfood (P3-W1 shape, executed inside the P2-W3-owned shadow
// harness package): two instances exchange a validated envelope, a group
// purchase forms, crosses its threshold, walks the order lifecycle, and the
// customer sees the result through their isolated view. Advisory only; no
// external side effects; every step uses public contract surfaces.
// ============================================================================

const now = 1_700_000_000_000;

// --- Instance A: the customer principal sharing a resource ------------------

const sharedResource: ResourceProjectionReference = {
  id: "res-1",
  owner: "prin-alice",
  device: "dev-alice",
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
  status: "DEGRADED",
  freshness: now - 1000,
  revoked: false,
};

const observation: CapabilityObservation = {
  declared: { capability: "forwarding-v1", version: "1.0.0", limits: { maxSessions: 2 } },
  observed: { status: "DEGRADED", freshness: now - 1000 },
  evidenceClass: "OBSERVATION",
};

// --- Instance B discovers the shared resource -------------------------------

const delegationChain: Delegation[] = [
  {
    id: "deleg-leaf",
    principal: "prin-bob",
    delegate: "inst-b",
    scope: "device.forwarding",
    issuedAt: now - 10_000,
  },
  {
    id: "deleg-root",
    principal: "prin-org",
    delegate: "prin-bob",
    scope: "device",
    issuedAt: now - 20_000,
  },
];

const envelopeInput = {
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: "evt-1001",
  commandId: "cmd-use-resource",
  sender: "inst-b",
  receiver: "inst-a",
  scope: "device.forwarding",
  issuedAt: now - 500,
  expiresAt: now + 3_600_000,
  idempotencyKey: "op-use-42",
  payloadDigest: "sha256:0f2a",
  authorizationRef: "authz-1",
  delegationRef: "deleg-leaf",
  policyEpoch: 7,
};

const message = (overrides: Partial<Message> = {}): Message => ({
  id: "msg-1",
  envelope: envelopeInput as Message["envelope"],
  payload: { request: "use", resource: "res-1" },
  lifecycle: { state: "PENDING", attempts: 0, maxRetries: 3 },
  createdAt: now - 500,
  updatedAt: now - 500,
  ...overrides,
});

describe("full-chain dogfood (two instances → organization → group purchase → order)", () => {
  it("step 1: the customer opts in and shares a resource", () => {
    assert.deepEqual(advanceConsent("NOT_SHARED", "OPT_IN"), { state: "SHARED", applied: true });
  });

  it("step 2: instance B discovers the shared resource with a valid delegation", () => {
    assert.equal(checkDelegationChain(delegationChain, "device.forwarding", now).authorized, true);
    const found = discoverResources(
      [sharedResource],
      [observation],
      { capability: "forwarding-v1" },
      now,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].resource.id, "res-1");
    assert.equal(found[0].observationStatus, "DEGRADED");
  });

  it("step 3: B's envelope passes A's pre-dispatch validation (and replays are rejected)", () => {
    const guard = createEnvelopeReplayGuard();
    const ctx = {
      allowedScopes: ["device.forwarding"],
      currentPolicyEpoch: 7,
      knownSenders: ["inst-b"],
      requireKnownSender: true,
      maxPayloadDigestLength: 64,
      now,
    };
    const first = validateEnvelope(envelopeInput, ctx, guard);
    assert.equal(first.accepted, true);
    const replay = validateEnvelope({ ...envelopeInput, eventId: "evt-2" }, ctx, guard);
    assert.equal(replay.accepted, false);
    assert.ok(replay.failures.some((f) => f.code === "REPLAY"));
  });

  it("step 4: the message flows through the inbox lifecycle to COMPLETED", () => {
    const processing = message({ lifecycle: { state: "PROCESSING", attempts: 0, maxRetries: 3 } });
    const done = recordOutcome(processing, "COMPLETED", now);
    assert.deepEqual(done, { state: "COMPLETED", attempts: 0, applied: true });
  });

  it("step 5: an Organization forms and members join through the lifecycle", () => {
    const candidate: OrganizationMembership = {
      id: "mem-bob",
      organization: "org-1",
      principal: "prin-bob",
      state: "CANDIDATE",
      role: "member",
      joinedAt: now,
    };
    const invited = advanceMembership(candidate, "INVITE", now);
    assert.deepEqual(invited, { state: "INVITED", applied: true });
    const member = advanceMembership({ ...candidate, state: "INVITED" }, "ACCEPT_INVITE", now);
    assert.deepEqual(member, { state: "MEMBER", applied: true });
  });

  it("step 6: the mandate authorizes the group-purchase scope", () => {
    const mandate: OrganizationMandate = {
      id: "mand-1",
      organization: "org-1",
      principal: "prin-bob",
      scope: "group.purchase",
      permissions: ["commitment:write"],
      issuedAt: now,
    };
    assert.equal(mandateCovers(mandate, "group.purchase.offers", now), true);
    assert.equal(mandateCovers(mandate, "group.purchasing", now), false);
  });

  it("steps 7-9: the Lab evaluates, the group crosses its threshold, the order walks its lifecycle", () => {
    const request: GroupPurchaseRequest = {
      id: "gpr-1",
      intent: "intent-1",
      organization: "org-1",
      requirements: { product: "data-bundle" },
      participants: ["prin-alice"],
      threshold: 2,
      expiresAt: now + 86_400_000,
    };
    const offer: GroupPurchaseOffer = {
      id: "gpo-1",
      request: "gpr-1",
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
    };
    const commitments: GroupPurchaseCommitment[] = [
      {
        id: "gpc-1",
        request: "gpr-1",
        offer: "gpo-1",
        participant: "prin-alice",
        allocation: { lines: 1 },
        acceptedAt: now - 100,
      },
      {
        id: "gpc-2",
        request: "gpr-1",
        offer: "gpo-1",
        participant: "prin-bob",
        allocation: { lines: 1 },
        acceptedAt: now - 50,
      },
    ];

    // step 7: the Lab shadow-runs the whole decision (advisory)
    const report = runScenario(
      {
        id: "scen-dogfood",
        arms: [
          { strategy: "baseline-status-quo", cost: 100, reliability: 0.9 },
          { strategy: "alt-sharenet", cost: 80, reliability: 0.95 },
        ],
        baselineStrategy: "baseline-status-quo",
        selectedStrategy: "alt-sharenet",
        confidence: 0.8,
        assumptions: ["price-stable-30d"],
        request,
        offer,
        commitments,
      },
      now,
    );
    assert.equal(report.verdict, "PURSUE");
    assert.equal(report.purchaseState, "THRESHOLD_MET");

    // step 8: the order lifecycle completes under explicit guards
    const paymentRef = {
      id: "pay-1",
      type: "mobile-money",
      authority: "authorized-psp",
      created: now,
      settled: false,
    };
    const guards = {
      authorizationGranted: true,
      paymentReference: paymentRef,
      usageEvidenceComplete: true,
    };
    assert.deepEqual(advanceOrder("THRESHOLD_MET", "AUTHORIZE", guards), {
      state: "AUTHORIZED",
      applied: true,
    });
    assert.deepEqual(advanceOrder("AUTHORIZED", "PLACE_ORDER", guards), {
      state: "ORDERED",
      applied: true,
    });
    assert.deepEqual(advanceOrder("ORDERED", "CONFIRM_CONTRACT", guards), {
      state: "CONTRACTED",
      applied: true,
    });
    assert.deepEqual(advanceOrder("CONTRACTED", "MARK_FULFILLED", guards), {
      state: "FULFILLED",
      applied: true,
    });
    assert.deepEqual(advanceOrder("FULFILLED", "RECONCILE", guards), {
      state: "RECONCILED",
      applied: true,
    });

    // step 9: the customer sees the final state through their isolated view
    const view = buildCustomerView(
      {
        resources: [sharedResource],
        memberships: [
          {
            id: "mem-alice",
            organization: "org-1",
            principal: "prin-alice",
            state: "MEMBER",
            role: "member",
            joinedAt: now,
          },
        ],
        requests: [request],
        offers: [offer],
        commitments,
        opportunities: [report.opportunity],
      },
      "prin-alice",
      now,
    );
    assert.equal(view.groupPurchases.length, 1);
    assert.equal(view.groupPurchases[0].committedParticipants, 2);
    assert.equal(view.groupPurchases[0].threshold, 2);
    assert.equal(view.groupPurchases[0].myCommitmentId, "gpc-1");
    assert.equal(view.opportunities.length, 1);
    assert.equal(view.opportunities[0].recommendation, "pursue alt-sharenet");
  });
});
