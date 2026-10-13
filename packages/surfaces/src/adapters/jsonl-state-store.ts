import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  EMPTY_SURFACE_STATE,
  isSurfaceStateLike,
  type SurfaceState,
  type SurfaceStatePersistence,
  type SurfaceStoreStats,
} from "../domain/state.js";

// ============================================================================
// Durable surfaces state store — append-only JSONL persistence.
//
// This is the surfaces adapters-layer equivalent of the landed
// JsonlInboxStore pattern (packages/coordination/src/adapters/):
// - durability: every applied command appends a FULL state snapshot to the
//   JSONL file BEFORE the command is acknowledged (write-ahead, one line
//   per snapshot);
// - restart: constructing a new store (or calling restore) re-reads the
//   file and folds the LAST parseable, correctly-shaped snapshot (last
//   snapshot wins — history is never rewritten in place);
// - torn tail: a crash mid-append yields a truncated final line; it is
//   counted, reported and skipped — never silently trusted;
// - node I/O lives HERE only (adapters layer); the domain stays pure.
// ============================================================================

export class JsonlSurfaceStateStore implements SurfaceStatePersistence {
  private readonly path: string;
  private folded: SurfaceState | undefined;
  private snapshots = 0;
  private tornLines = 0;

  constructor(path: string) {
    this.path = path;
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    this.rescan();
  }

  /** Append a full state snapshot durably (write-before-ack). */
  persist(state: SurfaceState): void {
    appendFileSync(this.path, `${JSON.stringify(state)}\n`, "utf8");
    this.snapshots += 1;
  }

  /**
   * Fold the durable log into the current state. The last parseable,
   * correctly-shaped snapshot wins; torn/corrupt lines are reported, not
   * trusted. An absent file is a fresh start (empty state).
   */
  restore(): SurfaceState {
    this.rescan();
    return this.folded ?? EMPTY_SURFACE_STATE;
  }

  /** Current durability stats without re-reading the file. */
  stats(): SurfaceStoreStats {
    return { snapshots: this.snapshots, tornLines: this.tornLines };
  }

  private rescan(): void {
    this.folded = undefined;
    this.snapshots = 0;
    this.tornLines = 0;
    if (!existsSync(this.path)) {
      return;
    }
    const lines = readFileSync(this.path, "utf8").split("\n");
    // A trailing newline yields one empty final element — not torn.
    for (const line of lines) {
      if (line === "") {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(line);
        if (!isSurfaceStateLike(parsed)) {
          // Parseable but not shaped like a surface state: corrupt, not trusted.
          this.tornLines += 1;
          continue;
        }
        this.folded = parsed;
        this.snapshots += 1;
      } catch {
        this.tornLines += 1;
      }
    }
  }
}
