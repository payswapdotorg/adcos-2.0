import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// P4-W1 round-2 — SECRETS BATTERY. Composed through PUBLIC contract entry
// points ONLY (same import discipline as the round-1 battery
// test/security/isolation.test.ts): no package-internal imports, no package
// src/ edits, adcos-contracts FROZEN.
//
// Method: sentinel secret-shaped fixtures are injected at every position
// where credential/token material could plausibly enter the system through
// the public surface, and every PUBLIC output (error payloads, view
// projections, serialized command results, wire failure details) is scanned
// for the sentinel. NO internal log-file snooping: only contract-visible
// outputs are asserted (spec/work-orders.md P4-W1: "secrets isolation" +
// INVARIANTS #3/#13; authority mapping: provider credentials legitimately
// live ONLY in ShareNetPort.auth.credentials — port config, provider-adapter
// concern).
//
// Classes proven here:
//   1. ShareNet port credentials never surface: a valid port carrying
//      sentinel apiKey/token/secret values in auth.credentials yields a seam
//      whose probe reason, implementation label and ALL seven operation
//      errors never echo the sentinel (the stub stores the port privately
//      and reports only its public endpoint label);
//   2. credential REFUSAL paths never leak the rejected secret: a malformed
//      port (sentinel smuggled into type-invalid positions, or as an
//      unknown extra key) fails closed with a ShareNetSeamConfigurationError
//      whose message reports the received TYPE, never the value; unknown
//      keys are dropped, not echoed;
//   3. the surfaces command boundary redacts internal state: every public
//      command result carries no own "state" property and no internal
//      snapshot arrays (consents/observations/opportunities/orders/requests/
//      offers/commitments rows) in serialized form;
//   4. view projections expose only card fields: sentinel-shaped values
//      smuggled into non-projected inputs (device identifiers, observation
//      evidence URIs, offer provenance/product, request requirements) never
//      surface in the customer, operator or developer views;
//   5. wire refusal details never echo rejected values: a malformed
//      envelope carrying a sentinel in a type-invalid field fails with a
//      MALFORMED detail that names the field and the received type only.
//
// HONEST LIMIT (recorded PARTIAL in docs/reports/security/round-2-report.md):
// envelope signatures are documented placeholder crypto (inherited contracts
// limitation) — no signing-key material exists on this surface to test;
// there is no credential-rotation API on the frozen public surface (GAP).
// ============================================================================

import { createSurfacesService } from "../../packages/surfaces/src/contract.js";
import {
  createShareNetSeam,
  ShareNetSeamConfigurationError,
  ShareNetSeamUnavailableError,
  validateEnvelope,
  type ValidationContext,
} from "../../packages/coordination/src/contract.js";

type Service = ReturnType<typeof createSurfacesService>;

const T0 = 1_700_000_000_000;
const ALICE = "prin-alice-sec";
const MEMBER = "prin-member-sec";

/** Sentinel secret-shaped fixture (greppable, never a real credential). */
const SENTINEL = "SEN1NEL-SECRET-sk-9f3a-token";

const containsSentinel = (value: unknown): boolean =>
  JSON.stringify(value)?.includes(SENTINEL) ?? false;

const dir = mkdtempSync(join(tmpdir(), "adcos-p4w1-secrets-"));
const path = (name: string): string => join(dir, `${name}.jsonl`);

const service = (name: string, clock: () => number = () => T0): Service =>
  createSurfacesService({ statePath: path(name), now: clock });

describe("ShareNet port credentials never surface on the seam's public outputs", () => {
  it("a valid port with sentinel credentials: probe, implementation label and all seven operation errors stay sentinel-free", async () => {
    const seam = createShareNetSeam({
      port: {
        endpoint: "https://sharenet.example/api",
        capabilities: ["connectivity"],
        auth: {
          provider: "sharenet-oauth",
          credentials: {
            apiKey: SENTINEL,
            token: `bearer-${SENTINEL}`,
            secret: SENTINEL,
          },
        },
      },
    });

    // The honest availability probe reports UNAVAILABLE and mentions only
    // the public endpoint label — never the credential record.
    const probe = await seam.probe();
    assert.equal(probe.status, "UNAVAILABLE");
    assert.equal(containsSentinel(probe), false, "the probe never echoes credentials");
    assert.equal(containsSentinel(seam.implementation), false);
    assert.equal(seam.seamKind, "sharenet");

    // Every consequential operation fails closed with the labeled error —
    // and none of the error payloads echoes the sentinel.
    const operations: ReadonlyArray<[string, () => Promise<unknown>]> = [
      ["createIntent", () => seam.createIntent({ lines: 1 })],
      ["discoverOffers", () => seam.discoverOffers("intent-1")],
      ["acceptOffer", () => seam.acceptOffer("intent-1", "offer-1")],
      ["getContract", () => seam.getContract("contract-1")],
      ["getAssurance", () => seam.getAssurance("contract-1")],
      ["getExecution", () => seam.getExecution("contract-1")],
      ["terminate", () => seam.terminate("contract-1")],
    ];
    for (const [label, run] of operations) {
      await assert.rejects(run(), (error: unknown) => {
        assert.ok(
          error instanceof ShareNetSeamUnavailableError,
          `[${label}] the refusal is the typed fail-closed error`,
        );
        assert.equal(error.failClosed, true, `[${label}] failClosed flag`);
        assert.equal(error.notIntegrated, true, `[${label}] notIntegrated label (ADR-0001)`);
        assert.equal(
          containsSentinel(error.message),
          false,
          `[${label}] the error message never echoes the sentinel`,
        );
        assert.equal(
          containsSentinel(String(error)),
          false,
          `[${label}] the stringified error never echoes the sentinel`,
        );
        return true;
      });
    }
  });
});

describe("credential refusal paths never leak the rejected secret", () => {
  it("a malformed port with the sentinel in type-invalid positions fails closed reporting TYPES, never values", () => {
    // The sentinel itself sits in the rejected `credentials` slot (a string
    // where a record is required) and in `endpoint` (a number where a string
    // is required) — the configuration error must name the fields and the
    // received types, not the rejected material.
    assert.throws(
      () =>
        createShareNetSeam({
          port: {
            endpoint: 12_345,
            capabilities: ["connectivity"],
            auth: { provider: "sharenet-oauth", credentials: SENTINEL },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ShareNetSeamConfigurationError);
        assert.equal(error.failClosed, true);
        assert.match(
          error.message,
          /auth\.credentials: Invalid input: expected record, received string/,
        );
        assert.match(error.message, /endpoint: Invalid input: expected string, received number/);
        assert.equal(containsSentinel(error.message), false, "the rejected secret is never echoed");
        assert.equal(containsSentinel(String(error)), false);
        return true;
      },
    );

    // A missing auth block is refused outright (credentials never default).
    assert.throws(
      () =>
        createShareNetSeam({
          port: { endpoint: "https://sharenet.example/api", capabilities: [] },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ShareNetSeamConfigurationError);
        assert.equal(containsSentinel(error), false);
        return true;
      },
    );
  });

  it("an unknown extra key carrying the sentinel is dropped, not stored and not echoed", async () => {
    const seam = createShareNetSeam({
      port: {
        endpoint: "https://sharenet.example/api",
        capabilities: ["connectivity"],
        auth: { provider: "sharenet-oauth", credentials: { apiKey: SENTINEL } },
        evilExtra: SENTINEL,
      } as unknown as Record<string, unknown>,
    });
    // The unknown key never reached the seam: every public output stays
    // sentinel-free (the credentials value too — it is stored privately and
    // no public output exposes it).
    const probe = await seam.probe();
    assert.equal(containsSentinel(probe), false);
    await assert.rejects(seam.createIntent({}), (error: unknown) => {
      assert.equal(containsSentinel(String(error)), false);
      return true;
    });
  });
});

describe("the surfaces command boundary redacts internal state from every public result", () => {
  it("a full journey's command results carry no own 'state' and no internal snapshot arrays", () => {
    let t = T0;
    const svc = service("redaction", () => t);

    const results: unknown[] = [];
    results.push(
      svc.enrollResource(ALICE, {
        id: "res-sec-1",
        device: `dev-${SENTINEL}`,
        type: "phone",
        capability: "forwarding-v1",
        modes: ["local", "relay"],
        limits: { maxSessions: 2 },
      }),
    );
    results.push(svc.applyConsentEvent(ALICE, "res-sec-1", "OPT_IN"));
    results.push(
      svc.recordObservation(ALICE, "res-sec-1", {
        status: "DEGRADED",
        declaredVersion: "1.0.0",
        evidence: [`evidence-uri-${SENTINEL}`],
      }),
    );
    results.push(
      svc.runLabEvaluation({
        id: "lab-sec-1",
        intent: "intent-sec-1",
        baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
        alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
        selectedStrategy: "alt",
        confidence: 0.8,
        assumptions: [],
      }),
    );
    results.push(
      svc.formOrganization(ALICE, {
        organization: "org-sec-1",
        pursuitEvidenceId: "lab-sec-1-opportunity",
        candidates: [
          { principal: ALICE, consent: true, consentRecordedAt: t },
          { principal: MEMBER, consent: true, consentRecordedAt: t },
        ],
        minFounders: 2,
        authorityScope: "group",
        initialMandates: [
          { principal: ALICE, scope: "group", permissions: ["all"] },
          { principal: MEMBER, scope: "group.purchase", permissions: ["commitment:write"] },
        ],
      }),
    );
    results.push(
      svc.openGroupPurchase(ALICE, {
        id: "gpr-sec-1",
        intent: "intent-sec-1",
        organization: "org-sec-1",
        requirements: { note: `req-${SENTINEL}` },
        threshold: 2,
        expiresAt: t + 7 * 86_400_000,
      }),
    );
    results.push(
      svc.receiveOffer(ALICE, {
        id: "gpo-sec-1",
        request: "gpr-sec-1",
        supplier: "teleco-x",
        product: `product-${SENTINEL}`,
        capability: "data-plan-v2",
        region: "GH",
        quantity: 2,
        perMemberCost: 25,
        totalCost: 50,
        recurringCharges: [],
        oneTimeCharges: [],
        term: "12-months",
        limitations: [],
        expiry: t + 1_728_000_000,
        provenance: `unicom-listing:${SENTINEL}`,
      }),
    );
    results.push(svc.commitToPurchase(ALICE, { requestId: "gpr-sec-1", allocation: { lines: 1 } }));
    results.push(
      svc.commitToPurchase(MEMBER, { requestId: "gpr-sec-1", allocation: { lines: 1 } }),
    );
    results.push(svc.advancePurchaseOrder(ALICE, { requestId: "gpr-sec-1", event: "AUTHORIZE" }));
    results.push(
      svc.advancePurchaseOrder(ALICE, {
        requestId: "gpr-sec-1",
        event: "PLACE_ORDER",
        paymentReference: {
          id: `payref-${SENTINEL}`,
          type: "payref",
          authority: "payment-authority-x",
          created: t,
          settled: false,
        },
      }),
    );
    results.push(svc.getCustomerView(ALICE));

    // (a) No public result carries the internal `state` document as an own
    //     property — the redaction boundary strips it before return.
    for (const [index, result] of results.entries()) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(result, "state"),
        false,
        `result ${index} must not carry the internal state document`,
      );
    }
    // (b) No serialized result embeds the internal snapshot arrays (the
    //     plural row keys that exist only on the internal state document).
    //     (The formation result's public `founding` projection legitimately
    //     carries the organizations-package membership/mandate PLAN, and the
    //     customer view legitimately carries its own opportunities CARDS —
    //     those are public contract projections, not surfaces state rows.)
    const internalOnlyMarkers = [
      '"consents":',
      '"observations":',
      '"orders":',
      '"requests":',
      '"offers":',
      '"commitments":',
    ];
    for (const [index, result] of results.entries()) {
      const serialized = JSON.stringify(result);
      for (const marker of internalOnlyMarkers) {
        assert.equal(
          serialized.includes(marker),
          false,
          `result ${index} must not embed the internal snapshot (${marker})`,
        );
      }
    }
  });
});

describe("view projections expose only card fields — smuggled sentinel values never surface", () => {
  it("customer, operator and developer views stay sentinel-free despite sentinel-shaped inputs", () => {
    let t = T0;
    const svc = createSurfacesService({
      statePath: path("views"),
      now: () => t,
      operatorPrincipals: ["prin-operator-sec"],
      developerPrincipals: ["prin-developer-sec"],
    });

    assert.equal(
      svc
        .enrollResource(ALICE, {
          id: "res-sec-2",
          device: `dev-${SENTINEL}`,
          type: "phone",
          capability: "forwarding-v1",
          modes: ["local", "relay"],
          limits: { maxSessions: 2 },
        })
        .applied,
      true,
    );
    assert.equal(svc.applyConsentEvent(ALICE, "res-sec-2", "OPT_IN").applied, true);
    assert.equal(
      svc
        .recordObservation(ALICE, "res-sec-2", {
          status: "DEGRADED",
          declaredVersion: "1.0.0",
          evidence: [`evidence-uri-${SENTINEL}`],
        })
        .applied,
      true,
    );
    assert.equal(
      svc
        .runLabEvaluation({
          id: "lab-sec-2",
          intent: "intent-sec-2",
          baseline: { strategy: "baseline", cost: 100, reliability: 0.9 },
          alternatives: [{ strategy: "alt", cost: 80, reliability: 0.95 }],
          selectedStrategy: "alt",
          confidence: 0.8,
          assumptions: [],
        })
        .applied,
      true,
    );
    assert.equal(
      svc
        .formOrganization(ALICE, {
          organization: "org-sec-2",
          pursuitEvidenceId: "lab-sec-2-opportunity",
          candidates: [{ principal: ALICE, consent: true, consentRecordedAt: t }],
          minFounders: 1,
          authorityScope: "group",
          initialMandates: [{ principal: ALICE, scope: "group", permissions: ["all"] }],
        })
        .applied,
      true,
    );
    assert.equal(
      svc
        .openGroupPurchase(ALICE, {
          id: "gpr-sec-2",
          intent: "intent-sec-2",
          organization: "org-sec-2",
          requirements: { note: `req-${SENTINEL}` },
          threshold: 1,
          expiresAt: t + 86_400_000,
        })
        .applied,
      true,
    );
    assert.equal(
      svc
        .receiveOffer(ALICE, {
          id: "gpo-sec-2",
          request: "gpr-sec-2",
          supplier: "teleco-x",
          product: `product-${SENTINEL}`,
          capability: "data-plan-v2",
          region: "GH",
          quantity: 1,
          perMemberCost: 25,
          totalCost: 25,
          recurringCharges: [],
          oneTimeCharges: [],
          term: "12-months",
          limitations: [],
          expiry: t + 1_728_000_000,
          provenance: `unicom-listing:${SENTINEL}`,
        })
        .applied,
      true,
    );
    assert.equal(
      svc.commitToPurchase(ALICE, { requestId: "gpr-sec-2", allocation: { lines: 1 } }).applied,
      true,
    );

    // The customer view exposes ONLY card fields: resource id/type/
    // capability/share/status — never the device identifier, never the
    // observation evidence URIs, never the offer provenance/product, never
    // the request requirements.
    const customer = svc.getCustomerView(ALICE);
    assert.equal(customer.resources.length, 1);
    const card = customer.resources[0];
    assert.ok(card, "the resource card must exist");
    assert.deepEqual(Object.keys(card).sort(), [
      "capability",
      "freshness",
      "resourceId",
      "share",
      "status",
      "type",
    ]);
    assert.equal(containsSentinel(customer), false, "the customer view stays sentinel-free");

    // The operator aggregate view counts rows (fleet/by-state summaries) —
    // no device/evidence/provenance material crosses the role boundary.
    const operator = svc.getOperatorView("prin-operator-sec");
    assert.equal(operator.applied, true);
    assert.equal(containsSentinel(operator.view), false, "the operator view stays sentinel-free");

    // The developer contract-surface view exposes schema families and row
    // counts only — no tenant material at all.
    const developer = svc.getDeveloperView("prin-developer-sec");
    assert.equal(developer.applied, true);
    assert.equal(containsSentinel(developer.view), false, "the developer view stays sentinel-free");

    // Refusal paths keep the same discipline: a refused command's reason
    // names public identifiers only.
    const refused = svc.getOperatorView(ALICE);
    assert.equal(refused.applied, false);
    assert.equal(containsSentinel(refused), false);
  });
});

describe("wire refusal details never echo rejected values", () => {
  it("a malformed envelope carrying the sentinel in a type-invalid field fails with field+type only", () => {
    const context: ValidationContext = {
      allowedScopes: ["device.forwarding"],
      currentPolicyEpoch: 7,
      knownSenders: ["inst-requester"],
      requireKnownSender: true,
      maxPayloadDigestLength: 64,
      now: T0,
    };
    // The sentinel sits in `policyEpoch` (a string where a number is
    // required) and in `sender` (a number where a string is required).
    const result = validateEnvelope(
      {
        schema: { major: 1, minor: 2, patch: 0 },
        eventId: "evt-sec-1",
        sender: 99,
        receiver: "inst-holder",
        scope: "device.forwarding",
        issuedAt: T0,
        policyEpoch: SENTINEL,
      },
      context,
    );
    assert.equal(result.accepted, false);
    assert.ok(result.failures.some((f) => f.code === "MALFORMED"));
    for (const failure of result.failures) {
      assert.equal(
        containsSentinel(failure.detail),
        false,
        `failure ${failure.code} never echoes the rejected value`,
      );
    }
    assert.match(
      result.failures[0]?.detail ?? "",
      /sender: Invalid input: expected string, received number/,
    );
    assert.match(
      result.failures[0]?.detail ?? "",
      /policyEpoch: Invalid input: expected number, received string/,
    );
  });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
