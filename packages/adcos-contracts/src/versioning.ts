import { z } from "zod";

// Version negotiation and compatibility tests

export const SchemaVersionSchema = z.object({
  major: z.number(),
  minor: z.number(),
  patch: z.number()
});

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;

export interface VersionCompatibility {
  current: SchemaVersion;
  supported: SchemaVersion[];
  negotiateVersion: (requested: SchemaVersion) => SchemaVersion | null;
  isCompatible: (version: SchemaVersion) => boolean;
}

// Version compatibility matrix
export const VERSION_COMPATIBILITY_MATRIX: Record<string, SchemaVersion[]> = {
  "1.0.0": [{ major: 1, minor: 0, patch: 0 }],
  "1.1.0": [{ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 }],
  "1.2.0": [{ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 }, { major: 1, minor: 2, patch: 0 }],
  "2.0.0": [{ major: 2, minor: 0, patch: 0 }], // Breaking change - not compatible with 1.x
};

export class VersionManager implements VersionCompatibility {
  current: SchemaVersion;
  supported: SchemaVersion[];

  constructor(current: SchemaVersion) {
    this.current = current;
    this.supported = Object.keys(VERSION_COMPATIBILITY_MATRIX).sort(
      (a, b) => {
        const aParts = a.split(".").map(Number);
        const bParts = b.split(".").map(Number);
        
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          if (aParts[i] !== bParts[i]) {
            return aParts[i] - bParts[i];
          }
        }
        return 0;
      }
    ).map(v => ({ major: parseInt(v.split('.')[0]), minor: parseInt(v.split('.')[1]), patch: parseInt(v.split('.')[2]) }));
  }

  negotiateVersion(requested: SchemaVersion): SchemaVersion | null {
    // First try exact match
    if (this.isCompatible(requested)) {
      return requested;
    }

    // Try to find highest compatible version less than requested
    for (const version of this.supported) {
      // Check major version compatibility
      if (version.major !== requested.major) {
        continue; // Skip different major versions
      }
      
      // Check if version is compatible
      if (this.isCompatible(version)) {
        return version;
      }
    }

    return null;
  }

  isCompatible(version: SchemaVersion): boolean {
    const compatibleVersions = VERSION_COMPATIBILITY_MATRIX[this.current.toString()] || [];
    return compatibleVersions.some(v => v.major === version.major && v.minor === version.minor && v.patch === version.patch);
  }
}

// Schema with version field
export const VersionedSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  // Other fields would go here
});

export type Versioned = z.infer<typeof VersionedSchema>;