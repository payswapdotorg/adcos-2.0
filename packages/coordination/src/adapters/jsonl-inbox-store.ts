import { appendFileSync, readFileSync, existsSync } from "node:fs";
import type { Message } from "@adcos/contracts";

// ============================================================================
// Durable inbox/outbox store — append-only JSONL persistence.
//
// Durability model: every accepted message is appended to a JSONL file
// before acknowledgement (write-ahead, one line per message). Restarts
// re-read the file; a torn final line (crash during append) is reported
// and skipped, never silently trusted.
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

  /** Append a message durably (write-before-ack). */
  append(message: Message): void {
    appendFileSync(this.path, `${JSON.stringify(message)}\n`, "utf8");
    this.messages.push(message);
  }

  /** All loaded messages (oldest first). */
  list(): readonly Message[] {
    return this.messages;
  }

  /**
   * Reload from disk (idempotent; models a process restart against the
   * same file). Returns durability stats including any torn tail lines.
   */
  reload(): InboxStoreStats {
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
        this.messages.push(JSON.parse(line) as Message);
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
