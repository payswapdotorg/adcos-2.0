import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// P4-W1 round-1 — SECURITY ISOLATION BATTERY (tenant / role / mandate / state
// lifetime isolation). Composed through PUBLIC contract entry points ONLY
// (same import discipline as test/integration/negative-boundaries.test.ts):
// no package-internal imports, no package src/ edits, adcos-contracts FROZEN.
//
// Isolation classes proven here (spec/work-orders.md P4-W1:
// "tenant/resource isolation" + INVARIANTS #2/#8/#9/#12/#20/#24):
//   1. cross-tenant command refusal — a non-owner cannot consent to,
//      revoke, observe or withdraw another principal's resource/commitment;
//   2. cross-tenant view refusal — views only ever expose the caller's own
//      rows, and the isolation SURVIVES persistence/restart (adapters store);
//   3. impostor role views refused — operator/developer roles are deployment
//      configuration; unlisted (or unconfigured) principals are refused;
//   4. non-member group-purchase actions refused — opening, offers,
//      commitments, membership events;
//   5. unmandated order authorization fails closed — AUTHORIZE authority is
//      COMPUTED from persisted mandates, never asserted;
//   6. expired / revoked surfaces unusable — revoked/expired delegations
//      grant nothing at the coordination boundary.
// ============================================================================

import {
  createSurfacesService,
  JsonlSurfaceStateStore,
} from "../../packages/surfaces/src/contract.js";
import { checkDelegationChain } from "../../packages/coordination/src/contract.js";
import type { Delegation } from "../../packages/adcos-contracts/src/index.js";

type Service = ReturnType<typeof createSurfacesService>;

const T0 = 1_700_000_000_000;
const ALICE = "prin-alice-iso";
const BOB = "prin-bob-iso";
const MEMBER = "prin-member-iso";

const dir = mkdtempSync(join(tmpdir(), "adcos-p4w1-security-"));
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
 * a mandate ONLY when `mandate` is provided (default scope group.purchase;
 * mandate: {} = durable purchase mandate, { expiresAt } = expiring,
 * { scope } = differently-scoped mandate, omitted = none — note formation
 * REFUSES consenting founders without any initial mandate).
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
  provenance: "unicom-listing:p4w1",
});

const delegation = (overrides: Partial<Delegation> = {}): Delegation => ({
  id: "deleg-iso",
  principal: "prin-holder-iso",
  delegate: "inst-holder-iso",
  scope: "device.forwarding",
  issuedAt: T0 - 100_000,
  expiresAt: T0 + 3_600_000,
  revoked: false,
  ...overrides,
});

describe("cross-tenant resource commands are refused at the command boundary", () => {
  it("a non-owner cannot consent to, revoke or observe another principal's resource — and the owner's journey is untouched", () => {
    const svc = service("cross-tenant-commands");
    assert.equal(svc.enrollResource(ALICE, enroll("res-iso")).applied, true);

    const consent = svc.applyConsentEvent(BOB, "res-iso", "OPT_IN");
    assert.equal(consent.applied, false);
    assert.match(consent.reason ?? "", /owned by 'prin-alice-iso'/);

    const revoke = svc.revokeResource(BOB, "res-iso");
    assert.equal(revoke.applied, false);
    assert.match(revoke.reason ?? "", /owned by 'prin-alice-iso'/);

    const observation = svc.recordObservation(BOB, "res-iso", {
      status: "DEGRADED",
      declaredVersion: "1.0.0",
    });
    assert.equal(observation.applied, false);
    assert.match(observation.reason ?? "", /owned by 'prin-alice-iso'/);

    // Nothing persisted by the refused commands: alice's journey is untouched.
    assert.equal(svc.getCustomerView(ALICE).resources[0]?.share, "NOT_SHARED");
    assert.equal(svc.getCustomerView(ALICE).resources[0]?.status, "UNKNOWN");
  });

  it("a non-participant cannot withdraw another principal's commitment", () => {
    let t = T0;
    const svc = service("cross-tenant-withdrawal", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-iso-w",
        orgId: "org-iso-w",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc
        .openGroupPurchase(ALICE, {
          id: "gpr-iso-w",
          intent: "intent-iso-w",
          organization: "org-iso-w",
          requirements: { product: "data-bundle" },
          threshold: 2,
          expiresAt: t + 7 * 86_400_000,
        })
        .applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-iso-w", "gpr-iso-w", 2, t)).applied, true);
    const commit = svc.commitToPurchase(ALICE, {
      requestId: "gpr-iso-w",
      allocation: { lines: 1 },
    });
    assert.equal(commit.applied, true, commit.reason ?? "commit must apply");

    // An uninvolved principal cannot withdraw alice's commitment.
    const foreign = svc.withdrawCommitment(BOB, commit.commitment?.id ?? "");
    assert.equal(foreign.applied, false);
    assert.match(foreign.reason ?? "", /belongs to 'prin-alice-iso' — only the participant may withdraw it/);
  });

  it("views only ever expose the caller's own rows — and the isolation survives persistence and restart", () => {
    const svc = service("view-isolation");
    assert.equal(svc.enrollResource(ALICE, enroll("res-iso-alice")).applied, true);
    assert.equal(svc.applyConsentEvent(ALICE, "res-iso-alice", "OPT_IN").applied, true);
    assert.equal(svc.enrollResource(BOB, enroll("res-iso-bob")).applied, true);

    // In-memory views are principal-scoped.
    assert.deepEqual(
      svc.getCustomerView(ALICE).resources.map((r) => r.resourceId),
      ["res-iso-alice"],
    );
    assert.deepEqual(
      svc.getCustomerView(BOB).resources.map((r) => r.resourceId),
      ["res-iso-bob"],
    );

    // The adapters-layer durable store folds back exactly the two owned rows.
    const store = new JsonlSurfaceStateStore(path("view-isolation"));
    const restored = store.restore();
    assert.deepEqual(
      restored.resources.map((r) => r.owner).sort(),
      [ALICE, BOB],
    );
    assert.ok(store.stats().snapshots >= 1, "at least one snapshot must have been folded");

    // A NEW service instance over the same durable log keeps the isolation:
    // alice's consent state is restored, and bob still sees only his own row.
    const restarted = createSurfacesService({
      statePath: path("view-isolation"),
      now: () => T0,
    });
    assert.equal(restarted.getCustomerView(ALICE).resources[0]?.share, "SHARED");
    assert.deepEqual(
      restarted.getCustomerView(BOB).resources.map((r) => r.resourceId),
      ["res-iso-bob"],
    );
  });
});

describe("impostor role views are refused (roles are deployment configuration)", () => {
  it("a principal not holding the operator role is refused the operator view", () => {
    const configured = createSurfacesService({
      statePath: path("role-operator"),
      now: () => T0,
      operatorPrincipals: ["prin-operator-iso"],
    });
    assert.equal(configured.getOperatorView("prin-operator-iso").applied, true);

    const impostor = configured.getOperatorView(BOB);
    assert.equal(impostor.applied, false);
    assert.match(impostor.reason ?? "", /does not hold the operator role/);
    // The refused view carries no cross-tenant aggregate.
    assert.equal(impostor.view, undefined);
  });

  it("a principal not holding the developer role is refused the developer view", () => {
    const configured = createSurfacesService({
      statePath: path("role-developer"),
      now: () => T0,
      developerPrincipals: ["prin-developer-iso"],
    });
    assert.equal(configured.getDeveloperView("prin-developer-iso").applied, true);

    const impostor = configured.getDeveloperView(ALICE);
    assert.equal(impostor.applied, false);
    assert.match(impostor.reason ?? "", /does not hold the developer role/);
    assert.equal(impostor.view, undefined);
  });

  it("with no operator list configured, the operator view fails closed for everyone (no implicit grants)", () => {
    const svc = service("role-unconfigured");
    const refused = svc.getOperatorView("prin-operator-iso");
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /does not hold the operator role/);
    assert.equal(refused.view, undefined);
  });
});

describe("non-member group-purchase actions are refused", () => {
  it("an outsider cannot open a group purchase in an organization they do not belong to", () => {
    let t = T0;
    const svc = service("gp-open", () => t);
    assert.equal(
      foundOrg(svc, { labId: "lab-iso-open", orgId: "org-iso", organizer: ALICE, now: t }).applied,
      true,
    );

    const refused = svc.openGroupPurchase(BOB, {
      id: "gpr-iso-out",
      intent: "intent-iso-out",
      organization: "org-iso",
      requirements: {},
      threshold: 1,
      expiresAt: t + 86_400_000,
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /is not a MEMBER of 'org-iso'/);

    // The refused command persisted nothing — not even into bob's own view.
    const bobView = svc.getCustomerView(BOB);
    assert.equal(bobView.organizations.length, 0);
    assert.equal(bobView.groupPurchases.length, 0);
  });

  it("an outsider cannot commit to the organization's request", () => {
    let t = T0;
    const svc = service("gp-commit", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-iso-commit",
        orgId: "org-iso-c",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: {} }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc
        .openGroupPurchase(ALICE, {
          id: "gpr-iso-c",
          intent: "intent-iso-c",
          organization: "org-iso-c",
          requirements: {},
          threshold: 2,
          expiresAt: t + 86_400_000,
        })
        .applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-iso-c", "gpr-iso-c", 2, t)).applied, true);

    const refused = svc.commitToPurchase(BOB, {
      requestId: "gpr-iso-c",
      allocation: { lines: 1 },
    });
    assert.equal(refused.applied, false);
    assert.match(refused.reason ?? "", /is not a MEMBER of 'org-iso-c'/);
    // No commitment row was created for the outsider.
    assert.equal(svc.getCustomerView(BOB).groupPurchases.length, 0);
  });

  it("an outsider cannot receive an offer against the organization's request", () => {
    let t = T0;
    const svc = service("gp-offer", () => t);
    assert.equal(
      foundOrg(svc, { labId: "lab-iso-offer", orgId: "org-iso-o", organizer: ALICE, now: t })
        .applied,
      true,
    );
    assert.equal(
      svc
        .openGroupPurchase(ALICE, {
          id: "gpr-iso-o",
          intent: "intent-iso-o",
          organization: "org-iso-o",
          requirements: {},
          threshold: 1,
          expiresAt: t + 86_400_000,
        })
        .applied,
      true,
    );

    const refused = svc.receiveOffer(BOB, offer("gpo-iso-o", "gpr-iso-o", 1, t));
    assert.equal(refused.applied, false);
    assert.match(
      refused.reason ?? "",
      /is not a MEMBER of 'org-iso-o' — offers are received through the owning organization/,
    );
  });

  it("an outsider cannot invite themselves into, or apply membership events to, an organization", () => {
    let t = T0;
    const svc = service("gp-membership", () => t);
    assert.equal(
      foundOrg(svc, { labId: "lab-iso-mem", orgId: "org-iso-m", organizer: ALICE, now: t }).applied,
      true,
    );

    const invite = svc.inviteMember(BOB, { organization: "org-iso-m", principal: BOB });
    assert.equal(invite.applied, false);
    assert.match(
      invite.reason ?? "",
      /inviting requires an active membership-management mandate \('group\.membership'\) in 'org-iso-m' held by 'prin-bob-iso'/,
    );

    const event = svc.applyMembershipEvent(BOB, {
      organization: "org-iso-m",
      principal: BOB,
      event: "INVITE",
    });
    assert.equal(event.applied, false);
    assert.match(event.reason ?? "", /no membership record for 'prin-bob-iso' in 'org-iso-m'/);
  });

  it("a member whose mandate does not cover group.purchase cannot commit (authority is mandate-scoped, not membership-blanket)", () => {
    let t = T0;
    const svc = service("gp-unmandated", () => t);
    // MEMBER consents as founder holding ONLY a membership-management mandate
    // (formation refuses mandate-less founders — so the honest probe for
    // mandate scoping is a wrong-scoped, not absent, mandate).
    assert.equal(
      foundOrg(svc, {
        labId: "lab-iso-nm",
        orgId: "org-iso-nm",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: { scope: "group.membership" } }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc
        .openGroupPurchase(ALICE, {
          id: "gpr-iso-nm",
          intent: "intent-iso-nm",
          organization: "org-iso-nm",
          requirements: {},
          threshold: 2,
          expiresAt: t + 86_400_000,
        })
        .applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-iso-nm", "gpr-iso-nm", 2, t)).applied, true);

    const refused = svc.commitToPurchase(MEMBER, {
      requestId: "gpr-iso-nm",
      allocation: { lines: 1 },
    });
    assert.equal(refused.applied, false);
    assert.match(
      refused.reason ?? "",
      /committing requires an active 'group\.purchase' mandate in 'org-iso-nm' held by 'prin-member-iso'/,
    );
  });
});

describe("unmandated order authorization fails closed", () => {
  it("AUTHORIZE with a committed participant whose mandate expired is refused — the order is NOT advanced", () => {
    let t = T0;
    const svc = service("authorize-guard", () => t);
    assert.equal(
      foundOrg(svc, {
        labId: "lab-iso-auth",
        orgId: "org-iso-auth",
        organizer: ALICE,
        members: [{ principal: MEMBER, mandate: { expiresAt: t + 10_000 } }],
        now: t,
      }).applied,
      true,
    );
    assert.equal(
      svc
        .openGroupPurchase(ALICE, {
          id: "gpr-iso-auth",
          intent: "intent-iso-auth",
          organization: "org-iso-auth",
          requirements: {},
          threshold: 2,
          expiresAt: t + 7 * 86_400_000,
        })
        .applied,
      true,
    );
    assert.equal(svc.receiveOffer(ALICE, offer("gpo-iso-auth", "gpr-iso-auth", 2, t)).applied, true);
    // Both commit while the member's mandate is still active.
    assert.equal(
      svc.commitToPurchase(ALICE, { requestId: "gpr-iso-auth", allocation: { lines: 1 } }).applied,
      true,
    );
    assert.equal(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-iso-auth", allocation: { lines: 1 } }).applied,
      true,
    );

    t += 20_000; // the member's mandate expires between commit and authorize
    const authorize = svc.advancePurchaseOrder(ALICE, {
      requestId: "gpr-iso-auth",
      event: "AUTHORIZE",
    });
    assert.equal(authorize.applied, false);
    assert.match(
      authorize.reason ?? "",
      /authorization not grantable: committed participants without an active 'group\.purchase' mandate: prin-member-iso/,
    );
    // The refused command did not advance the order record.
    assert.equal(svc.getCustomerView(ALICE).groupPurchases[0]?.orderState, "THRESHOLD_MET");
  });
});

describe("expired / revoked delegations are unusable at the coordination boundary", () => {
  it("a REVOKED delegation grants nothing (revocation is enforced, INVARIANTS #12/#20)", () => {
    const check = checkDelegationChain(
      [delegation({ revoked: true })],
      "device.forwarding",
      T0,
    );
    assert.equal(check.authorized, false);
    assert.match(check.reason ?? "", /delegation deleg-iso revoked/);
  });

  it("an EXPIRED delegation grants nothing (offline queues cannot extend permissions)", () => {
    const check = checkDelegationChain(
      [delegation({ expiresAt: T0 - 1_000 })],
      "device.forwarding",
      T0,
    );
    assert.equal(check.authorized, false);
    assert.match(check.reason ?? "", /delegation deleg-iso expired/);
  });

  it("no delegation presented is refused outright (authorization is never implicit)", () => {
    const check = checkDelegationChain([], "device.forwarding", T0);
    assert.equal(check.authorized, false);
    assert.match(check.reason ?? "", /no delegation presented/);
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
