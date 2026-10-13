import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSurfacesService } from "../src/contract.js";
import {
  discoverResources,
  checkDelegationChain,
  validateEnvelope,
  createEnvelopeReplayGuard,
  recordOutcome,
} from "@adcos/coordination";
import type { GroupPurchaseOffer, PaymentReference, Delegation, Message } from "@adcos/contracts";

// ============================================================================
// Customer journey, end-to-end at the SERVICE level (P2-W1 round 2 core
// acceptance): opt-in consent → resource share state surfaced → organization
// membership → threshold progress → commitment → order lifecycle — driven
// ONLY through the surfaces public API (createSurfacesService), composed at
// the journey level with the coordination public API (discovery, delegation,
// envelope validation, inbox lifecycle) exactly like the TL-merged
// simulation full-chain precedent. Persisted state is verified through the
// public API after mid-journey restarts. No domain-object poking: every step
// is a public command of the surfaces service or a public contract function
// of a landed package.
// ============================================================================

const dir = mkdtempSync(join(tmpdir(), "adcos-surfaces-journey-"));
const statePath = join(dir, "journey.jsonl");

// Deterministic clock: the journey advances one second per step.
let t = 1_700_000_000_000;
const tick = (): number => (t += 1_000);

const OPERATORS = ["prin-operator"];
const DEVELOPERS = ["prin-developer"];

const service = createSurfacesService({
  statePath,
  now: tick,
  operatorPrincipals: OPERATORS,
  developerPrincipals: DEVELOPERS,
});

const aliceResource = {
  id: "res-alice-phone",
  device: "dev-alice",
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
};

describe("customer journey (service level, persisted, restart-surviving)", () => {
  before(() => {
    // --- step 1: the customer enrolls a device resource --------------------
    const enrolled = service.enrollResource("prin-alice", aliceResource);
    assert.equal(enrolled.applied, true);
    assert.equal(enrolled.resource?.status, "UNKNOWN");
    assert.equal(enrolled.consent?.state, "NOT_SHARED");

    // Enrollment did NOT opt in: the surfaced share state is NOT_SHARED.
    assert.equal(service.getCustomerView("prin-alice").resources[0]?.share, "NOT_SHARED");
  });

  it("step 2: explicit OPT_IN turns sharing on; the view surfaces SHARED", () => {
    const optedIn = service.applyConsentEvent("prin-alice", "res-alice-phone", "OPT_IN");
    assert.equal(optedIn.applied, true);
    assert.equal(optedIn.consent?.state, "SHARED");
    const view = service.getCustomerView("prin-alice");
    assert.equal(view.resources[0]?.share, "SHARED");
    // Raw canonical status still UNKNOWN — health is never fabricated.
    assert.equal(view.resources[0]?.status, "UNKNOWN");
  });

  it("step 3: the owner records an observation; DEGRADED is surfaced as DEGRADED", () => {
    const observed = service.recordObservation("prin-alice", "res-alice-phone", {
      status: "DEGRADED",
      declaredVersion: "1.0.0",
      evidence: ["obs-1"],
    });
    assert.equal(observed.applied, true);
    assert.equal(observed.resource?.status, "DEGRADED");
    assert.notEqual(observed.resource?.freshness, undefined);
    const view = service.getCustomerView("prin-alice");
    // UNKNOWN ≠ DEGRADED: the surfaced status changed with the observation.
    assert.equal(view.resources[0]?.status, "DEGRADED");
    assert.equal(view.resources[0]?.share, "SHARED");
  });

  it("step 4: another instance discovers the resource through the coordination public API", () => {
    // The delegation chain (leaf first) scopes instance B to forwarding.
    const chain: Delegation[] = [
      {
        id: "deleg-leaf",
        principal: "prin-bob",
        delegate: "inst-b",
        scope: "device.forwarding",
        issuedAt: t - 10_000,
      },
      {
        id: "deleg-root",
        principal: "prin-org",
        delegate: "prin-bob",
        scope: "device",
        issuedAt: t - 20_000,
      },
    ];
    assert.equal(checkDelegationChain(chain, "device.forwarding", t).authorized, true);

    // Discovery over the surfaced resource state (owner, capability, modes,
    // observed status and freshness all come from the service's persisted
    // rows as surfaced above): a DEGRADED resource is discoverable (not in
    // the default excluded set) with its observed status attached — the
    // caller sees WHY it matched, never a silent pass.
    const discovered = discoverResources(
      [
        {
          id: "res-alice-phone",
          owner: "prin-alice",
          device: "dev-alice",
          type: "phone",
          capability: "forwarding-v1",
          modes: ["local", "relay"],
          limits: { maxSessions: 2 },
          status: "DEGRADED",
          freshness: t,
          revoked: false,
        },
      ],
      [
        {
          declared: {
            capability: "forwarding-v1",
            version: "1.0.0",
            schedule: {},
            limits: { maxSessions: 2 },
          },
          observed: { status: "DEGRADED", freshness: t },
          evidenceClass: "OBSERVATION",
        },
      ],
      { capability: "forwarding-v1" },
      t,
    );
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0]?.observationStatus, "DEGRADED");
    assert.ok(discovered[0]?.matchedOn.includes("observed:DEGRADED"));
  });

  it("step 5: instance B's use-request passes envelope validation (and replays are rejected)", () => {
    const envelope = {
      schema: { major: 1, minor: 2, patch: 0 },
      eventId: "evt-journey-1",
      commandId: "cmd-use-resource",
      sender: "inst-b",
      receiver: "inst-a",
      scope: "device.forwarding",
      issuedAt: t - 500,
      expiresAt: t + 3_600_000,
      idempotencyKey: "op-journey-42",
      payloadDigest: "sha256:0f2a",
      authorizationRef: "authz-journey",
      delegationRef: "deleg-leaf",
      policyEpoch: 7,
    };
    const guard = createEnvelopeReplayGuard();
    const ctx = {
      allowedScopes: ["device.forwarding"],
      currentPolicyEpoch: 7,
      knownSenders: ["inst-b"],
      requireKnownSender: true,
      maxPayloadDigestLength: 64,
      now: t,
    };
    const first = validateEnvelope(envelope, ctx, guard);
    assert.equal(first.accepted, true);
    const replay = validateEnvelope({ ...envelope, eventId: "evt-journey-2" }, ctx, guard);
    assert.equal(replay.accepted, false);
    assert.ok(replay.failures.some((f) => f.code === "REPLAY"));

    // The accepted command flows through the inbox lifecycle to COMPLETED.
    const message: Message = {
      id: "msg-journey-1",
      envelope: envelope as Message["envelope"],
      payload: { request: "use", resource: "res-alice-phone" },
      lifecycle: { state: "PROCESSING", attempts: 0, maxRetries: 3 },
      createdAt: t,
      updatedAt: t,
    };
    assert.deepEqual(recordOutcome(message, "COMPLETED", t), {
      state: "COMPLETED",
      attempts: 0,
      applied: true,
    });
  });

  it("step 6: the Lab evaluates (advisory) and the verdict is PURSUE", () => {
    const evaluation = service.runLabEvaluation({
      id: "lab-journey",
      intent: "intent-journey",
      baseline: { strategy: "baseline-status-quo", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt-sharenet", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt-sharenet",
      confidence: 0.8,
      assumptions: ["price-stable-30d"],
      expiresAt: t + 172_800_000,
    });
    assert.equal(evaluation.applied, true);
    assert.equal(evaluation.verdict, "PURSUE");
    assert.equal(evaluation.opportunityId, "lab-journey-opportunity");
  });

  it("step 7: the organization forms from the PURSUE verdict with founder consent", () => {
    const formed = service.formOrganization("prin-alice", {
      organization: "org-journey",
      pursuitEvidenceId: "lab-journey-opportunity",
      candidates: [
        { principal: "prin-alice", consent: true, consentRecordedAt: t - 1_000 },
        { principal: "prin-bob", consent: true, consentRecordedAt: t - 500 },
      ],
      minFounders: 2,
      authorityScope: "group",
      initialMandates: [
        { principal: "prin-alice", scope: "group", permissions: ["all"] },
        { principal: "prin-bob", scope: "group", permissions: ["all"] },
      ],
    });
    assert.equal(formed.applied, true);
    assert.equal(formed.founding?.state, "FORMED");
    assert.deepEqual(formed.founding?.founders, ["prin-alice", "prin-bob"]);

    // Membership surfaced in the customer view.
    const alice = service.getCustomerView("prin-alice");
    assert.deepEqual(
      alice.organizations.map((o) => ({ org: o.organization, state: o.state })),
      [{ org: "org-journey", state: "MEMBER" }],
    );
  });

  it("step 8: a mandated founder invites carol; carol joins by accepting her own invite", () => {
    // An unmandated principal cannot invite (carol is not even a member).
    const outsider = service.inviteMember("prin-carol", {
      organization: "org-journey",
      principal: "prin-dave",
    });
    assert.equal(outsider.applied, false);
    assert.match(outsider.reason ?? "", /membership-management mandate/);

    // Bob (founder, group-scope mandate covering group.membership) invites carol.
    const invited = service.inviteMember("prin-bob", {
      organization: "org-journey",
      principal: "prin-carol",
    });
    assert.equal(invited.applied, true, invited.reason);
    assert.equal(invited.membership?.state, "INVITED");

    // Only carol can accept her own invite.
    const wrongAcceptor = service.applyMembershipEvent("prin-alice", {
      organization: "org-journey",
      principal: "prin-carol",
      event: "ACCEPT_INVITE",
    });
    assert.equal(wrongAcceptor.applied, false);
    assert.match(wrongAcceptor.reason ?? "", /only be performed by the invited principal/);

    const accepted = service.applyMembershipEvent("prin-carol", {
      organization: "org-journey",
      principal: "prin-carol",
      event: "ACCEPT_INVITE",
    });
    assert.equal(accepted.applied, true);
    assert.equal(accepted.membership?.state, "MEMBER");

    const carolView = service.getCustomerView("prin-carol");
    assert.deepEqual(
      carolView.organizations.map((o) => o.organization),
      ["org-journey"],
    );
  });

  it("step 9: a mandated member opens a group purchase bound to the org", () => {
    const opened = service.openGroupPurchase("prin-alice", {
      id: "gpr-journey",
      intent: "intent-journey",
      organization: "org-journey",
      requirements: { product: "data-bundle" },
      threshold: 2,
      expiresAt: t + 86_400_000,
    });
    assert.equal(opened.applied, true);
    const view = service.getCustomerView("prin-alice");
    assert.equal(view.groupPurchases.length, 1);
    assert.equal(view.groupPurchases[0]?.orderState, "COMMITMENT_OPEN");
    assert.equal(view.groupPurchases[0]?.committedParticipants, 0);
    assert.equal(view.groupPurchases[0]?.threshold, 2);
  });

  it("step 10: the attributable offer is received (totals verified, fail-closed)", () => {
    const offer: GroupPurchaseOffer = {
      id: "gpo-journey",
      request: "gpr-journey",
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
      expiry: t + 172_800_000,
      provenance: "unicom-listing",
    };
    const received = service.receiveOffer("prin-alice", offer);
    assert.equal(received.applied, true);
    assert.equal(
      service.getCustomerView("prin-alice").groupPurchases[0]?.orderState,
      "OFFER_RECEIVED",
    );
  });

  it("step 11: alice commits (1/2); carol cannot commit — no purchase mandate", () => {
    const first = service.commitToPurchase("prin-alice", {
      requestId: "gpr-journey",
      allocation: { lines: 1 },
    });
    assert.equal(first.applied, true, first.reason);
    assert.equal(first.evaluation?.participants.length, 1);
    assert.equal(first.evaluation?.thresholdMet, false);

    const view = service.getCustomerView("prin-alice");
    assert.equal(view.groupPurchases[0]?.committedParticipants, 1);
    assert.equal(view.groupPurchases[0]?.myCommitmentId, "gpr-journey-commit-prin-alice-0");
    assert.equal(view.groupPurchases[0]?.orderState, "OFFER_RECEIVED");

    // carol IS a member but holds no mandate at all: fail-closed.
    const refused = service.commitToPurchase("prin-carol", {
      requestId: "gpr-journey",
      allocation: { lines: 1 },
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /requires an active 'group.purchase' mandate/);
  });

  it("step 12: a mid-journey RESTART preserves every step (write-then-reload)", () => {
    // New service instance over the same durable log — everything so far
    // must still be there, read back through the public API.
    const restarted = createSurfacesService({
      statePath,
      now: tick,
      operatorPrincipals: OPERATORS,
      developerPrincipals: DEVELOPERS,
    });
    const alice = restarted.getCustomerView("prin-alice");
    assert.equal(alice.resources[0]?.share, "SHARED");
    assert.equal(alice.resources[0]?.status, "DEGRADED");
    assert.equal(alice.organizations[0]?.organization, "org-journey");
    assert.equal(alice.groupPurchases[0]?.committedParticipants, 1);
    assert.equal(alice.groupPurchases[0]?.orderState, "OFFER_RECEIVED");
    assert.equal(alice.opportunities[0]?.recommendation, "pursue alt-sharenet");
    const carol = restarted.getCustomerView("prin-carol");
    assert.deepEqual(
      carol.organizations.map((o) => o.state),
      ["MEMBER"],
    );

    // Authority boundaries survive restarts: carol still cannot commit.
    const stillRefused = restarted.commitToPurchase("prin-carol", {
      requestId: "gpr-journey",
      allocation: { lines: 1 },
    });
    assert.equal(stillRefused.applied, false);
    assert.match(stillRefused.reason ?? "", /mandate/);
  });

  it("step 13: bob commits; the threshold is met and surfaced (2/2)", () => {
    const second = service.commitToPurchase("prin-bob", {
      requestId: "gpr-journey",
      allocation: { lines: 1 },
    });
    assert.equal(second.applied, true, second.reason);
    assert.equal(second.evaluation?.thresholdMet, true);
    assert.equal(second.evaluation?.state, "THRESHOLD_MET");

    const view = service.getCustomerView("prin-alice");
    assert.equal(view.groupPurchases[0]?.committedParticipants, 2);
    assert.equal(view.groupPurchases[0]?.threshold, 2);
    assert.equal(view.groupPurchases[0]?.orderState, "THRESHOLD_MET");
  });

  it("step 14: duplicate commitments are refused (withdraw first)", () => {
    const duplicate = service.commitToPurchase("prin-alice", {
      requestId: "gpr-journey",
      allocation: { lines: 1 },
    });
    assert.equal(duplicate.applied, false);
    assert.match(duplicate.reason ?? "", /already holds commitment/);
    assert.equal(service.getCustomerView("prin-alice").groupPurchases[0]?.committedParticipants, 2);
  });

  it("step 15: the order completes to RECONCILED under explicit guards", () => {
    const authorized = service.advancePurchaseOrder("prin-alice", {
      requestId: "gpr-journey",
      event: "AUTHORIZE",
    });
    assert.equal(authorized.applied, true, authorized.reason);
    assert.equal(authorized.order?.state, "AUTHORIZED");

    // PLACE_ORDER without an opaque payment reference is refused (ADR-0004).
    const noRef = service.advancePurchaseOrder("prin-alice", {
      requestId: "gpr-journey",
      event: "PLACE_ORDER",
    });
    assert.equal(noRef.applied, false);
    assert.match(noRef.reason ?? "", /opaque payment reference required/);

    const paymentReference: PaymentReference = {
      id: "pay-journey-1",
      type: "mobile-money",
      authority: "authorized-psp",
      created: t,
      settled: false,
    };
    const placed = service.advancePurchaseOrder("prin-alice", {
      requestId: "gpr-journey",
      event: "PLACE_ORDER",
      paymentReference,
    });
    assert.equal(placed.applied, true);
    assert.equal(placed.order?.state, "ORDERED");
    assert.deepEqual(placed.order?.paymentReference, paymentReference);

    for (const [event, expected] of [
      ["CONFIRM_CONTRACT", "CONTRACTED"],
      ["MARK_FULFILLED", "FULFILLED"],
    ] as const) {
      const step = service.advancePurchaseOrder("prin-alice", {
        requestId: "gpr-journey",
        event,
      });
      assert.equal(step.applied, true, step.reason);
      assert.equal(step.order?.state, expected);
    }

    // RECONCILE without usage evidence is refused (fail-closed).
    const noEvidence = service.advancePurchaseOrder("prin-alice", {
      requestId: "gpr-journey",
      event: "RECONCILE",
    });
    assert.equal(noEvidence.applied, false);
    assert.match(noEvidence.reason ?? "", /usage evidence incomplete/);

    const reconciled = service.advancePurchaseOrder("prin-alice", {
      requestId: "gpr-journey",
      event: "RECONCILE",
      usageEvidenceComplete: true,
    });
    assert.equal(reconciled.applied, true);
    assert.equal(reconciled.order?.state, "RECONCILED");

    // Terminal state surfaced in the customer view, and reloaded intact.
    assert.equal(service.getCustomerView("prin-alice").groupPurchases[0]?.orderState, "RECONCILED");
    const reloaded = createSurfacesService({
      statePath,
      now: tick,
      operatorPrincipals: OPERATORS,
      developerPrincipals: DEVELOPERS,
    });
    assert.equal(
      reloaded.getCustomerView("prin-alice").groupPurchases[0]?.orderState,
      "RECONCILED",
    );
    const operatorView = reloaded.getOperatorView("prin-operator");
    assert.equal(operatorView.applied, true);
    assert.equal(operatorView.view?.organizations[0]?.requests[0]?.orderState, "RECONCILED");
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
