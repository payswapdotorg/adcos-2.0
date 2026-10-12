import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUTHORITY_CONCERNS,
  FieldAuthorityMapping,
  validateFieldAuthorityMappings,
} from "../src/index.js";

// Meta-tests over the field→authority mapping: full coverage against the
// real zod schemas, closed vocabulary per spec/authority-model.md, and the
// no-secrets boundary (adapter credentials exist only in Port config).

describe("Field→authority mapping (meta-tests)", () => {
  it("covers every field of every canonical schema", () => {
    const result = validateFieldAuthorityMappings();
    assert.deepEqual(result.missing, []);
    assert.equal(result.valid, true);
  });

  it("contains no stale rows (every table entry matches a real schema field path)", () => {
    const result = validateFieldAuthorityMappings();
    assert.deepEqual(result.stale, []);
  });

  it("uses only spec-defined authority concerns (closed vocabulary)", () => {
    const result = validateFieldAuthorityMappings();
    assert.deepEqual(result.invalid, []);
    assert.equal(AUTHORITY_CONCERNS.length, 13);
  });

  it("keeps provider-adapter credentials out of canonical entity fields", () => {
    // Port auth config legitimately holds adapter credentials; every other
    // canonical entity field must not carry the provider-adapter concern.
    const violations = Object.entries(FieldAuthorityMapping)
      .filter(([, concern]) => concern === "provider-adapter")
      .map(([field]) => field)
      .filter((field) => !field.startsWith("ShareNetPort.") && !field.startsWith("AdcosPort."));
    assert.deepEqual(violations, []);
  });

  it("maps payment references to the payment-system concern (opaque references only)", () => {
    assert.equal(FieldAuthorityMapping["PaymentReference.authority"], "payment-system");
    assert.equal(FieldAuthorityMapping["PaymentReference.id"], "payment-system");
  });

  it("maps ShareNet adapter credentials to the provider-adapter concern", () => {
    assert.equal(FieldAuthorityMapping["ShareNetPort.auth.credentials"], "provider-adapter");
    assert.equal(FieldAuthorityMapping["ShareNetPort.endpoint"], "sharenet");
  });

  it("maps Lab evidence to the lab-advisory concern", () => {
    assert.equal(
      FieldAuthorityMapping["LabComparisonEvidence.selected.confidence"],
      "lab-advisory",
    );
    assert.equal(FieldAuthorityMapping["OpportunityEvidence.recommendation"], "lab-advisory");
  });
});
