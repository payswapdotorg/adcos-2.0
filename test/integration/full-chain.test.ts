import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// P3-W1 integrated product dogfood — the COMPLETE product story through
// composed PUBLIC APIs only.
//
// Import discipline: every import below targets a package's PUBLIC contract
// entry point (the publicEntrypoints registered in architecture-policy.yaml):
//   packages/surfaces/src/contract.ts, packages/adcos-contracts/src/index.ts,
//   packages/coordination/src/contract.ts, packages/economics/src/contract.ts,
//   packages/lab/src/contract.ts, packages/organizations/src/contract.ts,
//   packages/group-purchasing/src/contract.ts,
//   packages/simulation/src/contract.ts.
// Bare `@adcos/*` specifiers do not resolve from the repository root (the
// workspace links live inside packages/*/node_modules), so the suite uses
// relative paths to those entry files — the same convention the repo's own
// package tests and verification runtimes use. No package internals are
// imported anywhere in this suite.
//
// The story: a customer requests a connectivity service; a resource owner
// shares an eligible connection (consent → enrollment → observation);
// instances cooperate through the coordination boundary (delegation,
// discovery, envelope validation with replay rejection, durable inbox
// lifecycle with retry + dead-letter); the Lab forms and recommends an
// Organization; ADCOS executes a group-purchase contract (request → offer →
// commitments → AUTHORIZE → PLACE_ORDER → RECONCILE); the offer is allocated
// across members (P2-W3 round-2); every leg persists to JSONL adapter stores
// and a full reload proves idempotency/recovery. A real OS-process restart
// version of this story lives in two-process-restart.test.ts.
//
// MOCK/REAL labeling: the state machines, persistence, validation, clocks and
// allocation math exercised here are the repo's real implementations. The
// provider offer, its provenance string and the opaque payment reference are
// SYNTHETIC evidence objects standing in for provider/payment-authority data
// (ADR-0004: live payment/provider success is BLOCKED-ON-OPERATOR and is
// never claimed here).
// ============================================================================

import {
  createSurfacesService,
  type SurfacesService,
  type CustomerView,
} from "../../packages/surfaces/src/contract.js";
import {
  validateEnvelope,
  createEnvelopeReplayGuard,
  checkDelegationChain,
  discoverResources,
  beginProcessing,
  recordOutcome,
  isDeadLettered,
  JsonlInboxStore,
  type ValidationContext,
} from "../../packages/coordination/src/contract.js";
import { summarizeOfferCosts } from "../../packages/economics/src/contract.js";
import { rankCandidates } from "../../packages/lab/src/contract.js";
import { mandateCovers } from "../../packages/organizations/src/contract.js";
import { computeMemberAllocations } from "../../packages/group-purchasing/src/contract.js";
import { runScenario } from "../../packages/simulation/src/contract.js";
import type {
  ResourceProjectionReference,
  CapabilityObservation,
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
  PaymentReference,
  Envelope,
  Message,
  Delegation,
} from "../../packages/adcos-contracts/src/index.js";

// --- the deterministic clock (injected; the two-process suite uses the
// --- real clock — both are recorded in the dogfood report) -----------------

const T0 = 1_700_000_000_000;
let t = T0;
const now = (): number => t;
const advance = (ms: number): void => {
  t += ms;
};

// --- durable-evidence locations (JSONL adapter stores) ----------------------

const dir = mkdtempSync(join(tmpdir(), "adcos-p3w1-full-chain-"));
const statePath = join(dir, "surface-state.jsonl");
const inboxPath = join(dir, "coordination-inbox.jsonl");

let service: SurfacesService = createSurfacesService({
  statePath,
  now,
  operatorPrincipals: ["prin-operator"],
});

// --- cast + shared fixtures captured from public command results -----------

const CUSTOMER = "prin-cara";
const OWNER = "prin-omar";
const HOUSEHOLD = "prin-household"; // root delegator on the owner's side
const INST_CUSTOMER = "inst-cara";
const INST_OWNER = "inst-omar";
const THIRD_MEMBER = "prin-nyx";
const ORG = "org-communal";
const INTENT = "intent-stable-data";
const RESOURCE = "res-hotspot-1";

let sharedResource: ResourceProjectionReference | undefined;
let ownerObservation: CapabilityObservation | undefined;
let observedFreshness = 0;
let purchaseRequest: GroupPurchaseRequest | undefined;
let groupOffer: GroupPurchaseOffer | undefined;
let customerCommitment: GroupPurchaseCommitment | undefined;
let ownerCommitment: GroupPurchaseCommitment | undefined;
let viewBeforeReload: CustomerView | undefined;

const ENROLL_INPUT = {
  id: RESOURCE,
  device: "dev-omar-phone",
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
};

// The delegation chains (leaf first). The owner's instance acts under a
// two-link chain rooted at the household admin (attenuation containment);
// the customer's instance acts under the customer's own delegation.
const OWNER_CHAIN: Delegation[] = [
  {
    id: "deleg-owner-leaf",
    principal: OWNER,
    delegate: INST_OWNER,
    scope: "device.forwarding",
    issuedAt: T0 - 20_000,
    revoked: false,
  },
  {
    id: "deleg-household-root",
    principal: HOUSEHOLD,
    delegate: OWNER,
    scope: "device",
    issuedAt: T0 - 30_000,
    revoked: false,
  },
];
const CUSTOMER_CHAIN: Delegation[] = [
  {
    id: "deleg-customer-leaf",
    principal: CUSTOMER,
    delegate: INST_CUSTOMER,
    scope: "device.forwarding",
    issuedAt: T0 - 15_000,
    revoked: false,
  },
];

const requestEnvelope: Envelope = {
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: "evt-req-1001",
  commandId: "cmd-request-service",
  sender: INST_CUSTOMER,
  receiver: INST_OWNER,
  scope: "device.forwarding",
  issuedAt: T0 - 500,
  expiresAt: T0 + 3_600_000,
  correlationId: "corr-story-1",
  idempotencyKey: "op-req-42",
  payloadDigest: "sha256:0f2a",
  authorizationRef: "authz-story-1",
  delegationRef: "deleg-customer-leaf",
  policyEpoch: 7,
};

const validationContext: ValidationContext = {
  allowedScopes: ["device.forwarding"],
  currentPolicyEpoch: 7,
  knownSenders: [INST_CUSTOMER],
  requireKnownSender: true,
  maxPayloadDigestLength: 64,
  now: T0,
};

describe("P3-W1 integrated dogfood — the complete product story over composed public APIs", () => {
  it("leg 1 — the customer requests a service; the owner shares an eligible connection (enrollment → consent → observation)", () => {
    // Enrollment never opts in: the resource starts UNKNOWN + NOT_SHARED.
    const enrolled = service.enrollResource(OWNER, ENROLL_INPUT);
    if (!enrolled.applied || enrolled.resource === undefined) {
      assert.fail(`enroll refused: ${enrolled.reason ?? "no reason"}`);
    }
    sharedResource = enrolled.resource;
    assert.equal(sharedResource.status, "UNKNOWN");
    assert.equal(enrolled.consent?.state, "NOT_SHARED");

    // Sharing begins only with an explicit OPT_IN (no silent resume).
    const optedIn = service.applyConsentEvent(OWNER, RESOURCE, "OPT_IN");
    if (!optedIn.applied || optedIn.consent === undefined) {
      assert.fail(`OPT_IN refused: ${optedIn.reason ?? "no reason"}`);
    }
    assert.equal(optedIn.consent.state, "SHARED");

    // Observation: observed beats declared; UNKNOWN is never fabricated.
    advance(60_000);
    observedFreshness = t - 30_000;
    const observed = service.recordObservation(OWNER, RESOURCE, {
      status: "DEGRADED",
      freshness: observedFreshness,
      evidence: ["probe:tcp-handshake-ok"],
      declaredVersion: "1.4.0",
    });
    if (!observed.applied || observed.resource === undefined) {
      assert.fail(`observation refused: ${observed.reason ?? "no reason"}`);
    }
    sharedResource = observed.resource;
    ownerObservation = observed.observation;
    assert.equal(sharedResource.status, "DEGRADED");
    assert.equal(sharedResource.freshness, observedFreshness);
    assert.equal(ownerObservation?.evidenceClass, "OBSERVATION");

    // The customer's service request is evaluated by the Lab: baseline
    // (status quo) vs the communal bundle alternative. Advisory only.
    advance(1_000);
    const lab = service.runLabEvaluation({
      id: "lab-communal",
      intent: INTENT,
      baseline: { strategy: "baseline-status-quo", cost: 100, reliability: 0.9, utilization: 0.4 },
      alternatives: [
        { strategy: "alt-communal-bundle", cost: 80, reliability: 0.95, utilization: 0.6 },
      ],
      selectedStrategy: "alt-communal-bundle",
      confidence: 0.8,
      assumptions: ["price-stable-30d"],
      expiresAt: t + 172_800_000,
    });
    if (!lab.applied || lab.verdict === undefined) {
      assert.fail(`lab evaluation refused: ${lab.reason ?? "no reason"}`);
    }
    assert.equal(lab.verdict, "PURSUE");
    assert.equal(lab.opportunityId, "lab-communal-opportunity");

    // Durable evidence: every applied command appended a snapshot
    // (write-before-ack) before it was acknowledged.
    assert.ok(service.durability().snapshots >= 4);
  });

  it("leg 2 — instances cooperate through the coordination boundary (delegation chain, discovery, envelope validation with replay rejection, durable inbox lifecycle with retry + dead-letter)", () => {
    // Delegation chains: the owner instance acts under a valid two-link
    // chain (attenuation containment holds: 'device' ⊇ 'device.forwarding').
    const ownerAuthorized = checkDelegationChain(OWNER_CHAIN, "device.forwarding", t);
    assert.equal(ownerAuthorized.authorized, true, ownerAuthorized.reason);
    const customerAuthorized = checkDelegationChain(CUSTOMER_CHAIN, "device.forwarding", t);
    assert.equal(customerAuthorized.authorized, true, customerAuthorized.reason);
    // Attenuation violation fails closed: a leaf wider than its root never
    // authorizes anything.
    const leaf = OWNER_CHAIN[0];
    const root = OWNER_CHAIN[1];
    assert.ok(leaf !== undefined && root !== undefined);
    const violating: Delegation[] = [
      { ...leaf, scope: "device" },
      { ...root, scope: "device.forwarding" },
    ];
    assert.equal(checkDelegationChain(violating, "device.forwarding", t).authorized, false);

    // Discovery over the persisted resource projection (observed status
    // beats declared; matched-on evidence recorded — never a silent pass).
    assert.ok(sharedResource !== undefined, "leg 1 must run first");
    const found = discoverResources(
      [sharedResource],
      ownerObservation !== undefined ? [ownerObservation] : [],
      { capability: "forwarding-v1", modes: ["relay"], minFreshness: t - 300_000 },
      t,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]?.resource.id, RESOURCE);
    assert.equal(found[0]?.observationStatus, "DEGRADED");
    assert.deepEqual(
      [...(found[0]?.matchedOn ?? [])],
      [
        "capability:forwarding-v1",
        "modes:relay",
        `freshness:${observedFreshness}`,
        "observed:DEGRADED",
      ],
    );

    // Envelope validation: the customer instance's service request passes
    // every pre-dispatch gate; a replay of the same idempotency key is
    // rejected by the receiver-side guard.
    const guard = createEnvelopeReplayGuard();
    const first = validateEnvelope(requestEnvelope, validationContext, guard);
    assert.equal(first.accepted, true, JSON.stringify(first.failures));
    const replay = validateEnvelope(
      { ...requestEnvelope, eventId: "evt-req-1002" },
      validationContext,
      guard,
    );
    assert.equal(replay.accepted, false);
    assert.ok(replay.failures.some((f) => f.code === "REPLAY"));

    // Durable inbox event lifecycle over the JSONL adapter store:
    // write-before-ack append → PENDING persisted → PROCESSING → retry
    // after a FAILED attempt → COMPLETED; a second message exhausts its
    // retry budget and is dead-lettered (observable, never silent).
    const inbox = new JsonlInboxStore(inboxPath);
    const base = (id: string, eventId: string): Message => ({
      id,
      envelope: { ...requestEnvelope, eventId, idempotencyKey: `op-${id}` },
      payload: { request: "use", resource: RESOURCE },
      lifecycle: { state: "PENDING", attempts: 0, maxRetries: 3 },
      createdAt: t,
      updatedAt: t,
    });
    const transient = base("msg-transient", "evt-transient");
    const poisoned = base("msg-poisoned", "evt-poisoned");
    inbox.append(transient); // write-before-ack
    inbox.append(poisoned);

    // A reload proves both messages are durable across a restart of the
    // store over the same file (fold by id, history never rewritten).
    const reloaded = inbox.reload();
    assert.equal(reloaded.loaded, 2);
    assert.equal(reloaded.tornLines, 0);

    const transientBegin = beginProcessing(transient, t);
    assert.deepEqual(transientBegin, { state: "PROCESSING", attempts: 0, applied: true });
    const processingTransient: Message = {
      ...transient,
      lifecycle: { ...transient.lifecycle, state: "PROCESSING", attempts: 0 },
    };
    // First attempt fails (e.g. handler dependency unavailable)...
    const failedOnce = recordOutcome(processingTransient, "FAILED", t);
    assert.deepEqual(failedOnce, { state: "FAILED", attempts: 1, applied: true });
    const failedTransient: Message = {
      ...processingTransient,
      lifecycle: { ...processingTransient.lifecycle, state: "FAILED", attempts: 1 },
    };
    assert.equal(isDeadLettered(failedTransient.lifecycle), false); // budget remains
    // ...retry succeeds within the budget.
    const retryBegin = beginProcessing(failedTransient, t);
    assert.deepEqual(retryBegin, { state: "PROCESSING", attempts: 2, applied: true });
    const retryingTransient: Message = {
      ...failedTransient,
      lifecycle: { ...failedTransient.lifecycle, state: "PROCESSING", attempts: 2 },
    };
    const completed = recordOutcome(retryingTransient, "COMPLETED", t);
    assert.deepEqual(completed, { state: "COMPLETED", attempts: 2, applied: true });
    inbox.append({
      ...retryingTransient,
      lifecycle: { ...retryingTransient.lifecycle, state: "COMPLETED", attempts: 2 },
    });

    // The poisoned message fails, retries within its budget, and finally
    // exhausts it (3/3) — dead-lettered with the canonical reason. Every
    // lifecycle transition is appended before it takes effect
    // (write-before-ack, one full-message snapshot per transition).
    const poisonedBegin = beginProcessing(poisoned, t);
    assert.equal(poisonedBegin.applied, true);
    let current: Message = {
      ...poisoned,
      lifecycle: { ...poisoned.lifecycle, state: "PROCESSING", attempts: 0 },
    };
    inbox.append(current);
    let rounds = 0;
    while (!isDeadLettered(current.lifecycle) && rounds < 5) {
      rounds += 1;
      // A retry re-enters PROCESSING before its outcome can be recorded.
      if (current.lifecycle.state === "FAILED") {
        const retry = beginProcessing(current, t);
        assert.equal(retry.applied, true, retry.reason);
        current = {
          ...current,
          lifecycle: { ...current.lifecycle, state: retry.state, attempts: retry.attempts },
        };
        inbox.append(current);
      }
      const outcome = recordOutcome(current, "FAILED", t);
      assert.equal(outcome.applied, true, outcome.reason);
      current = {
        ...current,
        lifecycle: {
          ...current.lifecycle,
          state: outcome.state,
          attempts: outcome.attempts,
          deadLetterReason: outcome.deadLetterReason,
        },
      };
      inbox.append(current);
    }
    assert.equal(rounds, 2); // initial attempt + one budgeted retry
    assert.equal(current.lifecycle.state, "FAILED");
    assert.equal(current.lifecycle.attempts, 3);
    assert.equal(isDeadLettered(current.lifecycle), true);
    assert.match(current.lifecycle.deadLetterReason ?? "", /retry budget exhausted/);

    // Dead-letter entries survive a store restart over the same durable log.
    const afterRestart = inbox.reload();
    assert.equal(afterRestart.tornLines, 0);
    const storedPoisoned = inbox.list().find((m) => m.id === "msg-poisoned");
    assert.equal(storedPoisoned?.lifecycle.state, "FAILED");
    assert.equal(storedPoisoned?.lifecycle.attempts, 3);
    const storedTransient = inbox.list().find((m) => m.id === "msg-transient");
    assert.equal(storedTransient?.lifecycle.state, "COMPLETED");
  });

  it("leg 3 — the Lab PURSUE verdict founds the Organization from evidence (consent → formation → initial mandates → membership growth)", () => {
    // The verdict is recomputed from the persisted evidence at formation
    // time; the founders' explicit consent decides (the Lab never acts).
    const formed = service.formOrganization(CUSTOMER, {
      organization: ORG,
      pursuitEvidenceId: "lab-communal-opportunity",
      candidates: [
        { principal: CUSTOMER, consent: true, consentRecordedAt: T0 + 61_000 },
        { principal: OWNER, consent: true, consentRecordedAt: T0 + 61_000 },
      ],
      minFounders: 2,
      authorityScope: "group",
      initialMandates: [
        {
          principal: CUSTOMER,
          scope: "group.purchase",
          permissions: ["commitment:write", "order:advance"],
        },
        { principal: OWNER, scope: "group", permissions: ["commitment:write", "order:advance"] },
      ],
    });
    if (!formed.applied || formed.founding === undefined) {
      assert.fail(`formation refused: ${formed.reason ?? "no reason"}`);
    }
    assert.equal(formed.founding.state, "FORMED");
    assert.deepEqual([...formed.founding.founders], [CUSTOMER, OWNER]);
    assert.equal(formed.founding.memberships.length, 2);
    assert.equal(formed.founding.mandates.length, 2);

    // The owner's wide 'group' mandate covers both the purchase scope and
    // membership management (prefix semantics, public mandateCovers).
    const ownerMandate = formed.founding.mandates.find((m) => m.principal === OWNER);
    assert.ok(ownerMandate !== undefined);
    assert.equal(mandateCovers(ownerMandate, "group.purchase", t), true);
    assert.equal(mandateCovers(ownerMandate, "group.membership", t), true);

    // Membership growth through the merged machine: the owner (holding a
    // membership-management mandate) invites a third principal, who accepts.
    const invited = service.inviteMember(OWNER, { organization: ORG, principal: THIRD_MEMBER });
    if (!invited.applied) {
      assert.fail(`invite refused: ${invited.reason ?? "no reason"}`);
    }
    assert.equal(invited.membership?.state, "INVITED");
    const accepted = service.applyMembershipEvent(THIRD_MEMBER, {
      organization: ORG,
      principal: THIRD_MEMBER,
      event: "ACCEPT_INVITE",
    });
    if (!accepted.applied) {
      assert.fail(`accept refused: ${accepted.reason ?? "no reason"}`);
    }
    assert.equal(accepted.membership?.state, "MEMBER");
  });

  it("leg 4 — ADCOS executes the group-purchase contract (request → fail-closed offer validation → attributable offer → commitments to threshold → AUTHORIZE on computed mandates → PLACE_ORDER with opaque payment evidence → CONFIRM_CONTRACT)", () => {
    // The customer (member + purchase mandate) opens the group purchase.
    advance(1_000);
    const opened = service.openGroupPurchase(CUSTOMER, {
      id: "gpr-communal",
      intent: INTENT,
      organization: ORG,
      requirements: { product: "data-bundle", region: "GH" },
      threshold: 2,
      expiresAt: t + 7 * 86_400_000,
    });
    if (!opened.applied || opened.request === undefined) {
      assert.fail(`open refused: ${opened.reason ?? "no reason"}`);
    }
    purchaseRequest = opened.request;
    assert.equal(purchaseRequest.threshold, 2);

    // A non-mandated member cannot commit even before the offer exists.
    const noMandate = service.commitToPurchase(THIRD_MEMBER, {
      requestId: "gpr-communal",
      allocation: { lines: 1 },
    });
    assert.equal(noMandate.applied, false);
    assert.match(noMandate.reason ?? "", /requires an active 'group\.purchase' mandate/);

    // The Lab's recommendation breadth ranked the candidate offers from a
    // pinned evidence snapshot; the top-ranked candidate is the offer the
    // organization will receive (advisory ranking, explicit criteria, one
    // ineligible candidate REJECTED with reasons — never silently dropped).
    const recommendation = rankCandidates({
      id: "rec-bundle-tiers",
      intent: INTENT,
      kind: "SUBSCRIPTION",
      snapshot: "pinned-provider-listing-fixture",
      baseline: "tier-baseline",
      candidates: [
        {
          id: "tier-baseline",
          kind: "SUBSCRIPTION",
          priceMinorUnits: 3000,
          capacityUnits: 5,
          confidence: 0.9,
          provenance: "unicom-listing:baseline",
          eligibility: { feasible: true, reasons: [] },
          assumptions: ["list-price-verified-30d"],
        },
        {
          id: "tier-communal-10gb",
          kind: "SUBSCRIPTION",
          priceMinorUnits: 2500,
          capacityUnits: 10,
          confidence: 0.85,
          provenance: "unicom-listing:tier-2",
          eligibility: { feasible: true, reasons: [] },
          assumptions: ["group-commitment-6-members"],
        },
        {
          id: "tier-premium-expired-listing",
          kind: "SUBSCRIPTION",
          priceMinorUnits: 2000,
          capacityUnits: 12,
          confidence: 0.6,
          provenance: "unicom-listing:stale",
          eligibility: { feasible: false, reasons: ["listing expired at snapshot time"] },
          assumptions: [],
        },
      ],
      constraints: { minCapacityUnits: 8 },
      evaluatedAt: t,
    });
    assert.equal(recommendation.ranked.length, 1);
    assert.equal(recommendation.ranked[0]?.candidate, "tier-communal-10gb");
    // The no-change baseline is REJECTED for cause (5 GB below the 8 GB hard
    // requirement) and the stale listing for its expired eligibility — both
    // kept in the report with reasons, never silently dropped.
    assert.equal(recommendation.rejected.length, 2);
    assert.deepEqual(
      recommendation.rejected.map((r) => r.candidate),
      ["tier-baseline", "tier-premium-expired-listing"],
    );
    const baselineRejection = recommendation.rejected.find((r) => r.candidate === "tier-baseline");
    assert.ok(
      (baselineRejection?.reasons ?? []).some((r) => /below minimum 8 \(hard constraint\)/.test(r)),
    );
    const staleRejection = recommendation.rejected.find(
      (r) => r.candidate === "tier-premium-expired-listing",
    );
    assert.ok((staleRejection?.reasons ?? []).some((r) => /listing expired/.test(r)));

    // The attributable offer mirrors the snapshot's per-member economics
    // (integer-exact in minor units; provenance carried verbatim).
    const candidateOffer: GroupPurchaseOffer = {
      id: "gpo-communal",
      request: "gpr-communal",
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
      provenance: "unicom-listing:tier-2",
    };

    // FAIL-CLOSED cost summary: an offer whose stated totals do not match
    // the per-member roll-up is refused (verified via the economics public
    // API composed inside the surfaces receive path).
    const inconsistentOffer: GroupPurchaseOffer = {
      ...candidateOffer,
      id: "gpo-inconsistent",
      totalCost: 999, // 999 / 10 ≠ 25
    };
    assert.equal(summarizeOfferCosts(inconsistentOffer).totalsConsistent, false);
    const refused = service.receiveOffer(CUSTOMER, inconsistentOffer);
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /totals inconsistent/);

    // The consistent, attributable offer is received through the owning
    // organization; the order record moves to OFFER_RECEIVED.
    const received = service.receiveOffer(CUSTOMER, candidateOffer);
    if (!received.applied || received.offer === undefined) {
      assert.fail(`offer refused: ${received.reason ?? "no reason"}`);
    }
    groupOffer = received.offer;

    // Commitments to threshold: the customer commits first (1/2), the owner
    // second (2/2 — THRESHOLD_MET; the order record follows automatically).
    const commitCustomer = service.commitToPurchase(CUSTOMER, {
      requestId: "gpr-communal",
      allocation: { lines: 4 },
    });
    if (!commitCustomer.applied || commitCustomer.commitment === undefined) {
      assert.fail(`customer commit refused: ${commitCustomer.reason ?? "no reason"}`);
    }
    customerCommitment = commitCustomer.commitment;
    assert.equal(commitCustomer.evaluation?.state, "THRESHOLD_NOT_MET");
    assert.equal(commitCustomer.evaluation?.participants.length, 1);

    const commitOwner = service.commitToPurchase(OWNER, {
      requestId: "gpr-communal",
      allocation: { lines: 7 },
    });
    if (!commitOwner.applied || commitOwner.commitment === undefined) {
      assert.fail(`owner commit refused: ${commitOwner.reason ?? "no reason"}`);
    }
    ownerCommitment = commitOwner.commitment;
    assert.equal(commitOwner.evaluation?.state, "THRESHOLD_MET");
    assert.equal(commitOwner.evaluation?.participants.length, 2);

    // AUTHORIZE is COMPUTED from the persisted mandates of every committed
    // participant (fail-closed when any is missing) — never asserted.
    const authorized = service.advancePurchaseOrder(CUSTOMER, {
      requestId: "gpr-communal",
      event: "AUTHORIZE",
    });
    if (!authorized.applied || authorized.order === undefined) {
      assert.fail(`authorize refused: ${authorized.reason ?? "no reason"}`);
    }
    assert.equal(authorized.order.state, "AUTHORIZED");

    // PLACE_ORDER without an opaque payment reference is refused (ADR-0004:
    // money evidence is mandatory and never executed here).
    const noPayment = service.advancePurchaseOrder(CUSTOMER, {
      requestId: "gpr-communal",
      event: "PLACE_ORDER",
    });
    assert.equal(noPayment.applied, false);
    assert.match(noPayment.reason ?? "", /opaque payment reference required/);

    // PLACE_ORDER with the opaque payment reference (evidence only).
    const paymentReference: PaymentReference = {
      id: "payref-opaque-7",
      type: "mobile-money",
      authority: "authorized-psp",
      created: t,
      settled: false,
    };
    const placed = service.advancePurchaseOrder(CUSTOMER, {
      requestId: "gpr-communal",
      event: "PLACE_ORDER",
      paymentReference,
    });
    if (!placed.applied || placed.order === undefined) {
      assert.fail(`place order refused: ${placed.reason ?? "no reason"}`);
    }
    assert.equal(placed.order.state, "ORDERED");

    // CONFIRM_CONTRACT: the provider's contract confirmation is recorded.
    const contracted = service.advancePurchaseOrder(CUSTOMER, {
      requestId: "gpr-communal",
      event: "CONFIRM_CONTRACT",
    });
    if (!contracted.applied || contracted.order === undefined) {
      assert.fail(`confirm refused: ${contracted.reason ?? "no reason"}`);
    }
    assert.equal(contracted.order.state, "CONTRACTED");
  });

  it("leg 5 — the obtained offer is allocated across members (P2-W3 round-2: rounding policy, provenance, exact money) and the surfaces state survives a write-then-reload across the integration boundary", () => {
    assert.ok(
      purchaseRequest !== undefined &&
        groupOffer !== undefined &&
        customerCommitment !== undefined &&
        ownerCommitment !== undefined,
      "leg 4 must run first",
    );

    // Member allocation with the default largest-remainder policy: weights
    // 4 (customer) + 7 (owner) over a 10-unit offer — base shares floor to
    // 3 + 6, the leftover unit lands on the larger remainder (customer),
    // consent caps are respected and the sums are exact.
    const allocation = computeMemberAllocations({
      request: purchaseRequest,
      offer: groupOffer,
      commitments: [customerCommitment, ownerCommitment],
      orderState: "CONTRACTED",
      now: t,
      paymentReference: {
        id: "payref-opaque-7",
        type: "mobile-money",
        authority: "authorized-psp",
        created: t,
        settled: false,
      },
    });
    assert.equal(allocation.state, "COMPUTED");
    assert.equal(allocation.shortfallUnits, 0);
    assert.equal(allocation.totalUnits, 10);
    assert.equal(allocation.totalCostMinorUnits, 25_000);
    const customerShare = allocation.allocations.find((a) => a.participant === CUSTOMER);
    const ownerShare = allocation.allocations.find((a) => a.participant === OWNER);
    assert.equal(customerShare?.units, 4);
    assert.equal(ownerShare?.units, 6);
    assert.equal(customerShare?.committedUnits, 4);
    assert.equal(ownerShare?.committedUnits, 7);
    // Provenance: every record names the offer and commitment it derives from.
    assert.equal(customerShare?.offer, groupOffer.id);
    assert.equal(customerShare?.commitment, customerCommitment.id);
    assert.equal(ownerShare?.offer, groupOffer.id);
    assert.equal(ownerShare?.commitment, ownerCommitment.id);
    // Exact integer money (ADR-0004: evidence projection, never executed).
    assert.equal(customerShare?.costMinorUnits, 10_000);
    assert.equal(ownerShare?.costMinorUnits, 15_000);
    assert.equal(allocation.policy.ruleVersion, "group-allocation-largest-remainder-v1");

    // WRITE-THEN-RELOAD across the integration boundary: a brand-new service
    // instance over the SAME durable JSONL log continues the story — state
    // is preserved exactly, and re-applying an already-applied command is
    // refused (idempotency at the command boundary, not a silent no-op pass).
    const snapshotsBefore = service.durability().snapshots;
    viewBeforeReload = service.getCustomerView(CUSTOMER);
    service = createSurfacesService({
      statePath,
      now,
      operatorPrincipals: ["prin-operator"],
    });
    const afterReload = service.getCustomerView(CUSTOMER);
    assert.deepEqual(afterReload, viewBeforeReload);
    assert.ok(service.durability().snapshots >= snapshotsBefore);
    const duplicateEnroll = service.enrollResource(OWNER, ENROLL_INPUT);
    assert.equal(duplicateEnroll.applied, false);
    assert.match(duplicateEnroll.reason ?? "", /already enrolled/);
    const duplicateCommit = service.commitToPurchase(OWNER, {
      requestId: "gpr-communal",
      allocation: { lines: 7 },
    });
    assert.equal(duplicateCommit.applied, false);
    assert.match(duplicateCommit.reason ?? "", /withdraw it first/);
  });

  it("leg 6 — the service and usage reconcile; the customer sees the finished story through the isolated view; the Lab shadow re-runs the decision advisory-only", () => {
    assert.ok(purchaseRequest !== undefined && groupOffer !== undefined, "leg 4 must run first");

    // Fulfilment: the service is marked fulfilled from the provider-side
    // confirmation surface.
    const fulfilled = service.advancePurchaseOrder(CUSTOMER, {
      requestId: "gpr-communal",
      event: "MARK_FULFILLED",
    });
    if (!fulfilled.applied || fulfilled.order === undefined) {
      assert.fail(`fulfil refused: ${fulfilled.reason ?? "no reason"}`);
    }
    assert.equal(fulfilled.order.state, "FULFILLED");

    // RECONCILE refuses incomplete usage evidence (fail-closed).
    const premature = service.advancePurchaseOrder(CUSTOMER, {
      requestId: "gpr-communal",
      event: "RECONCILE",
      usageEvidenceComplete: false,
    });
    assert.equal(premature.applied, false);
    assert.match(premature.reason ?? "", /usage evidence incomplete/);

    // Usage evidence arrives as a fresh observation of the shared resource
    // (the observation journey supplies the evidence the reconcile guard
    // consumes; synthetic evidence object, labeled as such).
    advance(86_400_000);
    const usage = service.recordObservation(OWNER, RESOURCE, {
      status: "DEGRADED",
      freshness: t - 5_000,
      evidence: ["usage:session-log-7d"],
      declaredVersion: "1.4.0",
    });
    if (!usage.applied) {
      assert.fail(`usage observation refused: ${usage.reason ?? "no reason"}`);
    }

    const reconciled = service.advancePurchaseOrder(CUSTOMER, {
      requestId: "gpr-communal",
      event: "RECONCILE",
      usageEvidenceComplete: true,
    });
    if (!reconciled.applied || reconciled.order === undefined) {
      assert.fail(`reconcile refused: ${reconciled.reason ?? "no reason"}`);
    }
    assert.equal(reconciled.order.state, "RECONCILED");

    // The customer's isolated view shows the finished story.
    const view = service.getCustomerView(CUSTOMER);
    assert.equal(view.principal, CUSTOMER);
    assert.equal(view.resources.length, 0); // the customer owns no resource
    assert.equal(view.organizations.length, 1);
    assert.equal(view.organizations[0]?.organization, ORG);
    assert.equal(view.organizations[0]?.state, "MEMBER");
    assert.equal(view.groupPurchases.length, 1);
    assert.equal(view.groupPurchases[0]?.orderState, "RECONCILED");
    assert.equal(view.groupPurchases[0]?.committedParticipants, 2);
    assert.equal(view.groupPurchases[0]?.threshold, 2);
    assert.equal(view.groupPurchases[0]?.myCommitmentId, customerCommitment?.id);
    assert.equal(view.opportunities.length, 1);
    assert.equal(view.opportunities[0]?.recommendation, "pursue alt-communal-bundle");

    // The owner's view shows their shared resource (REVOKED > PAUSED >
    // SHARED doctrine; DEGRADED surfaced as itself).
    const ownerView = service.getCustomerView(OWNER);
    assert.equal(ownerView.resources.length, 1);
    assert.equal(ownerView.resources[0]?.resourceId, RESOURCE);
    assert.equal(ownerView.resources[0]?.share, "SHARED");
    assert.equal(ownerView.resources[0]?.status, "DEGRADED");

    // The operator aggregate spans tenants (role-gated).
    const operatorView = service.getOperatorView("prin-operator");
    assert.equal(operatorView.applied, true);
    const strangerView = service.getOperatorView(CUSTOMER);
    assert.equal(strangerView.applied, false);

    // The Lab shadow harness re-runs the SAME decision snapshot advisory
    // only: reproducible verdict, threshold outcome, no side effects.
    assert.ok(customerCommitment !== undefined && ownerCommitment !== undefined);
    const shadowScenario = {
      id: "scen-p3w1-shadow",
      arms: [
        { strategy: "baseline-status-quo", cost: 100, reliability: 0.9, utilization: 0.4 },
        { strategy: "alt-communal-bundle", cost: 80, reliability: 0.95, utilization: 0.6 },
      ],
      baselineStrategy: "baseline-status-quo",
      selectedStrategy: "alt-communal-bundle",
      confidence: 0.8,
      assumptions: ["price-stable-30d"],
      request: purchaseRequest,
      offer: groupOffer,
      commitments: [customerCommitment, ownerCommitment],
    };
    const shadow = runScenario(shadowScenario, t);
    assert.equal(shadow.verdict, "PURSUE");
    assert.equal(shadow.purchaseState, "THRESHOLD_MET");
    assert.deepEqual([...shadow.participants], [CUSTOMER, OWNER]);
    // Two independent runs over the same fixed snapshot are identical.
    assert.deepEqual(runScenario(shadowScenario, t), shadow);
  });

  it("leg 7 — durable evidence on disk for every leg; a full reload of the composed system proves idempotency/recovery", () => {
    // The surfaces state log is on disk and its snapshot count matches the
    // service's durability accounting (write-before-ack, torn-free).
    assert.ok(existsSync(statePath));
    const stateLines = readFileSync(statePath, "utf8")
      .split("\n")
      .filter((l) => l !== "");
    assert.equal(stateLines.length, service.durability().snapshots);
    assert.equal(service.durability().tornLines, 0);

    // Every persisted snapshot is a full SurfaceState document whose last
    // line carries the RECONCILED order (the fold's last-intact-wins rule).
    const lastSnapshot = JSON.parse(stateLines[stateLines.length - 1] ?? "{}") as {
      orders?: { request: string; state: string }[];
    };
    assert.equal(
      lastSnapshot.orders?.find((o) => o.request === "gpr-communal")?.state,
      "RECONCILED",
    );

    // The coordination inbox log exists with its lifecycle transition lines
    // (write-before-ack snapshots; the real-TCP outbox evidence lives in
    // the two-process restart suite).
    assert.ok(existsSync(inboxPath));
    const inboxLines = readFileSync(inboxPath, "utf8")
      .split("\n")
      .filter((l) => l !== "");
    assert.ok(inboxLines.length >= 5); // appends + lifecycle transitions

    // FULL RELOAD: a fresh service over the same durable log recovers the
    // entire story; re-driving already-applied commands stays refused
    // (idempotent command boundary); the view is byte-identical.
    const viewBefore = service.getCustomerView(CUSTOMER);
    service = createSurfacesService({
      statePath,
      now,
      operatorPrincipals: ["prin-operator"],
    });
    assert.deepEqual(service.getCustomerView(CUSTOMER), viewBefore);
    const replayedLab = service.runLabEvaluation({
      id: "lab-communal",
      intent: INTENT,
      baseline: { strategy: "baseline-status-quo", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt-communal-bundle", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt-communal-bundle",
      confidence: 0.8,
      assumptions: [],
    });
    assert.equal(replayedLab.applied, false);
    assert.match(replayedLab.reason ?? "", /already exists/);
    const replayedForm = service.formOrganization(CUSTOMER, {
      organization: ORG,
      pursuitEvidenceId: "lab-communal-opportunity",
      candidates: [
        { principal: CUSTOMER, consent: true, consentRecordedAt: t },
        { principal: OWNER, consent: true, consentRecordedAt: t },
      ],
      minFounders: 2,
      authorityScope: "group",
      initialMandates: [],
    });
    assert.equal(replayedForm.applied, false);
    assert.match(replayedForm.reason ?? "", /already exists in state/);
    // Refused commands never persisted anything (log length unchanged).
    assert.equal(
      readFileSync(statePath, "utf8")
        .split("\n")
        .filter((l) => l !== "").length,
      stateLines.length,
    );
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
