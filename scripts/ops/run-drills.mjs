#!/usr/bin/env node
/**
 * run-drills.mjs — P5-W1: run every drill under ops/drills/ that has an
 * executable counterpart, aggregate verdicts, exit non-zero on any fail.
 *
 * Currently registered:
 *   - restore-drill  (scripts/ops/restore-drill.mjs) — runbook ops/drills/restore-drill.md
 *
 * Usage: node scripts/ops/run-drills.mjs
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const DRILLS = [
  { name: "restore-drill", script: join(root, "scripts", "ops", "restore-drill.mjs"), runbook: "ops/drills/restore-drill.md" },
];

const results = [];
let failed = 0;
for (const drill of DRILLS) {
  process.stdout.write(`[run-drills] ${drill.name}: running…\n`);
  const proc = spawnSync(
    process.execPath,
    ["--import", "tsx", drill.script],
    { cwd: root, encoding: "utf-8", timeout: 120_000 }
  );
  const pass = proc.status === 0;
  if (!pass) failed += 1;
  results.push({
    drill: drill.name,
    runbook: drill.runbook,
    verdict: pass ? "PASS" : "FAIL",
    exitCode: proc.status,
    tail: (proc.stdout + proc.stderr).trim().split("\n").slice(-3).join("\n"),
  });
}

const line = {
  drills: results,
  verdict: failed === 0 ? "PASS" : "FAIL",
  failed,
  generatedAt: new Date().toISOString(),
};
console.log(JSON.stringify(line, null, 2));
process.exit(failed === 0 ? 0 : 1);
