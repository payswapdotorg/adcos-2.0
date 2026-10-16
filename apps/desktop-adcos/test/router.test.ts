/**
 * P5-W2 desktop battery — drives the SAME router the Electron ipcMain
 * handlers delegate to, against the REAL SurfacesService over the REAL
 * durable JSONL store (temp file). Covers:
 *   1. wiring smoke — a full customer journey through every request;
 *   2. write-before-ack + restart recovery — the durable log grows and a
 *      NEW service instance over the same file restores the same state;
 *   3. role-gating negatives — a customer principal cannot read operator
 *      views; the refusal is surfaced, never masked.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSurfacesService } from "@adcos/surfaces";
import { routeAdcosRequest } from "../src/main/router.ts";
import { DesktopSession } from "../src/main/session.ts";

function freshHarness() {
  const dir = mkdtempSync(join(tmpdir(), "adcos-desktop-"));
  const statePath = join(dir, "adcos-state.jsonl");
  const service = createSurfacesService({
    statePath,
    now: () => FIXED_NOW,
    operatorPrincipals: ["ops@local"],
    developerPrincipals: ["dev@local"],
  });
  const session = new DesktopSession();
  return { dir, statePath, service, session };
}

const FIXED_NOW = 1_800_000_000_000;

test("wiring: full customer journey through every request", async () => {
  const h = freshHarness();
  try {
    // session + principals
    const session = routeAdcosRequest(h.service, h.session, { method: "session" });
    assert.equal(session.principal, "ada@local");
    assert.deepEqual(session.roles, ["customer"]);
    const principals = routeAdcosRequest(h.service, h.session, { method: "listPrincipals" });
    assert.equal(principals.principals.length, 4);

    // enroll + consent + observe
    const enrolled = routeAdcosRequest(h.service, h.session, {
      method: "enrollResource",
      input: {
        id: "res-ada-1",
        device: "device-1",
        type: "phone",
        capability: "tether/4g",
        modes: ["hotspot"],
        limits: { concurrent: 2 },
      },
    });
    assert.equal(enrolled.applied, true, JSON.stringify(enrolled));
    const consented = routeAdcosRequest(h.service, h.session, {
      method: "consent",
      resourceId: "res-ada-1",
      event: "OPT_IN",
    });
    assert.equal(consented.applied, true);
    const observed = routeAdcosRequest(h.service, h.session, {
      method: "observe",
      resourceId: "res-ada-1",
      input: { status: "UNKNOWN", declaredVersion: "1" },
    });
    assert.equal(observed.applied, true);

    // Lab evaluation -> opportunity
    const evaluation = routeAdcosRequest(h.service, h.session, {
      method: "runLabEvaluation",
      input: {
        id: "eval-1",
        intent: "connectivity.cost.reduction",
        baseline: { strategy: "baseline-status-quo", cost: 120, reliability: 0.9 },
        alternatives: [{ strategy: "pooled-provider-plan", cost: 80, reliability: 0.92 }],
        selectedStrategy: "pooled-provider-plan",
        confidence: 0.8,
        assumptions: ["measured window only"],
      },
    });
    assert.equal(evaluation.applied, true, JSON.stringify(evaluation));

    // Founding from pursuit evidence (the opportunity id is `${id}-opportunity`).
    const formed = routeAdcosRequest(h.service, h.session, {
      method: "formOrganization",
      input: {
        organization: "org-1",
        pursuitEvidenceId: "eval-1-opportunity",
        candidates: [
          { principal: "ada@local", consent: true, consentRecordedAt: FIXED_NOW },
        ],
        minFounders: 1,
        authorityScope: "group.purchase",
        initialMandates: [
          { principal: "ada@local", scope: "group.purchase", permissions: ["commit"] },
        ],
      },
    });
    assert.equal(formed.applied, true, JSON.stringify(formed));

    // Group purchase -> offer -> commit
    const opened = routeAdcosRequest(h.service, h.session, {
      method: "openGroupPurchase",
      input: {
        id: "req-1",
        intent: "connectivity.group-plan",
        organization: "org-1",
        requirements: { quantity: 1 },
        threshold: 1,
        expiresAt: FIXED_NOW + 3_600_000,
      },
    });
    assert.equal(opened.applied, true);
    const offer = routeAdcosRequest(h.service, h.session, {
      method: "receiveOffer",
      offer: {
        id: "offer-1",
        request: "req-1",
        supplier: "provider-a",
        product: "group-connectivity-plan",
        capability: "tether/4g",
        region: "accra",
        quantity: 1,
        perMemberCost: 40,
        totalCost: 40,
        recurringCharges: [{ amount: 40, frequency: "monthly", description: "pooled" }],
        oneTimeCharges: [{ amount: 0, description: "setup" }],
        term: "12 months",
        limitations: ["fair-use"],
        expiry: FIXED_NOW + 86_400_000,
        provenance: "test:supplier-terms",
      },
    });
    assert.equal(offer.applied, true);
    const committed = routeAdcosRequest(h.service, h.session, {
      method: "commitToPurchase",
      input: { requestId: "req-1", allocation: { share: 1 } },
    });
    assert.equal(committed.applied, true);

    // Order lifecycle to RECONCILED (payment = opaque reference, ADR-0004)
    for (const [event, extra] of [
      ["AUTHORIZE", {}],
      [
        "PLACE_ORDER",
        {
          paymentReference: {
            id: "payref-1",
            type: "opaque",
            authority: "authorized-financial-authority (role, unselected rail)",
            created: FIXED_NOW,
            settled: false,
          },
        },
      ],
      ["CONFIRM_CONTRACT", {}],
      ["MARK_FULFILLED", {}],
      ["RECONCILE", { usageEvidenceComplete: true }],
    ] as const) {
      const stepped = routeAdcosRequest(h.service, h.session, {
        method: "advancePurchaseOrder",
        input: { requestId: "req-1", event, ...extra },
      });
      assert.equal(stepped.applied, true, `${event}: ${JSON.stringify(stepped)}`);
    }

    // Customer view reflects the journey
    const view = routeAdcosRequest(h.service, h.session, { method: "customerView" });
    assert.equal(view.resources.length, 1);
    assert.equal(view.organizations.length, 1);
    assert.equal(view.groupPurchases.length, 1);
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test("durability: write-before-ack + restart recovery over the same log", async () => {
  const h = freshHarness();
  try {
    const enrolled = routeAdcosRequest(h.service, h.session, {
      method: "enrollResource",
      input: {
        id: "res-grace-1",
        device: "device-2",
        type: "router",
        capability: "backhaul/5g",
        modes: ["always-on"],
        limits: { concurrent: 1 },
      },
    });
    assert.equal(enrolled.applied, true);

    // The durable log exists and holds the snapshot BEFORE any ack spread.
    const lines = readFileSync(h.statePath, "utf8").trim().split("\n");
    assert.ok(lines.length >= 1, "durable log written");
    JSON.parse(lines[lines.length - 1] ?? "");

    // A NEW service instance over the same file (restart) restores state.
    const restarted = createSurfacesService({
      statePath: h.statePath,
      now: () => FIXED_NOW,
      operatorPrincipals: ["ops@local"],
      developerPrincipals: ["dev@local"],
    });
    const freshSession = new DesktopSession();
    // The enroll ran under the default principal (ada@local) — the same
    // owner must read it back after restart (tenant isolation is real).
    const view = routeAdcosRequest(restarted, freshSession, { method: "customerView" });
    assert.equal(
      view.resources.filter((r) => r.resourceId === "res-grace-1").length,
      1,
      "enrolled resource survives restart",
    );
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test("role gating: customer cannot read operator/developer views", async () => {
  const h = freshHarness();
  try {
    const operator = routeAdcosRequest(h.service, h.session, { method: "operatorView" });
    assert.equal(operator.applied, false, "customer must be refused");
    assert.ok((operator.reason ?? "") !== "", "refusal carries a reason");
    const developer = routeAdcosRequest(h.service, h.session, { method: "developerView" });
    assert.equal(developer.applied, false);

    // The operator principal reads the aggregate (role config, not state).
    h.session.switch("ops@local");
    const asOperator = routeAdcosRequest(h.service, h.session, { method: "operatorView" });
    assert.equal(asOperator.applied, true);
    assert.ok(asOperator.view !== undefined);

    // An empty-principal switch is refused honestly.
    const switched = routeAdcosRequest(h.service, h.session, {
      method: "switchPrincipal",
      principal: "   ",
    });
    assert.equal((switched as { applied: boolean }).applied, false);
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});
