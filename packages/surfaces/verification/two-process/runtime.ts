// ============================================================================
// Two-process verification runtime (P2-W1 round 2 acceptance core).
//
// One ADCOS surfaces service per OS process, each restoring its state from
// the SAME on-disk JSONL state log (the adapters-layer durable store). The
// test process drives each runtime over stdin (JSONL commands) and observes
// stdout (JSONL events) — the control plane is strictly separate from the
// durable state log, mirroring the landed coordination two-process pattern
// (packages/coordination/verification/two-process/runtime.ts).
//
// usage: node --import tsx runtime.ts --state <state-file>
//               [--operators prin-a,prin-b] [--developers prin-d]
//
// stdin commands (one JSON object per line):
//   {"cmd":"enroll","actor":"...","resource":{...}}      -> result
//   {"cmd":"consent","actor":"...","resourceId":"...","event":"OPT_IN"}
//   {"cmd":"observe","actor":"...","resourceId":"...","input":{...}}
//   {"cmd":"lab","input":{...}}                          -> result
//   {"cmd":"form","actor":"...","input":{...}}           -> result
//   {"cmd":"invite","actor":"...","input":{...}}         -> result
//   {"cmd":"accept","actor":"...","input":{...}}         -> result (ACCEPT_INVITE)
//   {"cmd":"open","actor":"...","input":{...}}           -> result
//   {"cmd":"offer","actor":"...","offer":{...}}          -> result
//   {"cmd":"commit","actor":"...","input":{...}}         -> result
//   {"cmd":"order","actor":"...","input":{...}}          -> result
//   {"cmd":"view","principal":"..."}                     -> view
//   {"cmd":"operator-view","principal":"..."}            -> view
//   {"cmd":"durability"}                                 -> stats
//   {"cmd":"shutdown"}                                   -> clean exit 0
//
// stdout events: {"event":"ready"}, {"event":"result",...},
// {"event":"view",...}, {"event":"stats",...}, {"event":"error",...}.
// Unknown or malformed input -> {"event":"error"} (fail-closed, no crash).
// ============================================================================

import { createInterface } from "node:readline";
import { createSurfacesService } from "../../src/contract.js";
import type { SurfacesService } from "../../src/contract.js";

interface RuntimeConfig {
  state: string;
  operators: string[];
  developers: string[];
}

function parseArguments(argv: string[]): RuntimeConfig {
  const config: RuntimeConfig = { state: "", operators: [], developers: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--state") {
      config.state = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--operators") {
      config.operators = (argv[i + 1] ?? "").split(",").filter((x) => x !== "");
      i += 1;
    } else if (arg === "--developers") {
      config.developers = (argv[i + 1] ?? "").split(",").filter((x) => x !== "");
      i += 1;
    }
  }
  if (config.state === "") {
    process.stderr.write(
      "usage: runtime.ts --state <state-file> [--operators a,b] [--developers c]\n",
    );
    process.exit(2);
  }
  return config;
}

const config = parseArguments(process.argv.slice(2));

// A real process reads the REAL clock — determinism belongs to the in-process
// tests; this runtime proves real restart durability.
const service: SurfacesService = createSurfacesService({
  statePath: config.state,
  now: () => Date.now(),
  operatorPrincipals: config.operators,
  developerPrincipals: config.developers,
});

function emit(event: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
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
    emit({ event: "error", reason: "malformed JSON input line" });
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
      case "invite":
        emit({
          event: "result",
          cmd: "invite",
          ...service.inviteMember(command.actor as string, command.input as never),
        });
        return true;
      case "accept":
        emit({
          event: "result",
          cmd: "accept",
          ...service.applyMembershipEvent(
            command.actor as string,
            {
              ...(command.input as object),
              event: "ACCEPT_INVITE",
            } as never,
          ),
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
      case "operator-view": {
        const result = service.getOperatorView(command.principal as string);
        emit({
          event: "view",
          principal: command.principal,
          applied: result.applied,
          reason: result.reason,
          view: result.view,
        });
        return true;
      }
      case "durability":
        emit({ event: "stats", stats: service.durability() });
        return true;
      default:
        emit({ event: "error", reason: `unknown or missing cmd: ${String(command.cmd)}` });
        return true;
    }
  } catch (error) {
    emit({
      event: "error",
      reason: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

emit({ event: "ready", pid: process.pid, state: config.state });

const readline = createInterface({ input: process.stdin });
readline.on("line", (line) => {
  if (line.trim() === "") {
    return;
  }
  const keepRunning = handle(line);
  if (!keepRunning) {
    readline.close();
    process.exit(0);
  }
});
readline.on("close", () => {
  process.exit(0);
});
