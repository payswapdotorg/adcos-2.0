import { describe, test, expect } from "node:test";
import { z } from "zod";
import { VersionManager, SchemaVersion, VERSION_COMPATIBILITY_MATRIX } from "../src/versioning";

describe("Version Compatibility Tests", () => {
  test("should validate schema versions", () => {
    const validVersion: SchemaVersion = "1.0.0";
    const invalidVersion = "invalid";
    
    expect(() => z.string().regex(/^\d+\.\d+\.\d+$/).parse(validVersion)).not.toThrow();
    expect(() => z.string().regex(/^\d+\.\d+\.\d+$/).parse(invalidVersion)).toThrow();
  });

  test("should negotiate compatible versions", () => {
    const manager = new VersionManager("1.1.0");
    
    // Exact match
    expect(manager.negotiateVersion("1.1.0")).toBe("1.1.0");
    
    // Compatible minor version
    expect(manager.negotiateVersion("1.0.0")).toBe("1.0.0");
    
    // Incompatible major version
    expect(manager.negotiateVersion("2.0.0")).toBeNull();
    
    // Compatible patch version
    expect(manager.negotiateVersion("1.1.1")).toBe("1.1.0"); // Returns highest compatible
  });

  test("should check version compatibility", () => {
    const manager = new VersionManager("1.1.0");
    
    expect(manager.isCompatible("1.0.0")).toBe(true);
    expect(manager.isCompatible("1.1.0")).toBe(true);
    expect(manager.isCompatible("1.2.0")).toBe(false); // Not supported yet
    expect(manager.isCompatible("2.0.0")).toBe(false); // Different major
  });

  test("should handle breaking changes", () => {
    const v1Manager = new VersionManager("1.2.0");
    const v2Manager = new VersionManager("2.0.0");
    
    // V1 and V2 are not compatible
    expect(v1Manager.negotiateVersion("2.0.0")).toBeNull();
    expect(v2Manager.negotiateVersion("1.2.0")).toBeNull();
    
    // But V2 is compatible with itself
    expect(v2Manager.negotiateVersion("2.0.0")).toBe("2.0.0");
    expect(v2Manager.negotiateVersion("2.1.0")).toBe("2.0.0"); // Returns highest compatible
  });

  test("should support version matrix", () => {
    expect(VERSION_COMPATIBILITY_MATRIX["1.0.0"]).toEqual(["1.0.0"]);
    expect(VERSION_COMPATIBILITY_MATRIX["1.1.0"]).toEqual(["1.0.0", "1.1.0"]);
    expect(VERSION_COMPATIBILITY_MATRIX["2.0.0"]).toEqual(["2.0.0"]);
  });
});