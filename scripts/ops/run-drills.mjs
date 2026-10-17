#!/usr/bin/env node
// P5-W1 drill convenience wrapper (work order `## P5-W1`): runs every drill
// defined under ops/drills/ that has an executable runner, and exits
// non-zero on any verdict fail.
//
// Today: the restore drill (scripts/ops/restore-drill.mjs — runbook
// ops/drills/restore-drill.md). rollback.md is doctrine (no executable).
// Future drills: add a runner here + a runbook under ops/drills/.
//
// Usage: node scripts/ops/run-drills.mjs [--root <repo-root>]
//
// The drill itself needs the tsx loader (TS public contracts), so this
// wrapper spawns: node --import tsx <drill> — matching the documented
// invocation in ops/drills/restore-drill.md exactly.

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const options = { root: REPO_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") {
      options.root = argv[i + 1];
      if (!options.root) throw new Error("--root requires a path");
      i += 1;
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const root = resolve(options.root);

// Drills with executable runners (name -> script path relative to root).
const DRILLS = [
  { name: "restore-drill", script: "scripts/ops/restore-drill.mjs", runbook: "ops/drills/restore-drill.md" },
];

const results = [];

for (const drill of DRILLS) {
  const scriptPath = resolve(root, drill.script);
  try {
    await access(scriptPath);
  } catch {
    results.push({ ...drill, status: "MISSING", code: 1 });
    continue;
  }
  process.stdout.write(`[run-drills] ${drill.name}: node --import tsx ${drill.script}\n`);
  const code = await new Promise((resolveExit) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", scriptPath],
      { cwd: root, stdio: "inherit" },
    );
    child.on("exit", (exitCode) => resolveExit(exitCode ?? 1));
    child.on("error", () => resolveExit(1));
  });
  results.push({ ...drill, status: code === 0 ? "PASS" : "FAIL", code });
  process.stdout.write(`[run-drills] ${drill.name}: ${code === 0 ? "PASS" : "FAIL"} (exit ${code})\n`);
}

const failed = results.filter((r) => r.code !== 0);
process.stdout.write(
  "[run-drills] " +
    (failed.length === 0
      ? `all ${results.length} drill(s) passed`
      : `${failed.length}/${results.length} drill(s) FAILED: ${failed.map((f) => f.name).join(", ")}`) +
    "\n",
);
process.exitCode = failed.length === 0 ? 0 : 1;
