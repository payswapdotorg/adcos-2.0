import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createShareNetSeam,
  ShareNetSeamConfigurationError,
  ShareNetSeamUnavailableError,
} from "../src/adapters/sharenet/sharenet-seam.js";

// ============================================================================
// ShareNet seam (ADR-0001) fail-closed proofs. The seam must refuse every
// consequential operation and never fabricate readiness, because no verified
// ShareNet integration exists in this repository ("no 'ShareNet integrated'
// claim may be recorded before conformance/interop tests against a real
// ShareNet instance pass" — ADR-0001).
// ============================================================================

const validPort = {
  endpoint: "sharenet://public-seam.example",
  capabilities: ["live-bridging", "store-carry-forward"],
  auth: { provider: "public-docs-reference", credentials: { reference: "none" } },
};

describe("createShareNetSeam configuration gate", () => {
  it("accepts a ShareNetPort-shaped configuration and returns the labeled stub", () => {
    const seam = createShareNetSeam({ port: validPort });
    assert.equal(seam.seamKind, "sharenet");
    assert.match(seam.implementation, /failing-closed-reference-stub/);
    assert.match(seam.implementation, /NOT integrated/);
  });

  it("fails closed at construction on malformed port configuration (typed error)", () => {
    assert.throws(
      () => createShareNetSeam({ port: { endpoint: 42 } }),
      ShareNetSeamConfigurationError,
    );
    assert.throws(
      () => createShareNetSeam({ port: { capabilities: "not-a-list" } }),
      ShareNetSeamConfigurationError,
    );
    assert.throws(
      () =>
        createShareNetSeam({
          port: {
            endpoint: "x",
            capabilities: [],
            auth: { provider: 5, credentials: {} },
          },
        }),
      (error: unknown) =>
        error instanceof ShareNetSeamConfigurationError && /auth\.provider/.test(error.message),
    );
  });
});

describe("ShareNet seam fails closed on every operation", () => {
  const seam = createShareNetSeam({ port: validPort });

  it("probe() reports UNAVAILABLE with the ADR-0001 reason — never fabricates readiness", async () => {
    const probe = await seam.probe();
    assert.equal(probe.status, "UNAVAILABLE");
    assert.match(probe.implementation, /failing-closed-reference-stub/);
    assert.match(probe.reason ?? "", /ADR-0001/);
    assert.match(probe.reason ?? "", /never fabricated/);
    // The fail-closed contract itself: this stub must never claim AVAILABLE.
    assert.notEqual(probe.status, "AVAILABLE");
  });

  const consequential: [string, () => Promise<unknown>][] = [
    ["createIntent", () => seam.createIntent({ requirement: "bounded" })],
    ["discoverOffers", () => seam.discoverOffers("intent-ref")],
    ["acceptOffer", () => seam.acceptOffer("intent-ref", "offer-ref")],
    ["getContract", () => seam.getContract("contract-ref")],
    ["getAssurance", () => seam.getAssurance("contract-ref")],
    ["getExecution", () => seam.getExecution("contract-ref")],
    ["terminate", () => seam.terminate("contract-ref")],
  ];

  for (const [operation, invoke] of consequential) {
    it(`'${operation}' rejects with the labeled fail-closed error`, async () => {
      await assert.rejects(
        () => invoke(),
        (error: unknown) => {
          assert.ok(
            error instanceof ShareNetSeamUnavailableError,
            `${operation}: wrong error class`,
          );
          assert.equal(error.failClosed, true);
          assert.equal(error.notIntegrated, true);
          assert.match(error.message, new RegExp(`operation '${operation}'`));
          assert.match(error.message, /ADR-0001/);
          assert.match(error.message, /FAILS CLOSED/);
          return true;
        },
      );
    });
  }

  it("rejects reads and writes alike: no fabricated contract, assurance or execution state", async () => {
    // Every read/write above already rejected; this pins the invariant as a
    // single assertion for greppability: the seam yields zero successful
    // operations of any kind.
    let successes = 0;
    const attempts = consequential.map(([name, invoke]) =>
      invoke().then(
        () => {
          successes += 1;
        },
        (error: unknown) => {
          assert.ok(error instanceof ShareNetSeamUnavailableError, `${name} must fail closed`);
        },
      ),
    );
    await Promise.all(attempts);
    assert.equal(successes, 0);
  });
});
