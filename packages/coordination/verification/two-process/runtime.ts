// ============================================================================
// Two-process physical verification runtime (P2-W2 acceptance core).
//
// One ADCOS coordination runtime per OS process, each with its OWN on-disk
// JSONL inbox/outbox stores, exchanging envelopes over the real TCP
// transport. The test process drives both runtimes over stdin (JSONL
// commands) and observes stdout (JSONL events) — a control plane strictly
// separate from the TCP data plane, mirroring the spec's control/data plane
// separation.
//
// usage: node --import tsx runtime.ts --role listener|sender --dir <store-dir>
//               [--host 127.0.0.1] [--port 0] [--retry-delay-ms 25]
//
// stdin commands (one JSON object per line):
//   {"cmd":"listen"}                              -> rebind the last port
//   {"cmd":"unlisten"}                            -> model a partition
//   {"cmd":"set-peer","host":"...","port":N}
//   {"cmd":"set-handler","mode":"complete-all"|"fail-all"}
//   {"cmd":"send","envelope":{...},"maxRetries":N,"retryDelayMs":M}
//   {"cmd":"status"}
//   {"cmd":"shutdown"}                            -> clean exit 0
//
// stdout events (one JSON object per line): "ready", "listening",
// "listener-closed", endpoint events (inbox-accepted / inbox-rejected /
// lifecycle / deadletter / outbox-*), "outbox-report" (terminal SendReport),
// "status", "error". Unknown or malformed input -> {"event":"error"}.
// ============================================================================

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CoordinationEndpoint, JsonlInboxStore } from "../../src/contract.js";
import type { Envelope } from "@adcos/contracts";
import type { HandlerOutcome, MessageHandler } from "../../src/contract.js";

interface RuntimeConfig {
  role: "listener" | "sender";
  dir: string;
  host: string;
  port: number;
  retryDelayMs: number;
  clockOffsetMs: number;
}

function parseArguments(argv: string[]): RuntimeConfig {
  const config: RuntimeConfig = {
    role: "listener",
    dir: "",
    host: "127.0.0.1",
    port: 0,
    retryDelayMs: 25,
    clockOffsetMs: 0,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--role":
        index += 1;
        config.role = argv[index] === "sender" ? "sender" : "listener";
        break;
      case "--dir":
        index += 1;
        config.dir = argv[index] ?? "";
        break;
      case "--host":
        index += 1;
        config.host = argv[index] ?? config.host;
        break;
      case "--port":
        index += 1;
        config.port = Number(argv[index] ?? 0);
        break;
      case "--retry-delay-ms":
        index += 1;
        config.retryDelayMs = Number(argv[index] ?? 25);
        break;
      case "--clock-offset-ms":
        // Verification affordance: models real cross-device clock skew (the
        // runtime's clock runs N ms ahead of its peer's).
        index += 1;
        config.clockOffsetMs = Number(argv[index] ?? 0);
        break;
      default:
        break;
    }
  }
  if (config.dir === "") {
    process.stderr.write("runtime: --dir <store-dir> is required\n");
    process.exit(2);
  }
  return config;
}

const config = parseArguments(process.argv);
mkdirSync(config.dir, { recursive: true });

const instanceId = config.role === "listener" ? "inst-a" : "inst-b";
const peerId = config.role === "listener" ? "inst-b" : "inst-a";

let handlerMode: "complete-all" | "fail-all" = "complete-all";
const handler: MessageHandler = (): HandlerOutcome => {
  if (handlerMode === "fail-all") {
    // No explicit deadLetterReason: let the merged lifecycle machine attach
    // its canonical "retry budget exhausted" reason at exhaustion.
    return { outcome: "FAILED" };
  }
  return { outcome: "COMPLETED" };
};

const endpoint = new CoordinationEndpoint({
  instanceId,
  store: new JsonlInboxStore(join(config.dir, "inbox.jsonl")),
  outboxStore: new JsonlInboxStore(join(config.dir, "outbox.jsonl")),
  allowedScopes: ["device.forwarding"],
  knownSenders: [peerId],
  requireKnownSender: true,
  egressScopes: ["device.forwarding"],
  handler,
  retryDelayMs: config.retryDelayMs,
  ackTimeoutMs: 2000,
  now: () => Date.now() + config.clockOffsetMs,
  onEvent: (event) => {
    writeLine({ event: event.kind, ...event });
  },
});

let peer: { host: string; port: number } | null = null;
let lastPort: number | null = null;

function writeLine(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function handleCommand(raw: string): Promise<void> {
  let command: Record<string, unknown>;
  try {
    command = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    writeLine({ event: "error", message: `malformed command line: ${(error as Error).message}` });
    return;
  }
  const kind = command["cmd"];
  try {
    switch (kind) {
      case "listen": {
        const bound = await endpoint.listen(lastPort ?? config.port, config.host);
        lastPort = bound.port;
        writeLine({ event: "listening", port: bound.port });
        return;
      }
      case "unlisten": {
        await endpoint.stopListening();
        writeLine({ event: "listener-closed" });
        return;
      }
      case "set-peer": {
        const host = command["host"];
        const port = command["port"];
        if (typeof host !== "string" || typeof port !== "number") {
          writeLine({
            event: "error",
            message: "set-peer requires host (string) and port (number)",
          });
          return;
        }
        peer = { host, port };
        writeLine({ event: "peer-set", host, port });
        return;
      }
      case "set-handler": {
        const mode = command["mode"];
        if (mode !== "complete-all" && mode !== "fail-all") {
          writeLine({ event: "error", message: `unknown handler mode: ${String(mode)}` });
          return;
        }
        handlerMode = mode;
        writeLine({ event: "handler-set", mode });
        return;
      }
      case "send": {
        const envelope = command["envelope"];
        if (peer === null) {
          writeLine({ event: "error", message: "no peer configured (set-peer first)" });
          return;
        }
        const target = peer;
        const maxRetries = typeof command["maxRetries"] === "number" ? command["maxRetries"] : 16;
        const retryDelayMs =
          typeof command["retryDelayMs"] === "number"
            ? command["retryDelayMs"]
            : config.retryDelayMs;
        const report = await endpoint.send(envelope as Envelope, {
          host: target.host,
          port: target.port,
          maxRetries,
          retryDelayMs,
        });
        writeLine({ event: "outbox-report", report: report as unknown as Record<string, unknown> });
        return;
      }
      case "status": {
        writeLine({
          event: "status",
          instanceId,
          listening: endpoint.listening,
          port: lastPort,
          handlerMode,
          inbox: endpoint.stats().inbox,
        });
        return;
      }
      case "shutdown": {
        endpoint.dispose();
        // Give pending socket writes a tick before exiting cleanly.
        setImmediate(() => {
          process.exit(0);
        });
        return;
      }
      default: {
        writeLine({ event: "error", message: `unknown command: ${String(kind)}` });
      }
    }
  } catch (error) {
    writeLine({
      event: "error",
      message: `command '${String(kind)}' failed: ${(error as Error).message}`,
    });
  }
}

process.stdin.setEncoding("utf8");
let stdinBuffer = "";
process.stdin.on("data", (chunk: string) => {
  stdinBuffer += chunk;
  let newlineIndex = stdinBuffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = stdinBuffer.slice(0, newlineIndex).trim();
    stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
    if (line !== "") {
      void handleCommand(line);
    }
    newlineIndex = stdinBuffer.indexOf("\n");
  }
});
process.stdin.on("end", () => {
  endpoint.dispose();
  process.exit(0);
});
process.on("uncaughtException", (error) => {
  writeLine({ event: "error", message: `uncaught: ${error.message}` });
});

writeLine({ event: "ready", instanceId, dir: config.dir });
