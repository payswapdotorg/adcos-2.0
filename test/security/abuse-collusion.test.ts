import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// P4-W1 round-2 — ABUSE / SYBIL / COLLUSION BATTERY. Composed through PUBLIC
// contract entry points ONLY (same import discipline as the round-1 battery
// test/security/isolation.test.ts): no package-internal imports, no package
// src/ edits, adcos-contracts FROZEN.
//
// Classes proven here (spec/work-orders.md P4-W1: "abuse/rate/Sybil/collusion
// controls" + INVARIANTS #8/#21/#22/#23/#24/#25):
//   1. Sybil registration floods hit the refusal/quota surfaces the contract
//      actually has: id-uniqueness (resource/organization/request/offer
//      namespaces) refuses duplicate-id floods with NO state multiplication,
//      and membership self-bootstrap is refused (no mandate, no consent
//      path). HONEST LIMIT (asserted as a documented gap probe, not a
//      guarantee): DISTINCT-id floods are NOT cardinality-bounded on this
//      public surface — recorded PARTIAL in the round-2 report;
//   2. a member ring self-dealing a group purchase gains nothing it could
//      not get alone: fabricated volume discounts (understated totals) are
//      refused by the arithmetic-consistency guard; duplicate-commitment
//      inflation is refused at the surfaces boundary AND counted-once by
//      the threshold evaluation (committed allocation cannot be inflated);
//      cross-member withdrawal theft is refused;
//   3. revoke/re-request griefing loops cannot wedge state: consent
//      opt-in/opt-out cycles, commit/withdraw/re-commit cycles and terminal
//      revocation each leave consistent state and the surface keeps working
//      after every cycle;
//   4. offer spam is refused on the id/expiry/totals surfaces the contract
//      has (duplicate ids, expired offers, inconsistent totals) — distinct-id
//      valid offers are not quota-bounded (documented gap probe).
//
// Asserted guarantees are the CONTRACT's only; absent classes are marked
// PARTIAL/GAP in docs/reports/security/round-2-report.md — never invented.
// ============================================================================

import {
  createSurfacesService,
  JsonlSurfaceStateStore,
} from "../../packages/surfaces/src/contract.js";
import { evaluateCommitments } from "../../packages/group-purchasing/src/contract.js";
import type {
  GroupPurchaseRequest,
  GroupPurchaseOffer,
  GroupPurchaseCommitment,
} from "../../packages/adcos-contracts/src/index.js";

type Service = ReturnType<typeof createSurfacesService>;

const T0 = 1_700_000_000_000;
const ALICE = "prin-alice-ab";
const MEMBER = "prin-member-ab";
const OUTSIDER = "prin-outsider-ab";

const dir = mkdtempSync(join(tmpdir(), "adcos-p4w1-abuse-"));
const path = (name: string): string => join(dir, `${name}.jsonl`);

const service = (name: string, clock: () => number = () => T0): Service =>
  createSurfacesService({ statePath: path(name), now: clock });

const enroll = (id: string) => ({
  id,
  device: `dev-${id}`,
  type: "phone",
  capability: "forwarding-v1",
  modes: ["local", "relay"],
  limits: { maxSessions: 2 },
});

/**
 * Found an organization through the public journey (Lab evidence → formation).
 * The organizer holds a durable group-wide mandate; each optional member gets
 * a mandate ONLY when `mandate` is provided ({ expiresAt } = expiring).
 */
const foundOrg = (
  svc: Service,
  opts: {
    labId: string;
    orgId: string;
    organizer: string;
    members?: Array<{ principal: string; mandate?: { scope?: string; expiresAt?: number } }>;
    now: number;
  },
) => {
  const evaluated = svc.runLabEvaluation({
    id: opts.labId,
    intent: `intent-${opts.labId}`,
    baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
    alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
    selectedStrategy: "alt",
    confidence: 0.8,
    assumptions: [],
  });
  assert.equal(evaluated.applied, true, evaluated.reason ?? "lab evaluation must apply");
  const members = opts.members ?? [];
  return svc.formOrganization(opts.organizer, {
    organization: opts.orgId,
    pursuitEvidenceId: `${opts.labId}-opportunity`,
    candidates: [
      { principal: opts.organizer, consent: true, consentRecordedAt: opts.now },
      ...members.map((m) => ({
        principal: m.principal,
        consent: true,
        consentRecordedAt: opts.now,
      })),
    ],
    minFounders: 1 + members.length,
    authorityScope: "group",
    initialMandates: [
      { principal: opts.organizer, scope: "group", permissions: ["all"] },
      ...(members ?? [])
        .filter((m) => m.mandate !== undefined)
        .map((m) => ({
          principal: m.principal,
          scope: m.mandate?.scope ?? "group.purchase",
          permissions: ["commitment:write"],
          ...(m.mandate?.expiresAt !== undefined ? { expiresAt: m.mandate.expiresAt } : {}),
        })),
    ],
  });
};

const offer = (id: string, request: string, quantity: number, t: number) => ({
  id,
  request,
  supplier: "teleco-x",
  product: "data-bundle-10gb",
  capability: "data-plan-v2",
  region: "GH",
  quantity,
  perMemberCost: 25,
  totalCost: 25 * quantity,
  recurringCharges: [],
  oneTimeCharges: [],
  term: "12-months",
  limitations: ["fair-use"],
  expiry: t + 1_728_000_000,
  provenance: "unicom-listing:p4w1-r2-abuse",
});

describe("Sybil registration floods hit the id-uniqueness refusal surfaces", () => {
  it("a duplicate-id enrollment flood is refused after the first write — the resource namespace never multiplies", () => {
    const svc = service("sybil-dup");
    assert.equal(svc.enrollResource(ALICE, enroll("res-sybil")).applied, true);
    for (let i = 0; i < 30; i += 1) {
      const flood = svc.enrollResource(ALICE, enroll("res-sybil"));
      assert.equal(flood.applied, false, `flood attempt ${i} must be refused`);
      assert.match(flood.reason ?? "", /resource 'res-sybil' is already enrolled/);
    }
    // No state multiplication: exactly one resource row, under one snapshot.
    assert.equal(svc.getCustomerView(ALICE).resources.length, 1);
    assert.equal(new JsonlSurfaceStateStore(path("sybil-dup")).restore().resources.length, 1);
  });

  it("duplicate organization/request/offer-id floods are refused — each namespace holds exactly one row", () => {
    let t = T0;
    const svc = service("sybil-namespaces", () => t);
    assert.equal(
      foundOrg(svc, { labId: "lab-sybil-ns", orgId: "org-sybil-ns", organizer: ALICE, now: t })
        .applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-sybil-ns",
        intent: "intent-sybil-ns",
        organization: "org-sybil-ns",
        requirements: {},
        threshold: 1,
        expiresAt: t + 86_400_000,
      }).applied,
      true,
    );
    assert.equal(
      svc.receiveOffer(ALICE, offer("gpo-sybil-ns", "gpr-sybil-ns", 1, t)).applied,
      true,
    );

    // Flood each namespace with the SAME id 20 times: all refused.
    for (let i = 0; i < 20; i += 1) {
      const org = foundOrg(svc, {
        labId: `lab-flood-${i}`,
        orgId: "org-sybil-ns",
        organizer: ALICE,
        now: t,
      });
      assert.equal(org.applied, false, `org flood ${i} must be refused`);
      const request = svc.openGroupPurchase(ALICE, {
        id: "gpr-sybil-ns",
        intent: "intent-flood",
        organization: "org-sybil-ns",
        requirements: {},
        threshold: 1,
        expiresAt: t + 86_400_000,
      });
      assert.equal(request.applied, false, `request flood ${i} must be refused`);
      const offerFlood = svc.receiveOffer(ALICE, offer("gpo-sybil-ns", "gpr-sybil-ns", 1, t));
      assert.equal(offerFlood.applied, false, `offer flood ${i} must be refused`);
    }

    const restored = new JsonlSurfaceStateStore(path("sybil-namespaces")).restore();
    assert.equal(restored.memberships.filter((m) => m.organization === "org-sybil-ns").length, 1);
    assert.equal(restored.requests.length, 1);
    assert.equal(restored.offers.length, 1);
  });

  it("membership self-bootstrap is refused: an outsider inviting themselves lacks the mandate AND the consent path", () => {
    let t = T0;
    const svc = service("sybil-bootstrap", () => t);
    assert.equal(
      foundOrg(svc, { labId: "lab-sybil-b", orgId: "org-sybil-b", organizer: ALICE, now: t })
        .applied,
      true,
    );
    const selfInvite = svc.inviteMember(OUTSIDER, {
      organization: "org-sybil-b",
      principal: OUTSIDER,
    });
    assert.equal(selfInvite.applied, false);
    assert.match(
      selfInvite.reason ?? "",
      /inviting requires an active membership-management mandate \('group\.membership'\) in 'org-sybil-b' held by 'prin-outsider-ab'/,
    );
    // Nothing was persisted for the outsider.
    assert.equal(svc.getCustomerView(OUTSIDER).organizations.length, 0);
  });

  it("GAP PROBE (documented, not a guarantee): a DISTINCT-id enrollment flood is not cardinality-bounded on this surface", () => {
    const svc = service("sybil-distinct");
    for (let i = 0; i < 50; i += 1) {
      const row = svc.enrollResource(ALICE, enroll(`res-sybil-d-${i}`));
      // This asserts CURRENT contract behavior to evidence the gap: the
      // public enrollment surface has no count quota — only id uniqueness.
      // PARTIAL in the round-2 report; no invented quota is asserted.
      assert.equal(row.applied, true, `distinct id ${i} enrolls (no cardinality quota)`);
    }
    assert.equal(svc.getCustomerView(ALICE).resources.length, 50);
  });
});

describe("a member ring self-dealing a group purchase gains nothing it could not get alone", () => {
  it("a fabricated volume discount (understated totals) is refused by the arithmetic-consistency guard", () => {
    let t = T0;
    const svc = service("ring-totals", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-ring-t",
        orgId: "org-ring-t",
        organizer: ALICE,
        members: [
          { principal: MEMBER, mandate: {} },
          { principal: "prin-ring-2", mandate: {} },
        ],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-ring-t",
        intent: "intent-ring-t",
        organization: "org-ring-t",
        requirements: {},
        threshold: 3,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    // The ring's insider "offer": per-member roll-up is 25 × 3 = 75, but the
    // stated total is 60 — a 15-unit discount no individual could obtain.
    const selfDealing = svc.receiveOffer(ALICE, {
      ...offer("gpo-ring-t", "gpr-ring-t", 3, t),
      totalCost: 60,
    });
    assert.equal(selfDealing.applied, false);
    assert.match(
      selfDealing.reason ?? "",
      /offer 'gpo-ring-t' totals inconsistent: stated totalCost 60 does not match the per-member roll-up 25 × 3/,
    );
    // Nothing was persisted by the refused offer.
    assert.equal(new JsonlSurfaceStateStore(path("ring-totals")).restore().offers.length, 0);
  });

  it("duplicate-commitment inflation is refused at the boundary AND counted-once by the threshold evaluation", () => {
    let t = T0;
    const svc = service("ring-duplicate", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-ring-d",
        orgId: "org-ring-d",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-ring-d",
        intent: "intent-ring-d",
        organization: "org-ring-d",
        requirements: {},
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-ring-d", "gpr-ring-d", 2, t)).applied, true);
    const first = svc.commitToPurchase(ALICE, {
      requestId: "gpr-ring-d",
      allocation: { lines: 1 },
    });
    assert.equal(first.applied, true, first.reason ?? "commit must apply");
    // The SAME participant re-commits (double allocation attempt): refused.
    const second = svc.commitToPurchase(ALICE, {
      requestId: "gpr-ring-d",
      allocation: { lines: 5 },
    });
    assert.equal(second.applied, false);
    assert.match(
      second.reason ?? "",
      /'prin-alice-ab' already holds commitment 'gpr-ring-d-commit-prin-alice-ab-0' on request 'gpr-ring-d' — withdraw it first/,
    );

    // And the evaluation layer independently counts duplicates once, so even
    // smuggled duplicate rows cannot inflate the committed allocation.
    const request: GroupPurchaseRequest = {
      id: "gpr-eval-d",
      intent: "intent-eval-d",
      organization: "org-ring-d",
      requirements: {},
      participants: [],
      threshold: 2,
      expiresAt: t + 86_400_000,
    };
    const evalOffer: GroupPurchaseOffer = offer("gpo-eval-d", "gpr-eval-d", 2, t);
    const ringCommitment = (
      id: string,
      participant: string,
      lines: number,
    ): GroupPurchaseCommitment => ({
      id,
      request: request.id,
      offer: evalOffer.id,
      participant,
      allocation: { lines },
      acceptedAt: t,
      revoked: false,
    });
    const evaluation = evaluateCommitments(
      request,
      evalOffer,
      [
        ringCommitment("c-ring-1", "prin-ring-a", 5),
        ringCommitment("c-ring-2", "prin-ring-a", 3), // duplicate participant
        ringCommitment("c-ring-3", "prin-ring-b", 2),
      ],
      t,
    );
    assert.deepEqual(evaluation.participants, ["prin-ring-a", "prin-ring-b"]);
    assert.equal(evaluation.committedAllocation, 7, "the duplicate row adds nothing (5 + 2)");
    assert.ok(
      evaluation.notes.some(
        (n) => n === "duplicate commitment for participant prin-ring-a — counted once",
      ),
      "the duplicate is reported, never silently counted",
    );
    assert.equal(evaluation.thresholdMet, true);
  });

  it("cross-member withdrawal theft is refused — only the participant may withdraw a commitment", () => {
    let t = T0;
    const svc = service("ring-theft", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-ring-x",
        orgId: "org-ring-x",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-ring-x",
        intent: "intent-ring-x",
        organization: "org-ring-x",
        requirements: {},
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-ring-x", "gpr-ring-x", 2, t)).applied, true);
    const aliceCommit = svc.commitToPurchase(ALICE, {
      requestId: "gpr-ring-x",
      allocation: { lines: 1 },
    });
    assert.equal(aliceCommit.applied, true, aliceCommit.reason ?? "commit must apply");

    // MEMBER tries to withdraw ALICE's commitment to free capacity for
    // themselves — refused, and alice's commitment survives intact.
    const theft = svc.withdrawCommitment(MEMBER, aliceCommit.commitment?.id ?? "");
    assert.equal(theft.applied, false);
    assert.match(
      theft.reason ?? "",
      /commitment 'gpr-ring-x-commit-prin-alice-ab-0' belongs to 'prin-alice-ab' — only the participant may withdraw it/,
    );
    assert.equal(
      svc.getCustomerView(ALICE).groupPurchases[0]?.myCommitmentId,
      "gpr-ring-x-commit-prin-alice-ab-0",
    );
  });
});

describe("revoke/re-request griefing loops cannot wedge state", () => {
  it("an opt-in/opt-out consent loop ×5 leaves consistent state and a FRESH opt-in still works afterwards", () => {
    const svc = service("grief-consent");
    assert.equal(svc.enrollResource(ALICE, enroll("res-grief-c")).applied, true);
    for (let i = 0; i < 5; i += 1) {
      assert.equal(svc.applyConsentEvent(ALICE, "res-grief-c", "OPT_IN").applied, true);
      assert.equal(svc.getCustomerView(ALICE).resources[0]?.share, "SHARED");
      assert.equal(svc.applyConsentEvent(ALICE, "res-grief-c", "OPT_OUT").applied, true);
      assert.equal(svc.getCustomerView(ALICE).resources[0]?.share, "NOT_SHARED");
    }
    // The loop wedged nothing: a fresh explicit opt-in still applies.
    assert.equal(svc.applyConsentEvent(ALICE, "res-grief-c", "OPT_IN").applied, true);
    assert.equal(svc.getCustomerView(ALICE).resources[0]?.share, "SHARED");
    // Exactly one consent row for the resource (no row multiplication).
    assert.equal(new JsonlSurfaceStateStore(path("grief-consent")).restore().consents.length, 1);
  });

  it("a commit/withdraw/re-commit loop ×5 leaves consistent state — the request still reaches its threshold afterwards", () => {
    let t = T0;
    const svc = service("grief-commit", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-grief-k",
        orgId: "org-grief-k",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-grief-k",
        intent: "intent-grief-k",
        organization: "org-grief-k",
        requirements: {},
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-grief-k", "gpr-grief-k", 2, t)).applied, true);

    for (let i = 0; i < 5; i += 1) {
      const commit = svc.commitToPurchase(ALICE, {
        requestId: "gpr-grief-k",
        allocation: { lines: 1 },
      });
      assert.equal(commit.applied, true, `cycle ${i}: commit must apply`);
      assert.equal(
        svc.getCustomerView(ALICE).groupPurchases[0]?.myCommitmentId,
        `gpr-grief-k-commit-prin-alice-ab-${i}`,
        `cycle ${i}: commitment sequence advances deterministically`,
      );
      const withdraw = svc.withdrawCommitment(ALICE, commit.commitment?.id ?? "");
      assert.equal(withdraw.applied, true, `cycle ${i}: withdrawal must apply`);
      assert.equal(svc.getCustomerView(ALICE).groupPurchases[0]?.myCommitmentId, undefined);
      assert.equal(svc.getCustomerView(ALICE).groupPurchases[0]?.committedParticipants, 0);
    }

    // The loop wedged nothing: a fresh commit applies, the second member
    // commits, and the request still reaches THRESHOLD_MET.
    const final = svc.commitToPurchase(ALICE, {
      requestId: "gpr-grief-k",
      allocation: { lines: 1 },
    });
    assert.equal(final.applied, true, final.reason ?? "post-loop commit must apply");
    assert.equal(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-grief-k", allocation: { lines: 1 } }).applied,
      true,
    );
    assert.equal(svc.getCustomerView(ALICE).groupPurchases[0]?.orderState, "THRESHOLD_MET");
  });

  it("terminal revocation absorbs further griefing — and the principal's OTHER journeys keep working", () => {
    const svc = service("grief-revoke");
    assert.equal(svc.enrollResource(ALICE, enroll("res-grief-r")).applied, true);
    assert.equal(svc.applyConsentEvent(ALICE, "res-grief-r", "OPT_IN").applied, true);
    assert.equal(svc.revokeResource(ALICE, "res-grief-r").applied, true);

    // Griefing the revoked resource: every further event is refused (terminal).
    for (let i = 0; i < 5; i += 1) {
      assert.equal(svc.applyConsentEvent(ALICE, "res-grief-r", "OPT_IN").applied, false);
      assert.equal(
        svc.recordObservation(ALICE, "res-grief-r", {
          status: "DEGRADED",
          declaredVersion: "1.0.0",
        }).applied,
        false,
      );
    }
    assert.equal(svc.getCustomerView(ALICE).resources[0]?.share, "REVOKED");

    // The wedge never spreads: a NEW resource enrolls and shares normally.
    assert.equal(svc.enrollResource(ALICE, enroll("res-grief-r2")).applied, true);
    assert.equal(svc.applyConsentEvent(ALICE, "res-grief-r2", "OPT_IN").applied, true);
    assert.equal(svc.getCustomerView(ALICE).resources[1]?.share, "SHARED");
  });
});

describe("offer spam is refused on the id/expiry/totals surfaces", () => {
  it("duplicate-id, expired and inconsistent-totals offer spam are all refused — one intact offer row survives", () => {
    let t = T0;
    const svc = service("offer-spam", () => t);
    assert.equal(
      foundOrg(svc, { labId: "lab-spam", orgId: "org-spam", organizer: ALICE, now: t }).applied,
      true,
    );
    assert.equal(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-spam",
        intent: "intent-spam",
        organization: "org-spam",
        requirements: {},
        threshold: 1,
        expiresAt: t + 86_400_000,
      }).applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-spam", "gpr-spam", 1, t)).applied, true);

    // Duplicate-id spam: refused every time.
    for (let i = 0; i < 10; i += 1) {
      const spam = svc.receiveOffer(ALICE, offer("gpo-spam", "gpr-spam", 1, t));
      assert.equal(spam.applied, false, `duplicate-id spam ${i} must be refused`);
      assert.match(spam.reason ?? "", /offer 'gpo-spam' already exists/);
    }
    // Expired offer: refused.
    const expired = svc.receiveOffer(ALICE, {
      ...offer("gpo-spam-exp", "gpr-spam", 1, t),
      expiry: t - 1,
    });
    assert.equal(expired.applied, false);
    assert.match(expired.reason ?? "", /offer 'gpo-spam-exp' is already expired/);
    // Inconsistent-totals offer: refused.
    const lying = svc.receiveOffer(ALICE, {
      ...offer("gpo-spam-lie", "gpr-spam", 3, t),
      totalCost: 10,
    });
    assert.equal(lying.applied, false);
    assert.match(lying.reason ?? "", /totals inconsistent/);

    const restored = new JsonlSurfaceStateStore(path("offer-spam")).restore();
    assert.equal(restored.offers.length, 1, "exactly one offer row survived the spam");
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
