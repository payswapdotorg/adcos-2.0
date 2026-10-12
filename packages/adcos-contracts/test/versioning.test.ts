import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  SchemaVersionSchema,
  VersionManager,
  VERSION_COMPATIBILITY_MATRIX,
  VersionedSchema,
  versionKey,
} from "../src/index.js";

// Versioning conformance: the object form is the canonical SchemaVersion,
// negotiation happens exclusively through VersionManager, and the
// compatibility matrix keys are consistent with it.

const v = (major: number, minor: number, patch: number) => ({ major, minor, patch });

describe("Versioning (object-form SchemaVersion)", () => {
  test("SchemaVersionSchema accepts nonnegative integer triples", () => {
    assert.equal(SchemaVersionSchema.safeParse(v(1, 2, 3)).success, true);
    assert.equal(SchemaVersionSchema.safeParse(v(0, 0, 0)).success, true);
  });

  test("SchemaVersionSchema rejects negative, fractional, missing and string forms", () => {
    assert.equal(SchemaVersionSchema.safeParse(v(-1, 0, 0)).success, false);
    assert.equal(SchemaVersionSchema.safeParse({ major: 1.5, minor: 0, patch: 0 }).success, false);
    assert.equal(SchemaVersionSchema.safeParse({ major: 1, minor: 0 }).success, false);
    assert.equal(SchemaVersionSchema.safeParse("1.2.3").success, false);
    assert.equal(SchemaVersionSchema.safeParse({ major: "1", minor: 0, patch: 0 }).success, false);
  });

  test("versionKey renders major.minor.patch", () => {
    assert.equal(versionKey(v(1, 2, 3)), "1.2.3");
  });

  test("VERSION_COMPATIBILITY_MATRIX keys and entries are well-formed", () => {
    for (const [key, supported] of Object.entries(VERSION_COMPATIBILITY_MATRIX)) {
      assert.match(key, /^\d+\.\d+\.\d+$/);
      for (const prior of supported) {
        assert.match(versionKey(prior), /^\d+\.\d+\.\d+$/);
      }
    }
  });

  test("VersionManager.isCompatible: self, listed priors, unknowns, other majors", () => {
    const manager = new VersionManager(v(1, 2, 0));
    assert.equal(manager.isCompatible(v(1, 2, 0)), true); // self
    assert.equal(manager.isCompatible(v(1, 1, 0)), true); // listed prior
    assert.equal(manager.isCompatible(v(1, 0, 0)), true); // listed prior
    assert.equal(manager.isCompatible(v(1, 9, 9)), false); // unknown minor
    assert.equal(manager.isCompatible(v(2, 0, 0)), false); // other major
  });

  test("VersionManager.negotiateVersion returns the requested version when compatible", () => {
    const manager = new VersionManager(v(1, 2, 0));
    assert.deepEqual(manager.negotiateVersion(v(1, 1, 0)), v(1, 1, 0));
    assert.deepEqual(manager.negotiateVersion(v(1, 2, 0)), v(1, 2, 0));
  });

  test("VersionManager.negotiateVersion downgrades unknown requests to the highest known prior", () => {
    const manager = new VersionManager(v(1, 2, 0));
    assert.deepEqual(manager.negotiateVersion(v(1, 9, 0)), v(1, 1, 0));
  });

  test("VersionManager.negotiateVersion returns null across a breaking major", () => {
    const manager = new VersionManager(v(2, 0, 0));
    assert.equal(manager.negotiateVersion(v(1, 2, 0)), null);
    assert.equal(manager.isCompatible(v(1, 0, 0)), false);
  });

  test("VersionManager with an unlisted current version supports only itself", () => {
    const manager = new VersionManager(v(3, 4, 5));
    assert.deepEqual(manager.supported, []);
    assert.equal(manager.isCompatible(v(3, 4, 5)), true);
    assert.equal(manager.negotiateVersion(v(3, 4, 4)), null);
  });

  test("VersionedSchema carries the object-form schemaVersion", () => {
    assert.equal(VersionedSchema.safeParse({ schemaVersion: v(1, 0, 0) }).success, true);
    assert.equal(VersionedSchema.safeParse({ schemaVersion: "1.0.0" }).success, false);
  });
});
