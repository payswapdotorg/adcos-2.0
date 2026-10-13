import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// P3-W1 negative integration legs — the composed surface fails closed
// end-to-end. Composed through PUBLIC contract entry points only (same
// import discipline as full-chain.test.ts; see its header).
//
// Required negative legs from the work order:
//   - replayed envelopes rejected;
//   - expired consent resumption refused end-to-end (no silent resume, no
//     stale Lab verdicts founding organizations, expired delegations
//     refusing coordination authorization, expired requests refusing
//     commitments);
//   - revoked resource unusable across the composed surface (view,
//     discovery, commands).
// Plus the negative side of the computed-mandate AUTHORIZE guard (a
// committed participant whose mandate expired blocks authorization — the
// authorization really is computed from persisted mandates, not asserted).
// ============================================================================

import { createSurfacesService } from "../../packages/surfaces/src/contract.js";
import {
  validateEnvelope,
  createEnvelopeReplayGuard,
  checkDelegationChain,
  discoverResources,
  type ValidationContext,
} from "../../packages/coordination/src/contract.js";
import type { Envelope, Delegation } from "../../packages/adcos-contracts/src/index.js";

const T0 = 1_700_000_000_000;

const dir = mkdtempSync(join(tmpdir(), "adcos-p3w1-negative-"));
const path = (name: string): string => join(dir, `${name}.jsonl`);

const service = (name: string, clock: () => number) =>
  createSurfacesService({ statePath: path(name), now: clock });

const ENROLL_INPUT = {
  id: "res-neg",
  device: "dev-neg",
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
};

const OWNER = "prin-owner-neg";

const validationContext = (now: number): ValidationContext => ({
  allowedScopes: ["device.forwarding"],
  currentPolicyEpoch: 7,
  knownSenders: ["inst-requester"],
  requireKnownSender: true,
  maxPayloadDigestLength: 64,
  now,
});

const envelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: "evt-neg-1",
  commandId: "cmd-neg",
  sender: "inst-requester",
  receiver: "inst-holder",
  scope: "device.forwarding",
  issuedAt: T0,
  expiresAt: T0 + 3_600_000,
  idempotencyKey: "op-neg-1",
  payloadDigest: "sha256:abcd",
  policyEpoch: 7,
  ...overrides,
});

describe("replayed envelopes are rejected across the composed boundary", () => {
  it("a fresh eventId with a SEEN idempotency key is a REPLAY (never dispatched)", () => {
    const guard = createEnvelopeReplayGuard();
    const ctx = validationContext(T0);
    const first = validateEnvelope(envelope(), ctx, guard);
    assert.equal(first.accepted, true, JSON.stringify(first.failures));
    const replay = validateEnvelope(envelope({ eventId: "evt-neg-2" }), ctx, guard);
    assert.equal(replay.accepted, false);
    assert.deepEqual(
      replay.failures.map((f) => f.code),
      ["REPLAY"],
    );
    assert.match(replay.failures[0]?.detail ?? "", /duplicate idempotencyKey\/eventId 'op-neg-1'/);
  });

  it("an EXPIRED envelope never reaches dispatch (freshness gate, fail-closed)", () => {
    const guard = createEnvelopeReplayGuard();
    const result = validateEnvelope(envelope({ expiresAt: T0 - 1 }), validationContext(T0), guard);
    assert.equal(result.accepted, false);
    assert.ok(result.failures.some((f) => f.code === "EXPIRED"));
  });

  it("an out-of-scope envelope is refused by the receiver's own policy", () => {
    const guard = createEnvelopeReplayGuard();
    const result = validateEnvelope(
      envelope({ scope: "device.administration" }),
      validationContext(T0),
      guard,
    );
    assert.equal(result.accepted, false);
    assert.ok(result.failures.some((f) => f.code === "OUT_OF_SCOPE"));
  });
});

describe("expired consent resumption is refused end-to-end", () => {
  it("RESUME from NOT_SHARED is refused across the service + view boundary (no silent resume)", () => {
    let t = T0;
    const svc = service("neg-consent", () => t);
    assert.equal(svc.enrollResource(OWNER, ENROLL_INPUT).applied, true);
    assert.equal(svc.applyConsentEvent(OWNER, "res-neg", "OPT_IN").applied, true);
    assert.equal(svc.applyConsentEvent(OWNER, "res-neg", "OPT_OUT").applied, true);

    const resume = svc.applyConsentEvent(OWNER, "res-neg", "RESUME");
    assert.equal(resume.applied, false);
    assert.match(resume.reason ?? "", /not legal in state NOT_SHARED/);

    // The view agrees: the surfaced share state is NOT_SHARED (the refusal
    // and the projection can never disagree).
    const view = svc.getCustomerView(OWNER);
    assert.equal(view.resources[0]?.share, "NOT_SHARED");

    // Only a FRESH OPT_IN re-enters SHARED — the explicit consent path.
    const fresh = svc.applyConsentEvent(OWNER, "res-neg", "OPT_IN");
    assert.equal(fresh.applied, true);
    assert.equal(svc.getCustomerView(OWNER).resources[0]?.share, "SHARED");
  });

  it("founding from EXPIRED Lab evidence is refused end-to-end (stale verdicts cannot found)", () => {
    let t = T0;
    const svc = service("neg-stale-evidence", () => t);
    assert.equal(
      svc.runLabEvaluation({
        id: "lab-stale",
        intent: "intent-neg",
        baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
        alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
        selectedStrategy: "alt",
        confidence: 0.8,
        assumptions: [],
        expiresAt: t + 10_000,
      }).applied,
      true,
    );
    t += 20_000; // the evidence expires
    const formed = svc.formOrganization(OWNER, {
      organization: "org-stale",
      pursuitEvidenceId: "lab-stale-opportunity",
      candidates: [{ principal: OWNER, consent: true, consentRecordedAt: t }],
      minFounders: 1,
      authorityScope: "group",
      initialMandates: [
        { principal: OWNER, scope: "group.purchase", permissions: ["commitment:write"] },
      ],
    });
    assert.equal(formed.applied, false);
    assert.match(formed.reason ?? "", /pursuit evidence .* expired — re-evaluate before founding/);
    // Nothing was persisted by the refused command.
    assert.equal(svc.getCustomerView(OWNER).organizations.length, 0);
  });

  it("an EXPIRED delegation refuses coordination authorization end-to-end (offline queues cannot extend permissions)", () => {
    const expiredChain: Delegation[] = [
      {
        id: "deleg-expired-leaf",
        principal: "prin-holder",
        delegate: "inst-holder",
        scope: "device.forwarding",
        issuedAt: T0 - 100_000,
        expiresAt: T0 - 1_000, // expired while the instance was offline
        revoked: false,
      },
    ];
    const check = checkDelegationChain(expiredChain, "device.forwarding", T0);
    assert.equal(check.authorized, false);
    assert.match(check.reason ?? "", /delegation deleg-expired-leaf expired/);

    // The envelope itself would pass every wire gate — it is the AUTHORITY
    // check (INVARIANTS #9/#12) that blocks dispatch, which is exactly the
    // composed-system behavior: transport acceptance ≠ authorization.
    const guard = createEnvelopeReplayGuard();
    const wireResult = validateEnvelope(envelope(), validationContext(T0), guard);
    assert.equal(wireResult.accepted, true);
  });

  it("an EXPIRED request refuses new commitments end-to-end and surfaces EXPIRED", () => {
    let t = T0;
    const svc = service("neg-request-expiry", () => t);
    assert.equal(svc.enrollResource(OWNER, ENROLL_INPUT).applied, true);
    assert.equal(
      svc.runLabEvaluation({
        id: "lab-neg-2",
        intent: "intent-neg-2",
        baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
        alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
        selectedStrategy: "alt",
        confidence: 0.8,
        assumptions: [],
      }).applied,
      true,
    );
    assert.equal(
      svc.formOrganization(OWNER, {
        organization: "org-neg-2",
        pursuitEvidenceId: "lab-neg-2-opportunity",
        candidates: [{ principal: OWNER, consent: true, consentRecordedAt: t }],
        minFounders: 1,
        authorityScope: "group",
        initialMandates: [{ principal: OWNER, scope: "group", permissions: ["commitment:write"] }],
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(OWNER, {
        id: "gpr-neg-2",
        intent: "intent-neg-2",
        organization: "org-neg-2",
        requirements: { product: "data-bundle" },
        threshold: 1,
        expiresAt: t + 10_000,
      }).applied,
      true,
    );
    assert.equal(
      svc.receiveOffer(OWNER, {
        id: "gpo-neg-2",
        request: "gpr-neg-2",
        supplier: "teleco-x",
        product: "data-bundle-10gb",
        capability: "data-plan-v2",
        region: "GH",
        quantity: 10,
        perMemberCost: 25,
        totalCost: 250,
        recurringCharges: [{ amount: 25, frequency: "monthly", description: "per member" }],
        oneTimeCharges: [{ amount: 10, description: "activation" }],
        term: "12-months",
        limitations: ["fair-use"],
        expiry: t + 1_728_000_000,
        provenance: "unicom-listing:neg",
      }).applied,
      true,
    );

    t += 20_000; // the request expires before anyone commits
    const commit = svc.commitToPurchase(OWNER, {
      requestId: "gpr-neg-2",
      allocation: { lines: 1 },
    });
    assert.equal(commit.applied, false);
    assert.match(commit.reason ?? "", /expired — commitments are no longer accepted/);
    const view = svc.getCustomerView(OWNER);
    assert.equal(view.groupPurchases[0]?.state, "EXPIRED");
  });
});

describe("a revoked resource is unusable across the composed surface", () => {
  it("revocation dominates the view, discovery and every further command", () => {
    let t = T0;
    const svc = service("neg-revoked", () => t);
    const enrolled = svc.enrollResource(OWNER, ENROLL_INPUT);
    assert.equal(enrolled.applied, true);
    assert.equal(svc.applyConsentEvent(OWNER, "res-neg", "OPT_IN").applied, true);
    const observed = svc.recordObservation(OWNER, "res-neg", {
      status: "DEGRADED",
      freshness: t,
      declaredVersion: "1.4.0",
    });
    assert.equal(observed.applied, true);
    if (!observed.resource || !observed.observation) {
      assert.fail("observation must return the resource and observation");
    }

    // Pre-revocation: discovery matches the shared resource.
    assert.equal(
      discoverResources(
        [observed.resource],
        [observed.observation],
        {
          capability: "forwarding-v1",
        },
        t,
      ).length,
      1,
    );

    const revoked = svc.revokeResource(OWNER, "res-neg");
    assert.equal(revoked.applied, true);
    const revokedResource = { ...observed.resource, revoked: true };

    // The view surfaces REVOKED (dominates every other share state).
    assert.equal(svc.getCustomerView(OWNER).resources[0]?.share, "REVOKED");

    // Discovery NEVER matches a revoked resource.
    assert.equal(
      discoverResources(
        [revokedResource],
        [observed.observation],
        {
          capability: "forwarding-v1",
        },
        t,
      ).length,
      0,
    );

    // Every further command on the revoked resource is refused (terminal).
    const consent = svc.applyConsentEvent(OWNER, "res-neg", "OPT_IN");
    assert.equal(consent.applied, false);
    assert.match(consent.reason ?? "", /revoked \(terminal\)/);
    const observation = svc.recordObservation(OWNER, "res-neg", {
      status: "DEGRADED",
      declaredVersion: "1.4.0",
    });
    assert.equal(observation.applied, false);
    assert.match(observation.reason ?? "", /revoked — observations are no longer accepted/);
    const revokeAgain = svc.revokeResource(OWNER, "res-neg");
    assert.equal(revokeAgain.applied, false);
    assert.match(revokeAgain.reason ?? "", /already revoked/);
  });
});

describe("the computed-mandate AUTHORIZE guard fails closed end-to-end", () => {
  it("a committed participant whose mandate EXPIRED blocks authorization (mandates are computed, not asserted)", () => {
    let t = T0;
    const svc = service("neg-mandate-expiry", () => t);
    const member = "prin-member-exp";
    assert.equal(
      svc.runLabEvaluation({
        id: "lab-neg-3",
        intent: "intent-neg-3",
        baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
        alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
        selectedStrategy: "alt",
        confidence: 0.8,
        assumptions: [],
      }).applied,
      true,
    );
    assert.equal(
      svc.formOrganization("prin-organizer", {
        organization: "org-neg-3",
        pursuitEvidenceId: "lab-neg-3-opportunity",
        candidates: [
          { principal: "prin-organizer", consent: true, consentRecordedAt: t },
          { principal: member, consent: true, consentRecordedAt: t },
        ],
        minFounders: 2,
        authorityScope: "group",
        initialMandates: [
          // The organizer holds a durable mandate...
          { principal: "prin-organizer", scope: "group", permissions: ["commitment:write"] },
          // ...the member's mandate EXPIRES at T0 + 10_000.
          {
            principal: member,
            scope: "group.purchase",
            permissions: ["commitment:write"],
            expiresAt: t + 10_000,
          },
        ],
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase("prin-organizer", {
        id: "gpr-neg-3",
        intent: "intent-neg-3",
        organization: "org-neg-3",
        requirements: { product: "data-bundle" },
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(
      svc.receiveOffer("prin-organizer", {
        id: "gpo-neg-3",
        request: "gpr-neg-3",
        supplier: "teleco-x",
        product: "data-bundle-10gb",
        capability: "data-plan-v2",
        region: "GH",
        quantity: 10,
        perMemberCost: 25,
        totalCost: 250,
        recurringCharges: [{ amount: 25, frequency: "monthly", description: "per member" }],
        oneTimeCharges: [{ amount: 10, description: "activation" }],
        term: "12-months",
        limitations: ["fair-use"],
        expiry: t + 1_728_000_000,
        provenance: "unicom-listing:neg",
      }).applied,
      true,
    );

    // Both members commit while the member's mandate is still valid.
    assert.equal(
      svc.commitToPurchase("prin-organizer", {
        requestId: "gpr-neg-3",
        allocation: { lines: 1 },
      }).applied,
      true,
    );
    assert.equal(
      svc.commitToPurchase(member, {
        requestId: "gpr-neg-3",
        allocation: { lines: 1 },
      }).applied,
      true,
    );

    t += 20_000; // the member's mandate expires between commit and authorize
    const authorize = svc.advancePurchaseOrder("prin-organizer", {
      requestId: "gpr-neg-3",
      event: "AUTHORIZE",
    });
    assert.equal(authorize.applied, false);
    assert.match(
      authorize.reason ?? "",
      /authorization not grantable: committed participants without an active 'group\.purchase' mandate: prin-member-exp/,
    );
    // The order record was NOT advanced by the refused command.
    assert.equal(
      svc.getCustomerView("prin-organizer").groupPurchases[0]?.orderState,
      "THRESHOLD_MET",
    );
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
