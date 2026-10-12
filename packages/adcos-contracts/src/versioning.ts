import { z } from "zod";

// Version negotiation and compatibility tests

export const SchemaVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;

export interface VersionCompatibility {
  current: SchemaVersion;
  supported: SchemaVersion[];
  negotiateVersion: (requested: SchemaVersion) => SchemaVersion | null;
  isCompatible: (version: SchemaVersion) => boolean;
}

// Version compatibility matrix
const VERSION_COMPATIBILITY_MATRIX: Record<SchemaVersion, SchemaVersion[]> = {
  "1.0.0": ["1.0.0"],
  "1.1.0": ["1.0.0", "1.1.0"],
  "1.2.0": ["1.0.0", "1.1.0", "1.2.0"],
  "2.0.0": ["2.0.0"], // Breaking change - not compatible with 1.x
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
    ) as SchemaVersion[];
  }

  negotiateVersion(requested: SchemaVersion): SchemaVersion | null {
    // First try exact match
    if (this.isCompatible(requested)) {
      return requested;
    }

    // Try to find highest compatible version less than requested
    const requestedParts = requested.split(".").map(Number);
    
    for (const version of this.supported) {
      const versionParts = version.split(".").map(Number);
      
      // Check major version compatibility
      if (versionParts[0] !== requestedParts[0]) {
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
    const compatibleVersions = VERSION_COMPATIBILITY_MATRIX[this.current] || [];
    return compatibleVersions.includes(version);
  }
}

// Schema with version field
export const VersionedSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  // Other fields would go here
});

export type Versioned = z.infer<typeof VersionedSchema>;