// ============================================================================
// Wire protocol for the coordination transport — newline-delimited JSON
// frames (JSONL over TCP). Adapters-layer only: this file describes a WIRE
// shape, which is transport detail, not domain logic.
//
// Fail-closed doctrine (mirrors the durable store's torn-tail rule): a frame
// that cannot be decoded strictly is a protocol error, never silently
// trusted. The receiver destroys the connection; the sender treats it as a
// transport failure subject to the merged retry/dead-letter semantics.
// ============================================================================

/** Correlation id for one ENVELOPE frame and its ACK/REJECT response. */
export type FrameId = string;

/** Receiver-side validation failure transported back to the sender. */
export interface WireFailure {
  readonly code: string;
  readonly detail: string;
}

export type WireFrame =
  | { readonly type: "ENVELOPE"; readonly frameId: FrameId; readonly envelope: unknown }
  | { readonly type: "ACK"; readonly frameId: FrameId; readonly messageId: string }
  | {
      readonly type: "REJECT";
      readonly frameId: FrameId;
      readonly failures: readonly WireFailure[];
    };

/** Default maximum accepted encoded frame line (bytes). Oversized = fail closed. */
export const DEFAULT_MAX_FRAME_BYTES = 1_048_576;

/** Protocol-level error: malformed, unknown, or oversized frame. */
export class WireProtocolError extends Error {
  readonly protocolViolation: true = true;
  constructor(message: string) {
    super(message);
    this.name = "WireProtocolError";
  }
}

let frameCounter = 0;

/**
 * Allocate a frame id. Correlation only — NOT a security token; identity and
 * authorization are enforced by the envelope validation pipeline, never by
 * the wire layer.
 */
export function createFrameId(prefix = "frame"): FrameId {
  frameCounter += 1;
  return `${prefix}-${process.pid}-${frameCounter}`;
}

/** Encode a frame as one wire line (JSON + trailing newline). */
export function encodeFrame(frame: WireFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(container: Record<string, unknown>, key: string, context: string): string {
  const value = container[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new WireProtocolError(`${context}: '${key}' must be a non-empty string`);
  }
  return value;
}

/**
 * Decode one wire line strictly. Unknown frame types, missing correlation
 * ids, or structurally invalid payloads raise WireProtocolError (fail
 * closed). Envelope payloads are structurally pre-checked only (object with
 * an eventId); full schema/policy validation happens downstream in
 * validateEnvelope before dispatch — the codec never vouches for semantics.
 */
export function decodeFrame(line: string): WireFrame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new WireProtocolError(`frame is not valid JSON: ${(error as Error).message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new WireProtocolError("frame must be a JSON object");
  }
  const type = parsed["type"];
  switch (type) {
    case "ENVELOPE": {
      const frameId = requireString(parsed, "frameId", "ENVELOPE frame");
      if (!isPlainObject(parsed["envelope"])) {
        throw new WireProtocolError(`ENVELOPE frame ${frameId}: 'envelope' must be an object`);
      }
      if (typeof (parsed["envelope"] as Record<string, unknown>)["eventId"] !== "string") {
        throw new WireProtocolError(
          `ENVELOPE frame ${frameId}: 'envelope.eventId' must be a string (structural pre-check only)`,
        );
      }
      return { type: "ENVELOPE", frameId, envelope: parsed["envelope"] };
    }
    case "ACK": {
      const frameId = requireString(parsed, "frameId", "ACK frame");
      const messageId = requireString(parsed, "messageId", "ACK frame");
      return { type: "ACK", frameId, messageId };
    }
    case "REJECT": {
      const frameId = requireString(parsed, "frameId", "REJECT frame");
      const rawFailures = parsed["failures"];
      if (!Array.isArray(rawFailures) || rawFailures.length === 0) {
        throw new WireProtocolError(
          `REJECT frame ${frameId}: 'failures' must be a non-empty array`,
        );
      }
      const failures: WireFailure[] = [];
      for (const item of rawFailures) {
        if (!isPlainObject(item)) {
          throw new WireProtocolError(`REJECT frame ${frameId}: each failure must be an object`);
        }
        failures.push({
          code: requireString(item, "code", "REJECT failure"),
          detail: requireString(item, "detail", "REJECT failure"),
        });
      }
      return { type: "REJECT", frameId, failures };
    }
    default:
      throw new WireProtocolError(`unknown frame type: ${String(type)}`);
  }
}
