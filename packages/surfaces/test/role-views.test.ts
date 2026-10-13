import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSurfacesService } from "../src/contract.js";

// ============================================================================
// Role experience breadth (P2-W1 round 2): operator and developer
// projections alongside the customer view — with the same tenant-isolation
// rigor as buildCustomerView:
// - operator views are role-gated (refused for customers/developers) and
//   expose ONLY aggregates: no per-owner consent rows, no allocation
//   amounts, no commitment identities, no per-principal resource listings;
// - developer views are role-gated and expose ONLY the integration/contract
//   surface: runtime-derived export lists, schema families, compatibility
//   matrix, persisted row counts — never tenant-private rows;
// - customer views never widen and never see aggregates.
// ============================================================================

const dir = mkdtempSync(join(tmpdir(), "adcos-surfaces-roles-"));
const statePath = join(dir, "roles.jsonl");

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

describe("role views (operator/developer breadth + isolation)", () => {
  before(() => {
    // Two tenants, two organizations, distinct resource states — enough
    // surface for cross-tenant aggregate checks.
    for (const [principal, suffix] of [
      ["prin-alice", "a"],
      ["prin-bob", "b"],
    ] as const) {
      service.enrollResource(principal, {
        id: `res-${suffix}`,
        device: `dev-${suffix}`,
        type: "phone",
        capability: "forwarding-v1",
        modes: ["local"],
        limits: { maxSessions: 2 },
      });
      service.applyConsentEvent(principal, `res-${suffix}`, "OPT_IN");
    }
    service.recordObservation("prin-alice", "res-a", {
      status: "DEGRADED",
      declaredVersion: "1.0.0",
    });
    service.recordObservation("prin-bob", "res-b", {
      status: "STALE",
      declaredVersion: "1.0.0",
    });

    service.runLabEvaluation({
      id: "lab-roles",
      intent: "intent-roles",
      baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
      alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
      selectedStrategy: "alt",
      confidence: 0.8,
      assumptions: [],
      expiresAt: t + 172_800_000,
    });
    service.formOrganization("prin-alice", {
      organization: "org-1",
      pursuitEvidenceId: "lab-roles-opportunity",
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
      id: "gpr-roles",
      intent: "intent-roles",
      organization: "org-1",
      requirements: { product: "data-bundle" },
      threshold: 2,
      expiresAt: t + 86_400_000,
    });
    service.receiveOffer("prin-alice", {
      id: "gpo-roles",
      request: "gpr-roles",
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
    });
    service.commitToPurchase("prin-alice", { requestId: "gpr-roles", allocation: { lines: 3 } });
    service.commitToPurchase("prin-bob", { requestId: "gpr-roles", allocation: { lines: 7 } });
  });

  it("operator view is role-gated: customers and developers are refused", () => {
    for (const impostor of ["prin-alice", "prin-developer", "prin-nobody"]) {
      const refused = service.getOperatorView(impostor);
      assert.equal(refused.applied, false);
      assert.equal(refused.view, undefined);
      assert.match(refused.reason ?? "", /does not hold the operator role/);
    }
  });

  it("developer view is role-gated: customers and operators are refused", () => {
    for (const impostor of ["prin-alice", "prin-operator", "prin-nobody"]) {
      const refused = service.getDeveloperView(impostor);
      assert.equal(refused.applied, false);
      assert.equal(refused.view, undefined);
      assert.match(refused.reason ?? "", /does not hold the developer role/);
    }
  });

  it("operator sees the cross-tenant aggregate: fleet statuses and org summaries", () => {
    const result = service.getOperatorView("prin-operator");
    assert.equal(result.applied, true);
    const view = result.view;
    assert.notEqual(view, undefined);

    // Fleet aggregate across tenants: DEGRADED and STALE counted distinctly
    // (UNKNOWN never fabricated — the two observed resources moved off it).
    assert.equal(view?.fleet.total, 2);
    assert.equal(view?.fleet.byStatus.DEGRADED, 1);
    assert.equal(view?.fleet.byStatus.STALE, 1);
    assert.equal(view?.fleet.byStatus.UNKNOWN, 0);
    assert.equal(view?.fleet.revoked, 0);

    // Organization summary: 2 MEMBER memberships, request progress surfaced.
    assert.equal(view?.organizations.length, 1);
    const org = view?.organizations[0];
    assert.equal(org?.organization, "org-1");
    assert.equal(org?.membersByState.MEMBER, 2);
    assert.equal(org?.requests.length, 1);
    assert.equal(org?.requests[0]?.requestId, "gpr-roles");
    assert.equal(org?.requests[0]?.committedParticipants, 2);
    assert.equal(org?.requests[0]?.threshold, 2);
    assert.equal(org?.requests[0]?.evaluation, "THRESHOLD_MET");
    assert.equal(org?.requests[0]?.orderState, "THRESHOLD_MET");

    // The boundaries are explicit, not implicit.
    assert.ok((view?.authorityBoundaries.length ?? 0) >= 3);
  });

  it("operator aggregate NEVER carries tenant-private fields", () => {
    const result = service.getOperatorView("prin-operator");
    assert.equal(result.applied, true);
    const serialized = JSON.stringify(result.view);
    // No per-principal identifiers, no consent-state values, no allocation
    // amounts. (The word "consent" appears only inside the explicit
    // authority-boundary statements, which describe what is NOT exposed.)
    for (const leak of ["prin-alice", "prin-bob", "NOT_SHARED", "SHARED", "PAUSED", '"lines"']) {
      assert.equal(
        serialized.includes(leak),
        false,
        `operator view leaked '${leak}': ${serialized}`,
      );
    }
  });

  it("customer views never widen: no aggregates, no other tenant's rows", () => {
    const alice = service.getCustomerView("prin-alice");
    const bob = service.getCustomerView("prin-bob");
    assert.deepEqual(
      alice.resources.map((r) => r.resourceId),
      ["res-a"],
    );
    assert.deepEqual(
      bob.resources.map((r) => r.resourceId),
      ["res-b"],
    );
    assert.equal(alice.resources[0]?.status, "DEGRADED");
    assert.equal(bob.resources[0]?.status, "STALE");
    // No fleet/aggregate fields exist on the customer view at all.
    const customerKeys = Object.keys(alice);
    assert.deepEqual(
      customerKeys.filter((k) => k.includes("fleet") || k.includes("aggregate")),
      [],
    );
  });

  it("an operator's own customer view exists but stays scoped to their own rows", () => {
    const operatorAsCustomer = service.getCustomerView("prin-operator");
    assert.deepEqual(operatorAsCustomer.resources, []);
    assert.deepEqual(operatorAsCustomer.organizations, []);
    assert.deepEqual(operatorAsCustomer.groupPurchases, []);
  });

  it("developer view: runtime-derived contract surface + compatibility matrix", () => {
    const result = service.getDeveloperView("prin-developer");
    assert.equal(result.applied, true);
    const view = result.view;
    assert.notEqual(view, undefined);

    // Contract families are the live schema registry, not a catalog copy.
    const families = view?.contractFamilies.map((f) => f.schema) ?? [];
    for (const expected of [
      "Envelope",
      "ResourceProjectionReference",
      "GroupPurchaseRequest",
      "OrganizationMembership",
      "LabComparisonEvidence",
      "OpportunityEvidence",
      "Status",
    ]) {
      assert.ok(families.includes(expected), `missing contract family ${expected}`);
    }

    // Compatibility matrix is the live one from @adcos/contracts.
    const matrix = view?.versionCompatibility ?? [];
    assert.ok(matrix.some((m) => m.version === "1.2.0" && m.compatibleWith.includes("1.0.0")));
    assert.ok(matrix.some((m) => m.version === "2.0.0" && m.compatibleWith.length === 0));

    // Composed package surfaces are runtime-derived export lists.
    const surfaces = view?.composedSurfaces ?? [];
    assert.deepEqual(
      surfaces.map((s) => s.package),
      [
        "@adcos/contracts",
        "@adcos/economics",
        "@adcos/lab",
        "@adcos/organizations",
        "@adcos/group-purchasing",
      ],
    );
    const economics = surfaces.find((s) => s.package === "@adcos/economics");
    assert.ok(economics?.exports.includes("evaluateOpportunity"));
    assert.ok(economics?.exports.includes("summarizeOfferCosts"));
    const purchasing = surfaces.find((s) => s.package === "@adcos/group-purchasing");
    assert.ok(purchasing?.exports.includes("advanceOrder"));
    assert.ok(purchasing?.exports.includes("evaluateCommitments"));

    // Persisted state shape (row counts) surfaced for integration.
    const rows = Object.fromEntries((view?.stateShape ?? []).map((r) => [r.kind, r.rows]));
    assert.equal(rows.resources, 2);
    assert.equal(rows.memberships, 2);
    assert.equal(rows.commitments, 2);
    assert.equal(rows.orders, 1);

    // The coordination seam boundary is stated explicitly, not hidden.
    assert.ok(
      (view?.boundaries ?? []).some(
        (b) => b.includes("coordination") && b.includes("not a declared surfaces dependency"),
      ),
    );
  });

  it("developer view NEVER carries tenant-private rows", () => {
    const result = service.getDeveloperView("prin-developer");
    const serialized = JSON.stringify(result.view);
    for (const leak of ["prin-alice", "prin-bob", "res-a", "res-b", "DEGRADED", "STALE"]) {
      assert.equal(
        serialized.includes(leak),
        false,
        `developer view leaked '${leak}': ${serialized}`,
      );
    }
  });

  it("role views survive a restart (persisted state, same gates)", () => {
    const restarted = createSurfacesService({
      statePath,
      now: tick,
      operatorPrincipals: OPERATORS,
      developerPrincipals: DEVELOPERS,
    });
    const operatorView = restarted.getOperatorView("prin-operator");
    assert.equal(operatorView.applied, true);
    assert.equal(operatorView.view?.fleet.total, 2);
    assert.equal(operatorView.view?.organizations[0]?.requests[0]?.evaluation, "THRESHOLD_MET");
    // Gates are configuration, not state: a restarted service without the
    // operator list refuses the same principal.
    const unconfigured = createSurfacesService({ statePath, now: tick });
    assert.equal(unconfigured.getOperatorView("prin-operator").applied, false);
    assert.equal(unconfigured.getDeveloperView("prin-developer").applied, false);
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
