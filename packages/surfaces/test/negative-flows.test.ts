import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSurfacesService, buildCustomerView } from "../src/contract.js";
import { discoverResources } from "@adcos/coordination";
import { advanceMembership } from "@adcos/organizations";
import { evaluateCommitments } from "@adcos/group-purchasing";
import type { ResourceProjectionReference } from "@adcos/contracts";

// ============================================================================
// Negative / error / unknown flows (P2-W1 round 2, INVARIANTS #5):
// - expired consent/evidence resumption refused (no silent resume, no stale
//   verdicts founding organizations, expired requests refuse commitments);
// - revoked share state rendered unusable (view + discovery + commands);
// - UNKNOWN ≠ STALE ≠ DEGRADED surfaced distinctly everywhere (views, fleet
//   aggregates, discovery) — never collapsed into silent success/failure;
// - authorization failures at the COMMAND boundary (tenant isolation is not
//   only a view property);
// - malformed/inconsistent inputs fail closed with explicit reasons.
// ============================================================================

const dir = mkdtempSync(join(tmpdir(), "adcos-surfaces-negative-"));
const path = (name: string): string => join(dir, `${name}.jsonl`);

const enroll = {
  id: "res-neg",
  device: "dev-neg",
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
};

const resource = (
  overrides: Partial<ResourceProjectionReference> = {},
): ResourceProjectionReference => ({
  id: "res-neg",
  owner: "prin-alice",
  device: "dev-neg",
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
  status: "UNKNOWN",
  revoked: false,
  ...overrides,
});

describe("expired-consent / expired-evidence resumption refused", () => {
  it("RESUME from NOT_SHARED is refused — no silent resume (service level)", () => {
    const service = createSurfacesService({ statePath: path("neg-1"), now: () => 1_000 });
    service.enrollResource("prin-alice", enroll);
    const refused = service.applyConsentEvent("prin-alice", "res-neg", "RESUME");
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /not legal in state NOT_SHARED/);
    // OPT_OUT then RESUME is equally refused: only a fresh OPT_IN re-enters.
    service.applyConsentEvent("prin-alice", "res-neg", "OPT_IN");
    service.applyConsentEvent("prin-alice", "res-neg", "OPT_OUT");
    const afterOptOut = service.applyConsentEvent("prin-alice", "res-neg", "RESUME");
    assert.equal(afterOptOut.applied, false);
    assert.match(afterOptOut.reason ?? "", /not legal in state NOT_SHARED/);
    const fresh = service.applyConsentEvent("prin-alice", "res-neg", "OPT_IN");
    assert.equal(fresh.applied, true);
  });

  it("founding from EXPIRED Lab evidence is refused — stale verdicts cannot found", () => {
    const t0 = 1_700_000_000_000;
    let t = t0;
    const service = createSurfacesService({ statePath: path("neg-2"), now: () => t });
    service.runLabEvaluation({
      id: "lab-stale",
      intent: "intent-stale",
      baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt",
      confidence: 0.8,
      assumptions: [],
      expiresAt: t0 + 10_000, // evidence valid for 10s only
    });
    t = t0 + 60_000; // the clock passes the evidence expiry
    const refused = service.formOrganization("prin-alice", {
      organization: "org-stale",
      pursuitEvidenceId: "lab-stale-opportunity",
      candidates: [{ principal: "prin-alice", consent: true, consentRecordedAt: t }],
      minFounders: 1,
      authorityScope: "group",
      initialMandates: [{ principal: "prin-alice", scope: "group", permissions: ["all"] }],
    });
    assert.equal(refused.applied, false);
    assert.equal(refused.founding?.state, "FORMATION_FAILED");
    assert.match(refused.reason ?? "", /expired — re-evaluate before founding/);
  });

  it("founding without persisted evidence is refused (the Lab proposes; evidence must exist)", () => {
    const service = createSurfacesService({ statePath: path("neg-3"), now: () => 1_000 });
    const refused = service.formOrganization("prin-alice", {
      organization: "org-no-evidence",
      pursuitEvidenceId: "lab-never-run",
      candidates: [{ principal: "prin-alice", consent: true, consentRecordedAt: 1_000 }],
      minFounders: 1,
      authorityScope: "group",
      initialMandates: [{ principal: "prin-alice", scope: "group", permissions: ["all"] }],
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /no persisted Lab evidence/);
  });

  it("founding from a REJECT verdict is refused (fail-closed)", () => {
    const service = createSurfacesService({ statePath: path("neg-4"), now: () => 1_000 });
    // Expensive selected arm → the economics verdict is REJECT.
    service.runLabEvaluation({
      id: "lab-reject",
      intent: "intent-reject",
      baseline: { strategy: "baseline", cost: 80, reliability: 0.95 },
      alternatives: [{ strategy: "alt-costly", cost: 200, reliability: 0.9 }],
      selectedStrategy: "alt-costly",
      confidence: 0.9,
      assumptions: [],
    });
    const refused = service.formOrganization("prin-alice", {
      organization: "org-reject",
      pursuitEvidenceId: "lab-reject-opportunity",
      candidates: [{ principal: "prin-alice", consent: true, consentRecordedAt: 1_000 }],
      minFounders: 1,
      authorityScope: "group",
      initialMandates: [{ principal: "prin-alice", scope: "group", permissions: ["all"] }],
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /cannot found an organization/);
  });

  it("an EXPIRED request refuses new commitments and surfaces EXPIRED", () => {
    const t0 = 1_700_000_000_000;
    let t = t0;
    const service = createSurfacesService({ statePath: path("neg-5"), now: () => t });
    service.runLabEvaluation({
      id: "lab-exp",
      intent: "intent-exp",
      baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt",
      confidence: 0.8,
      assumptions: [],
    });
    service.formOrganization("prin-alice", {
      organization: "org-exp",
      pursuitEvidenceId: "lab-exp-opportunity",
      candidates: [
        { principal: "prin-alice", consent: true, consentRecordedAt: t },
        { principal: "prin-bob", consent: true, consentRecordedAt: t },
      ],
      minFounders: 2,
      authorityScope: "group",
      initialMandates: [
        { principal: "prin-alice", scope: "group", permissions: ["all"] },
        { principal: "prin-bob", scope: "group.purchase", permissions: ["commitment:write"] },
      ],
    });
    service.openGroupPurchase("prin-alice", {
      id: "gpr-exp",
      intent: "intent-exp",
      organization: "org-exp",
      requirements: {},
      threshold: 2,
      expiresAt: t0 + 5_000, // expires in 5s
    });
    t = t0 + 60_000; // the clock passes the request expiry
    const refused = service.commitToPurchase("prin-alice", {
      requestId: "gpr-exp",
      allocation: { lines: 1 },
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /expired — commitments are no longer accepted/);
    // The view surfaces EXPIRED (expiry dominates).
    const view = service.getCustomerView("prin-alice");
    assert.equal(view.groupPurchases[0]?.state, "EXPIRED");
  });

  it("an expired membership refuses lifecycle events (renewal required) — merged machine, public contract", () => {
    const now = 1_700_000_000_000;
    const expired = {
      id: "mem-exp",
      organization: "org-exp",
      principal: "prin-alice",
      state: "MEMBER" as const,
      role: "member",
      joinedAt: now - 10_000,
      expiresAt: now - 1_000, // already expired
      revoked: false,
    };
    const refused = advanceMembership(expired, "SUSPEND", now);
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /membership expired; renewal flow required/);
  });

  it("an expired commitment is skipped by threshold evaluation — noted, not counted", () => {
    const now = 1_700_000_000_000;
    const request = {
      id: "gpr-x",
      intent: "intent-x",
      organization: "org-x",
      requirements: {},
      participants: [],
      threshold: 1,
      expiresAt: now + 86_400_000,
    };
    const offer = {
      id: "gpo-x",
      request: "gpr-x",
      supplier: "s",
      product: "p",
      capability: "c",
      region: "GH",
      quantity: 1,
      perMemberCost: 1,
      totalCost: 1,
      recurringCharges: [],
      oneTimeCharges: [],
      term: "t",
      limitations: [],
      expiry: now + 1_000,
      provenance: "test",
    };
    const evaluation = evaluateCommitments(
      request,
      offer,
      [
        {
          id: "gpc-x",
          request: "gpr-x",
          offer: "gpo-x",
          participant: "prin-old",
          allocation: { lines: 1 },
          acceptedAt: now - 10_000,
          expiresAt: now - 1_000, // expired commitment
          revoked: false,
        },
      ],
      now,
    );
    assert.equal(evaluation.thresholdMet, false);
    assert.equal(evaluation.participants.length, 0);
    assert.ok(evaluation.notes.some((n) => n.includes("expired — skipped")));
  });
});

describe("revoked share state rendered unusable", () => {
  it("the customer view shows REVOKED; discovery never matches; commands refuse", () => {
    const service = createSurfacesService({ statePath: path("neg-6"), now: () => 1_000 });
    service.enrollResource("prin-alice", enroll);
    service.applyConsentEvent("prin-alice", "res-neg", "OPT_IN");
    assert.equal(service.getCustomerView("prin-alice").resources[0]?.share, "SHARED");

    const revoked = service.revokeResource("prin-alice", "res-neg");
    assert.equal(revoked.applied, true);

    // View: REVOKED dominates (even though the consent journey said SHARED).
    const view = service.getCustomerView("prin-alice");
    assert.equal(view.resources[0]?.share, "REVOKED");

    // Coordination discovery never matches a revoked resource.
    const discovered = discoverResources(
      [resource({ revoked: true, status: "DEGRADED", freshness: 1_000 })],
      [],
      { capability: "forwarding-v1" },
      1_000,
    );
    assert.equal(discovered.length, 0);

    // Consent events on a revoked resource are refused (terminal).
    const consentRefused = service.applyConsentEvent("prin-alice", "res-neg", "OPT_IN");
    assert.equal(consentRefused.applied, false);
    assert.match(consentRefused.reason ?? "", /revoked \(terminal\)/);

    // Observations on a revoked resource are refused.
    const observationRefused = service.recordObservation("prin-alice", "res-neg", {
      status: "DEGRADED",
      declaredVersion: "1.0.0",
    });
    assert.equal(observationRefused.applied, false);
    assert.match(observationRefused.reason ?? "", /revoked — observations are no longer accepted/);

    // Re-revocation is refused (idempotent refusal, no double terminal write).
    const again = service.revokeResource("prin-alice", "res-neg");
    assert.equal(again.applied, false);
    assert.match(again.reason ?? "", /already revoked/);
  });
});

describe("UNKNOWN / STALE / DEGRADED surfaced distinctly", () => {
  it("an enrolled-but-unobserved resource is UNKNOWN with no fabricated freshness", () => {
    const service = createSurfacesService({ statePath: path("neg-7"), now: () => 1_000 });
    service.enrollResource("prin-alice", enroll);
    const card = service.getCustomerView("prin-alice").resources[0];
    assert.equal(card?.status, "UNKNOWN");
    assert.equal(card?.freshness, undefined);
    // Opt-in surfaces SHARED sharing-intent with UNKNOWN health: distinct axes.
    service.applyConsentEvent("prin-alice", "res-neg", "OPT_IN");
    const opted = service.getCustomerView("prin-alice").resources[0];
    assert.equal(opted?.share, "SHARED");
    assert.equal(opted?.status, "UNKNOWN");
  });

  it("STALE and DEGRADED observations surface as themselves, never as each other", () => {
    const service = createSurfacesService({ statePath: path("neg-8"), now: () => 1_000 });
    service.enrollResource("prin-alice", { ...enroll, id: "res-stale" });
    service.enrollResource("prin-alice", { ...enroll, id: "res-degraded" });
    service.recordObservation("prin-alice", "res-stale", {
      status: "STALE",
      declaredVersion: "1.0.0",
    });
    service.recordObservation("prin-alice", "res-degraded", {
      status: "DEGRADED",
      declaredVersion: "1.0.0",
    });
    const statuses = new Map(
      service.getCustomerView("prin-alice").resources.map((r) => [r.resourceId, r.status]),
    );
    assert.equal(statuses.get("res-stale"), "STALE");
    assert.equal(statuses.get("res-degraded"), "DEGRADED");
    // Distinctness: the three observable states never collapse.
    assert.notEqual(statuses.get("res-stale"), statuses.get("res-degraded"));

    // Discovery excludes the unusable set by default but keeps STALE and
    // DEGRADED visible WITH their status (never silently dropped). Each
    // resource carries a distinct capability: the landed discovery
    // associates observations by declared capability (first match wins).
    const resources = [
      resource({ id: "r-unknown", capability: "cap-unknown" }),
      resource({ id: "r-stale", capability: "cap-stale", status: "STALE", freshness: 1_000 }),
      resource({
        id: "r-degraded",
        capability: "cap-degraded",
        status: "DEGRADED",
        freshness: 1_000,
      }),
      resource({ id: "r-failed", capability: "cap-failed", status: "FAILED", freshness: 1_000 }),
      resource({
        id: "r-terminated",
        capability: "cap-terminated",
        status: "TERMINATED",
        freshness: 1_000,
      }),
    ];
    const observations = resources.map((r) => ({
      declared: {
        capability: r.capability,
        version: "1.0.0",
        schedule: {},
        limits: { maxSessions: 2 },
      },
      observed:
        r.status === "UNKNOWN"
          ? { status: "UNKNOWN" as const }
          : { status: r.status, freshness: 1_000 },
      evidenceClass: "OBSERVATION" as const,
    }));
    const found = resources
      .map((r) => discoverResources([r], observations, { capability: r.capability }, 1_000)[0])
      .filter((f) => f !== undefined);
    assert.deepEqual(found.map((f) => f.observationStatus).sort(), [
      "DEGRADED",
      "STALE",
      "UNKNOWN",
    ]);
    // With a freshness requirement, the never-observed UNKNOWN is excluded
    // (no freshness to prove recency) — reported by absence, never guessed.
    const fresh = resources
      .map(
        (r) =>
          discoverResources(
            [r],
            observations,
            { capability: r.capability, minFreshness: 500 },
            1_000,
          )[0],
      )
      .filter((f) => f !== undefined);
    assert.deepEqual(fresh.map((f) => f.observationStatus).sort(), ["DEGRADED", "STALE"]);
  });

  it("the operator fleet aggregate counts UNKNOWN/STALE/DEGRADED separately", () => {
    const service = createSurfacesService({
      statePath: path("neg-9"),
      now: () => 1_000,
      operatorPrincipals: ["prin-operator"],
    });
    service.enrollResource("prin-a", { ...enroll, id: "res-u" });
    service.enrollResource("prin-b", { ...enroll, id: "res-s" });
    service.enrollResource("prin-c", { ...enroll, id: "res-d" });
    service.recordObservation("prin-b", "res-s", { status: "STALE", declaredVersion: "1" });
    service.recordObservation("prin-c", "res-d", { status: "DEGRADED", declaredVersion: "1" });
    const result = service.getOperatorView("prin-operator");
    assert.equal(result.applied, true);
    assert.equal(result.view?.fleet.byStatus.UNKNOWN, 1);
    assert.equal(result.view?.fleet.byStatus.STALE, 1);
    assert.equal(result.view?.fleet.byStatus.DEGRADED, 1);
    assert.equal(result.view?.fleet.byStatus.FAILED, 0);
  });
});

describe("command-boundary tenant isolation (not just views)", () => {
  it("a non-owner cannot drive another principal's consent, revocation or observation", () => {
    const service = createSurfacesService({ statePath: path("neg-10"), now: () => 1_000 });
    service.enrollResource("prin-alice", enroll);
    for (const refused of [
      service.applyConsentEvent("prin-bob", "res-neg", "OPT_IN"),
      service.revokeResource("prin-bob", "res-neg"),
      service.recordObservation("prin-bob", "res-neg", {
        status: "DEGRADED",
        declaredVersion: "1.0.0",
      }),
    ]) {
      assert.equal(refused.applied, false);
      assert.match(refused.reason ?? "", /owned by 'prin-alice'/);
    }
    // Nothing persisted: the owner's journey is untouched.
    assert.equal(service.getCustomerView("prin-alice").resources[0]?.share, "NOT_SHARED");
  });

  it("unknown ids fail closed with explicit reasons", () => {
    const service = createSurfacesService({ statePath: path("neg-11"), now: () => 1_000 });
    assert.match(
      service.applyConsentEvent("prin-alice", "res-none", "OPT_IN").reason ?? "",
      /unknown resource/,
    );
    assert.match(service.revokeResource("prin-alice", "res-none").reason ?? "", /unknown resource/);
    assert.match(
      service.commitToPurchase("prin-alice", { requestId: "gpr-none", allocation: {} }).reason ??
        "",
      /unknown request/,
    );
    assert.match(
      service.withdrawCommitment("prin-alice", "gpc-none").reason ?? "",
      /unknown commitment/,
    );
    assert.match(
      service.advancePurchaseOrder("prin-alice", { requestId: "gpr-none", event: "AUTHORIZE" })
        .reason ?? "",
      /unknown request/,
    );
    assert.match(
      service.applyMembershipEvent("prin-alice", {
        organization: "org-none",
        principal: "prin-alice",
        event: "INVITE",
      }).reason ?? "",
      /no membership record/,
    );
  });
});

describe("malformed / inconsistent inputs fail closed", () => {
  it("an offer with inconsistent totals is refused (stated vs computed)", () => {
    const service = createSurfacesService({ statePath: path("neg-12"), now: () => 1_000 });
    service.runLabEvaluation({
      id: "lab-bad",
      intent: "intent-bad",
      baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt",
      confidence: 0.8,
      assumptions: [],
    });
    service.formOrganization("prin-alice", {
      organization: "org-bad",
      pursuitEvidenceId: "lab-bad-opportunity",
      candidates: [{ principal: "prin-alice", consent: true, consentRecordedAt: 1_000 }],
      minFounders: 1,
      authorityScope: "group",
      initialMandates: [{ principal: "prin-alice", scope: "group", permissions: ["all"] }],
    });
    service.openGroupPurchase("prin-alice", {
      id: "gpr-bad",
      intent: "intent-bad",
      organization: "org-bad",
      requirements: {},
      threshold: 1,
      expiresAt: 1_000 + 86_400_000,
    });
    const refused = service.receiveOffer("prin-alice", {
      id: "gpo-bad",
      request: "gpr-bad",
      supplier: "teleco-x",
      product: "p",
      capability: "c",
      region: "GH",
      quantity: 10,
      perMemberCost: 12.5,
      totalCost: 999, // inconsistent with perMemberCost × quantity
      recurringCharges: [],
      oneTimeCharges: [],
      term: "t",
      limitations: [],
      expiry: 1_000 + 172_800_000,
      provenance: "unicom-listing",
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /totals inconsistent/);
  });

  it("an already-expired offer is refused at receive time", () => {
    const service = createSurfacesService({ statePath: path("neg-13"), now: () => 10_000 });
    service.runLabEvaluation({
      id: "lab-old",
      intent: "intent-old",
      baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt",
      confidence: 0.8,
      assumptions: [],
    });
    service.formOrganization("prin-alice", {
      organization: "org-old",
      pursuitEvidenceId: "lab-old-opportunity",
      candidates: [{ principal: "prin-alice", consent: true, consentRecordedAt: 10_000 }],
      minFounders: 1,
      authorityScope: "group",
      initialMandates: [{ principal: "prin-alice", scope: "group", permissions: ["all"] }],
    });
    service.openGroupPurchase("prin-alice", {
      id: "gpr-old",
      intent: "intent-old",
      organization: "org-old",
      requirements: {},
      threshold: 1,
      expiresAt: 10_000 + 86_400_000,
    });
    const refused = service.receiveOffer("prin-alice", {
      id: "gpo-old",
      request: "gpr-old",
      supplier: "s",
      product: "p",
      capability: "c",
      region: "GH",
      quantity: 1,
      perMemberCost: 1,
      totalCost: 1,
      recurringCharges: [],
      oneTimeCharges: [],
      term: "t",
      limitations: [],
      expiry: 5_000, // already in the past
      provenance: "test",
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /already expired/);
  });

  it("illegal order events are refused by the machine with its own reasons", () => {
    const service = createSurfacesService({ statePath: path("neg-14"), now: () => 1_000 });
    service.runLabEvaluation({
      id: "lab-illegal",
      intent: "intent-illegal",
      baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt",
      confidence: 0.8,
      assumptions: [],
    });
    service.formOrganization("prin-alice", {
      organization: "org-illegal",
      pursuitEvidenceId: "lab-illegal-opportunity",
      candidates: [{ principal: "prin-alice", consent: true, consentRecordedAt: 1_000 }],
      minFounders: 1,
      authorityScope: "group",
      initialMandates: [{ principal: "prin-alice", scope: "group", permissions: ["all"] }],
    });
    service.openGroupPurchase("prin-alice", {
      id: "gpr-illegal",
      intent: "intent-illegal",
      organization: "org-illegal",
      requirements: {},
      threshold: 1,
      expiresAt: 1_000 + 86_400_000,
    });
    // AUTHORIZE before the threshold is met: refused (threshold not met).
    const early = service.advancePurchaseOrder("prin-alice", {
      requestId: "gpr-illegal",
      event: "AUTHORIZE",
    });
    assert.equal(early.applied, false);
    assert.match(early.reason ?? "", /threshold not met/);
    // A nonsense event for the state: refused by the order machine.
    const nonsense = service.advancePurchaseOrder("prin-alice", {
      requestId: "gpr-illegal",
      event: "CONFIRM_CONTRACT",
    });
    assert.equal(nonsense.applied, false);
    assert.match(nonsense.reason ?? "", /not legal in state COMMITMENT_OPEN/);
  });

  it("withdrawal of another principal's commitment is refused; post-threshold withdrawal points to the collective path", () => {
    const service = createSurfacesService({ statePath: path("neg-15"), now: () => 1_000 });
    service.runLabEvaluation({
      id: "lab-w",
      intent: "intent-w",
      baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt",
      confidence: 0.8,
      assumptions: [],
    });
    service.formOrganization("prin-alice", {
      organization: "org-w",
      pursuitEvidenceId: "lab-w-opportunity",
      candidates: [
        { principal: "prin-alice", consent: true, consentRecordedAt: 1_000 },
        { principal: "prin-bob", consent: true, consentRecordedAt: 1_000 },
      ],
      minFounders: 2,
      authorityScope: "group",
      initialMandates: [
        { principal: "prin-alice", scope: "group", permissions: ["all"] },
        { principal: "prin-bob", scope: "group.purchase", permissions: ["commitment:write"] },
      ],
    });
    service.openGroupPurchase("prin-alice", {
      id: "gpr-w",
      intent: "intent-w",
      organization: "org-w",
      requirements: {},
      threshold: 2,
      expiresAt: 1_000 + 86_400_000,
    });
    service.receiveOffer("prin-alice", {
      id: "gpo-w",
      request: "gpr-w",
      supplier: "s",
      product: "p",
      capability: "c",
      region: "GH",
      quantity: 2,
      perMemberCost: 1,
      totalCost: 2,
      recurringCharges: [],
      oneTimeCharges: [],
      term: "t",
      limitations: [],
      expiry: 1_000 + 172_800_000,
      provenance: "test",
    });
    const aliceCommit = service.commitToPurchase("prin-alice", {
      requestId: "gpr-w",
      allocation: { lines: 1 },
    });
    assert.equal(aliceCommit.applied, true);

    // Bob cannot withdraw alice's commitment.
    const foreign = service.withdrawCommitment("prin-bob", aliceCommit.commitment?.id ?? "");
    assert.equal(foreign.applied, false);
    assert.match(foreign.reason ?? "", /only the participant may withdraw/);

    service.commitToPurchase("prin-bob", { requestId: "gpr-w", allocation: { lines: 1 } });
    // After THRESHOLD_MET the individual exit is closed: the collective
    // order-lifecycle path (WITHDRAW/CANCEL) is the honest route.
    const postThreshold = service.withdrawCommitment(
      "prin-alice",
      aliceCommit.commitment?.id ?? "",
    );
    assert.equal(postThreshold.applied, false);
    assert.match(
      postThreshold.reason ?? "",
      /individual withdrawal is only possible in the open phase/,
    );
  });

  it("a duplicate resource id or request id is refused (no silent overwrite)", () => {
    const service = createSurfacesService({ statePath: path("neg-16"), now: () => 1_000 });
    assert.equal(service.enrollResource("prin-alice", enroll).applied, true);
    const duplicate = service.enrollResource("prin-bob", enroll);
    assert.equal(duplicate.applied, false);
    assert.match(duplicate.reason ?? "", /already enrolled/);
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
