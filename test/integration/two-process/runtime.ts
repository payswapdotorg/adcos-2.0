// ============================================================================
// P3-W1 two-process dogfood runtime — one ADCOS instance per OS process.
//
// Each process composes, through PUBLIC contract entry points only:
//   - the surfaces service over ONE durable JSONL state log (--state),
//     driven through createSurfacesService (write-before-ack persistence,
//     real clock — determinism belongs to the in-process suites; this
//     runtime proves real restart durability);
//   - a coordination endpoint with its OWN durable inbox/outbox JSONL
//     stores (--coord-dir) over the REAL TCP transport (loopback).
//
// The control plane is stdin/stdout JSONL (mirroring the landed two-process
// precedents in packages/surfaces and packages/coordination); the state and
// coordination logs are the durable data planes on disk.
//
// usage: node --import tsx runtime.ts --state <state-file> --coord-dir <dir>
//               --instance <inst-id> --peer <peer-inst-id>
//               [--operators prin-a,prin-b]
//
// stdin commands (one JSON object per line):
//   {"cmd":"enroll","actor":"...","resource":{...}}
//   {"cmd":"consent","actor":"...","resourceId":"...","event":"OPT_IN"}
//   {"cmd":"observe","actor":"...","resourceId":"...","input":{...}}
//   {"cmd":"lab","input":{...}}
//   {"cmd":"form","actor":"...","input":{...}}
//   {"cmd":"open","actor":"...","input":{...}}
//   {"cmd":"offer","actor":"...","offer":{...}}
//   {"cmd":"commit","actor":"...","input":{...}}
//   {"cmd":"order","actor":"...","input":{...}}
//   {"cmd":"view","principal":"..."}
//   {"cmd":"durability"}                          -> stats
//   {"cmd":"listen"}                              -> {"event":"listening",port}
//   {"cmd":"send","envelope":{...},"host":"127.0.0.1","port":N}
//   {"cmd":"coord-stats"}                         -> {"event":"coord-stats",...}
//   {"cmd":"shutdown"}                            -> clean exit 0
//
// stdout events: {"event":"ready"}, {"event":"result",...}, {"event":"view",...},
// {"event":"stats",...}, endpoint events (inbox-accepted / inbox-rejected /
// lifecycle / deadletter / outbox-*), {"event":"outbox-report",...},
// {"event":"coord-stats",...}, {"event":"error",...}. Unknown or malformed
// input -> {"event":"error"} (fail-closed, no crash).
// ============================================================================

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createSurfacesService } from "../../../packages/surfaces/src/contract.js";
import type { SurfacesService } from "../../../packages/surfaces/src/contract.js";
import {
  CoordinationEndpoint,
  JsonlInboxStore,
} from "../../../packages/coordination/src/contract.js";
import type {
  HandlerOutcome,
  MessageHandler,
} from "../../../packages/coordination/src/contract.js";
import type { Envelope } from "../../../packages/adcos-contracts/src/index.js";

interface RuntimeConfig {
  state: string;
  coordDir: string;
  instance: string;
  peer: string;
  operators: string[];
}

function parseArguments(argv: string[]): RuntimeConfig {
  const config: RuntimeConfig = {
    state: "",
    coordDir: "",
    instance: "",
    peer: "",
    operators: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--state") {
      config.state = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--coord-dir") {
      config.coordDir = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--instance") {
      config.instance = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--peer") {
      config.peer = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--operators") {
      config.operators = (argv[i + 1] ?? "").split(",").filter((x) => x !== "");
      i += 1;
    }
  }
  if (
    config.state === "" ||
    config.coordDir === "" ||
    config.instance === "" ||
    config.peer === ""
  ) {
    process.stderr.write(
      "usage: runtime.ts --state <file> --coord-dir <dir> --instance <id> --peer <id> [--operators a,b]\n",
    );
    process.exit(2);
  }
  return config;
}

const config = parseArguments(process.argv.slice(2));
mkdirSync(config.coordDir, { recursive: true });

// A real process reads the REAL clock — this runtime proves real restart
// durability, not deterministic replay (the in-process suites cover that).
const service: SurfacesService = createSurfacesService({
  statePath: config.state,
  now: () => Date.now(),
  operatorPrincipals: config.operators,
});

// The coordination handler completes every accepted message in this dogfood
// story (the fail-closed no-handler default is covered by the coordination
// package's own tests; this runtime exercises the composed happy path).
const handler: MessageHandler = (): HandlerOutcome => ({ outcome: "COMPLETED" });

const endpoint = new CoordinationEndpoint({
  instanceId: config.instance,
  store: new JsonlInboxStore(join(config.coordDir, "inbox.jsonl")),
  outboxStore: new JsonlInboxStore(join(config.coordDir, "outbox.jsonl")),
  allowedScopes: ["device.forwarding"],
  knownSenders: [config.peer],
  requireKnownSender: true,
  egressScopes: ["device.forwarding"],
  handler,
  retryDelayMs: 25,
  ackTimeoutMs: 2000,
  onEvent: (event) => {
    writeLine({ event: event.kind, ...event });
  },
});

function writeLine(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

interface Command {
  cmd?: string;
  [key: string]: unknown;
}

function handle(line: string): boolean {
  let command: Command;
  try {
    command = JSON.parse(line) as Command;
  } catch {
    emitError("malformed JSON input line");
    return true;
  }
  try {
    switch (command.cmd) {
      case "shutdown":
        return false;
      case "enroll":
        emit({
          event: "result",
          cmd: "enroll",
          ...service.enrollResource(command.actor as string, command.resource as never),
        });
        return true;
      case "consent":
        emit({
          event: "result",
          cmd: "consent",
          ...service.applyConsentEvent(
            command.actor as string,
            command.resourceId as string,
            command.event as never,
          ),
        });
        return true;
      case "observe":
        emit({
          event: "result",
          cmd: "observe",
          ...service.recordObservation(
            command.actor as string,
            command.resourceId as string,
            command.input as never,
          ),
        });
        return true;
      case "lab":
        emit({ event: "result", cmd: "lab", ...service.runLabEvaluation(command.input as never) });
        return true;
      case "form":
        emit({
          event: "result",
          cmd: "form",
          ...service.formOrganization(command.actor as string, command.input as never),
        });
        return true;
      case "open":
        emit({
          event: "result",
          cmd: "open",
          ...service.openGroupPurchase(command.actor as string, command.input as never),
        });
        return true;
      case "offer":
        emit({
          event: "result",
          cmd: "offer",
          ...service.receiveOffer(command.actor as string, command.offer as never),
        });
        return true;
      case "commit":
        emit({
          event: "result",
          cmd: "commit",
          ...service.commitToPurchase(command.actor as string, command.input as never),
        });
        return true;
      case "order":
        emit({
          event: "result",
          cmd: "order",
          ...service.advancePurchaseOrder(command.actor as string, command.input as never),
        });
        return true;
      case "view":
        emit({
          event: "view",
          principal: command.principal,
          view: service.getCustomerView(command.principal as string),
        });
        return true;
      case "durability":
        emit({ event: "stats", stats: service.durability() });
        return true;
      case "listen": {
        void endpoint
          .listen(0, "127.0.0.1")
          .then((bound) => {
            writeLine({ event: "listening", port: bound.port });
          })
          .catch((error: unknown) => {
            emitError(error instanceof Error ? error.message : String(error));
          });
        return true;
      }
      case "send": {
        const host = command.host;
        const port = command.port;
        if (typeof host !== "string" || typeof port !== "number") {
          emitError("send requires host (string) and port (number)");
          return true;
        }
        void endpoint
          .send(command.envelope as Envelope, {
            host,
            port,
            maxRetries: typeof command.maxRetries === "number" ? command.maxRetries : 8,
            retryDelayMs: 25,
          })
          .then((report) => {
            writeLine({
              event: "outbox-report",
              report: report as unknown as Record<string, unknown>,
            });
          })
          .catch((error: unknown) => {
            emitError(error instanceof Error ? error.message : String(error));
          });
        return true;
      }
      case "coord-stats":
        writeLine({ event: "coord-stats", stats: endpoint.stats() });
        return true;
      default:
        emitError(`unknown or missing cmd: ${String(command.cmd)}`);
        return true;
    }
  } catch (error) {
    emitError(error instanceof Error ? error.message : String(error));
    return true;
  }
}

function emit(event: Record<string, unknown>): void {
  writeLine(event);
}

function emitError(message: string): void {
  writeLine({ event: "error", reason: message });
}

emit({ event: "ready", pid: process.pid, instance: config.instance, state: config.state });

const readline = createInterface({ input: process.stdin });
readline.on("line", (line: string) => {
  if (line.trim() === "") {
    return;
  }
  const keepRunning = handle(line);
  if (!keepRunning) {
    endpoint.dispose();
    readline.close();
    setImmediate(() => {
      process.exit(0);
    });
  }
});
readline.on("close", () => {
  endpoint.dispose();
  process.exit(0);
});
process.on("uncaughtException", (error: Error) => {
  emitError(`uncaught: ${error.message}`);
});
