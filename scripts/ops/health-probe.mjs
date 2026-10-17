#!/usr/bin/env node
/**
 * health-probe.mjs — P5-W1 Task P5W1-3: executable health check for the
 * ADCOS control-plane state (health contracts: ops/monitoring/health-contracts.md).
 *
 * Checks (all read-only — the probe NEVER issues a domain command, so it
 * never appends to the log):
 *   1. state file exists
 *   2. every line parses as JSON (JSONL law)
 *   3. last line is well-formed (torn-tail detection)
 *   4. the REAL service rehydrates over it (public contract, replay-on-load)
 *      and a customer view read returns
 *   5. durability stats readable (write-before-ack store stats)
 *
 * Verdict: HEALTHY | DEGRADED (torn tail / trailing junk: file usable but
 * restore recommended) | UNKNOWN (cannot determine) | DOWN (unusable).
 *
 * Usage:
 *   node --import tsx scripts/ops/health-probe.mjs --state <path-to.jsonl> [--principal ada@local]
 *   node --import tsx scripts/ops/health-probe.mjs --fixture   (drill-style fixture, self-contained demo)
 * Exit 0 = HEALTHY/DEGRADED (actionable verdicts), 1 = DOWN, 2 = usage error.
 */
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSurfacesService } from "../../packages/surfaces/src/contract.ts";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const statePath = flag("--state");
const fixture = args.includes("--fixture");
const principal = flag("--principal") ?? "ada@local";

function seedFixture() {
  const dir = mkdtempSync(join(tmpdir(), "adcos-probe-"));
  const p = join(dir, "adcos-state.jsonl");
  const s = createSurfacesService({ statePath: p, now: () => 1_800_000_000_000, operatorPrincipals: ["ops@local"], developerPrincipals: ["dev@local"] });
  s.enrollResource("ada@local", {
    id: "res-probe-1", device: "device-probe", type: "phone",
    capability: "tether/4g", modes: ["hotspot"], limits: { concurrent: 1 },
  });
  return { dir, path: p };
}

const target = fixture ? seedFixture() : { dir: null, path: statePath };
if (!target.path) {
  console.error("usage: health-probe.mjs --state <path> | --fixture");
  process.exit(2);
}

const report = { probe: "health-probe", workOrder: "P5-W1", statePath: target.path, checks: {} };

// 1. exists
if (!existsSync(target.path)) {
  report.verdict = "UNKNOWN";
  report.checks.fileExists = false;
  report.note = "state file absent — if this is a fresh install this is UNKNOWN (no state yet); if state was expected, alert A2 (ops/monitoring/alerts.md)";
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
report.checks.fileExists = true;

// 2+3. JSONL parse + torn tail
const raw = readFileSync(target.path, "utf-8");
const lines = raw.split("\n");
if (lines.at(-1) === "") lines.pop();
let badLines = 0;
const parsed = [];
for (const line of lines) {
  if (line.trim() === "") { badLines += 1; continue; }
  try { parsed.push(JSON.parse(line)); } catch { badLines += 1; }
}
report.checks.lines = lines.length;
report.checks.badLines = badLines;
report.checks.lastLineWellFormed = badLines === 0;

// 4+5. rehydrate over the real service (read-only: no commands issued)
try {
  const service = createSurfacesService({
    statePath: target.path,
    now: () => Date.now(),
    operatorPrincipals: ["ops@local"],
    developerPrincipals: ["dev@local"],
  });
  const view = service.getCustomerView(principal);
  const durability = service.durability();
  report.checks.rehydrates = true;
  report.checks.viewRead = { principal: view.principal, resources: view.resources.length, organizations: view.organizations.length, groupPurchases: view.groupPurchases.length };
  report.checks.durability = durability;
} catch (error) {
  report.checks.rehydrates = false;
  report.checks.rehydrateError = String(error?.message ?? error).slice(0, 200);
}

report.verdict =
  report.checks.rehydrates && badLines === 0
    ? "HEALTHY"
    : report.checks.rehydrates
      ? "DEGRADED"
      : "DOWN";
if (report.verdict === "DEGRADED") {
  report.note = `usable but ${badLines} unparseable line(s) — restore from snapshot recommended (ops/drills/restore-drill.md)`;
}

console.log(JSON.stringify(report, null, 2));
if (target.dir) rmSync(target.dir, { recursive: true, force: true });
process.exit(report.verdict === "DOWN" ? 1 : 0);
