import { appendFileSync, readFileSync, existsSync } from "node:fs";
import type { Message } from "@adcos/contracts";

// ============================================================================
// Durable inbox/outbox store — append-only JSONL persistence.
//
// Durability model: every accepted message is appended to a JSONL file
// before acknowledgement (write-ahead, one line per message). Restarts
// re-read the file; a torn final line (crash during append) is reported
// and skipped, never silently trusted.
//
// The log is append-only SNAPSHOTS: a lifecycle transition (PENDING ->
// PROCESSING -> terminal, per the EventLifecycle machine) is appended as a
// new full-message line for the same message id. Reload folds snapshots by
// id (last snapshot wins; position = first appearance), so transitions are
// durable across restarts without ever rewriting history in place.
// ============================================================================

export interface InboxStoreStats {
  /** Messages successfully loaded on the last reload. */
  loaded: number;
  /** Torn/corrupt tail lines detected and skipped (reported, not hidden). */
  tornLines: number;
}

export class JsonlInboxStore {
  private readonly path: string;
  private messages: Message[] = [];
  private tornLines = 0;

  constructor(path: string) {
    this.path = path;
    this.reload();
  }

  /**
   * Append a message snapshot durably (write-before-ack). Appending a
   * snapshot whose id already exists records a lifecycle transition: the
   * file gains a new line (history is never rewritten) and the in-memory
   * view keeps ONE entry per id, at first-appearance position.
   */
  append(message: Message): void {
    appendFileSync(this.path, `${JSON.stringify(message)}\n`, "utf8");
    const existing = this.messages.findIndex((entry) => entry.id === message.id);
    if (existing === -1) {
      this.messages.push(message);
    } else {
      this.messages[existing] = message;
    }
  }

  /** All loaded messages (oldest first). */
  list(): readonly Message[] {
    return this.messages;
  }

  /**
   * Reload from disk (idempotent; models a process restart against the
   * same file). Snapshots are folded by id: the last snapshot of a message
   * wins and keeps its first-appearance position. Returns durability stats
   * including any torn tail lines (reported, never trusted).
   */
  reload(): InboxStoreStats {
    const folded = new Map<string, { index: number; message: Message }>();
    this.messages = [];
    this.tornLines = 0;
    if (!existsSync(this.path)) {
      return { loaded: 0, tornLines: 0 };
    }
    const lines = readFileSync(this.path, "utf8").split("\n");
    // A trailing newline yields one empty final element — not torn.
    for (const line of lines) {
      if (line === "") {
        continue;
      }
      try {
        const message = JSON.parse(line) as Message;
        const existing = folded.get(message.id);
        if (existing === undefined) {
          folded.set(message.id, { index: this.messages.length, message });
          this.messages.push(message);
        } else {
          folded.set(message.id, { index: existing.index, message });
          this.messages[existing.index] = message;
        }
      } catch {
        this.tornLines += 1;
      }
    }
    return { loaded: this.messages.length, tornLines: this.tornLines };
  }

  /** Current durability stats without reloading. */
  stats(): InboxStoreStats {
    return { loaded: this.messages.length, tornLines: this.tornLines };
  }
}
