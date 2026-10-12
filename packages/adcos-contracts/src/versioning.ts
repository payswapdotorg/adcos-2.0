import { z } from "zod";

// ============================================================================
// Canonical SchemaVersion (object form) — single source of truth
// ============================================================================

/**
 * Canonical schema version representation (object form).
 * Used by Envelope.schema, AdcosPort.version and all versioned payloads.
 * The string form "major.minor.patch" is only a wire/rendering concern
 * (see versionKey); parsers never accept it as this type.
 */
export const SchemaVersionSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
});

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;

/** Render a SchemaVersion as its "major.minor.patch" key form. */
export const versionKey = (v: SchemaVersion): string => `${v.major}.${v.minor}.${v.patch}`;

const sameVersion = (a: SchemaVersion, b: SchemaVersion): boolean =>
  a.major === b.major && a.minor === b.minor && a.patch === b.patch;

/**
 * Version compatibility matrix: maps a version key to the list of PRIOR
 * versions it remains wire-compatible with. The entry's own version is
 * always compatible with itself (implicit; not listed).
 */
export const VERSION_COMPATIBILITY_MATRIX: Record<string, SchemaVersion[]> = {
  "1.0.0": [],
  "1.1.0": [{ major: 1, minor: 0, patch: 0 }],
  "1.2.0": [
    { major: 1, minor: 0, patch: 0 },
    { major: 1, minor: 1, patch: 0 },
  ],
  "2.0.0": [], // breaking release: no 1.x compatibility
};

export interface VersionCompatibility {
  readonly current: SchemaVersion;
  readonly supported: readonly SchemaVersion[];
  negotiateVersion(requested: SchemaVersion): SchemaVersion | null;
  isCompatible(version: SchemaVersion): boolean;
}

/**
 * Version negotiation manager — the single negotiation API of the contracts
 * surface. Deep imports are forbidden by architecture-policy; consumers use
 * the re-exports from src/index.ts.
 */
export class VersionManager implements VersionCompatibility {
  readonly current: SchemaVersion;
  readonly supported: readonly SchemaVersion[];

  constructor(current: SchemaVersion) {
    this.current = current;
    this.supported = VERSION_COMPATIBILITY_MATRIX[versionKey(current)] ?? [];
  }

  isCompatible(version: SchemaVersion): boolean {
    return (
      sameVersion(this.current, version) || this.supported.some((v) => sameVersion(v, version))
    );
  }

  /**
   * Negotiate a mutually usable version.
   * - returns `requested` when it is compatible with this manager's current version;
   * - otherwise returns the highest supported version with the same major that
   *   does not exceed the requested version;
   * - otherwise returns null (no overlap — e.g. across a breaking major).
   */
  negotiateVersion(requested: SchemaVersion): SchemaVersion | null {
    if (this.isCompatible(requested)) {
      return requested;
    }
    const candidates = this.supported
      .filter((v) => v.major === requested.major)
      .filter(
        (v) =>
          v.minor < requested.minor || (v.minor === requested.minor && v.patch <= requested.patch),
      )
      .sort((a, b) => b.minor - a.minor || b.patch - a.patch);
    return candidates[0] ?? null;
  }
}

/**
 * Mixin for versioned payloads.
 */
export const VersionedSchema = z.object({
  schemaVersion: SchemaVersionSchema,
});

export type Versioned = z.infer<typeof VersionedSchema>;
