#!/usr/bin/env node
// Self-contained test runner for scripts/check-project-spec.mjs (work order P0-W2).
//
// Verifies, in this order:
//   1. the real checker passes against the REAL repository root (both with
//      the default root and with an explicit --root from a foreign cwd);
//   2. the checker's --root defaults to process.cwd() (running it inside a
//      fixture tree without --root checks that fixture tree, not the repo);
//   3. every negative fixture tree under scripts/spec-check-fixtures/ fails
//      with the expected message, and with exactly one error line (proving
//      each fixture is otherwise a valid minimal skeleton);
//   4. a bogus --root path fails cleanly (error listing, no crash);
//   5. an empty --root value is rejected as a usage error.
//
// Prints a per-case PASS/FAIL table and exits 0 only if every case behaves
// as expected. Dependency-free: node: builtins only, Node >= 18.
//
// Usage: node scripts/test-check-project-spec.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const checkerPath = resolve(scriptDir, "check-project-spec.mjs");
const fixturesDir = resolve(scriptDir, "spec-check-fixtures");

// A directory that is guaranteed to exist but is not a repository checkout,
// used to prove --root works independently of the process cwd.
const foreignCwd = tmpdir();
// A path that is guaranteed not to exist.
const bogusRoot = resolve(mkdtempSync(join(tmpdir(), "adcos-spec-check-")), "does-not-exist");

function runChecker(args, cwd) {
  const result = spawnSync(process.execPath, [checkerPath, ...args], {
    cwd: cwd ?? repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    spawnError: result.error ? String(result.error) : "",
  };
}

function countErrorLines(stderr) {
  return stderr
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.trim())
    .filter((line) => line.length > 2).length;
}

const cases = [
  {
    name: "real repo, no --root (default root = cwd)",
    args: [],
    cwd: repoRoot,
    expect: { status: 0, stdoutIncludes: "project-spec check PASSED" },
  },
  {
    name: "real repo, explicit --root from foreign cwd",
    args: ["--root", repoRoot],
    cwd: foreignCwd,
    expect: { status: 0, stdoutIncludes: "project-spec check PASSED" },
  },
  {
    name: "default root is process.cwd(), not the checker location",
    args: [],
    cwd: resolve(fixturesDir, "missing-spec"),
    expect: {
      status: 1,
      stderrIncludes: "Missing required source-of-truth file: spec/dependency-graph.md",
    },
  },
  {
    name: "fixture missing-spec: required file removed",
    args: ["--root", resolve(fixturesDir, "missing-spec")],
    expect: {
      status: 1,
      stderrIncludes: "Missing required source-of-truth file: spec/dependency-graph.md",
      errorLines: 1,
    },
  },
  {
    name: "fixture invalid-json: malformed current-state.json",
    args: ["--root=" + resolve(fixturesDir, "invalid-json")],
    expect: { status: 1, stderrIncludes: "Cannot parse current-state JSON", errorLines: 1 },
  },
  {
    name: "fixture unknown-frontier: frontier references undefined P9-W9",
    args: ["--root", resolve(fixturesDir, "unknown-frontier")],
    expect: {
      status: 1,
      stderrIncludes: "frontier work order is not defined in spec/work-orders.md: P9-W9",
      errorLines: 1,
    },
  },
  {
    name: "fixture duplicate-work-order: ## P0-W2 heading twice",
    args: ["--root", resolve(fixturesDir, "duplicate-work-order")],
    expect: {
      status: 1,
      stderrIncludes: "duplicate work-order ID in spec/work-orders.md: P0-W2",
      errorLines: 1,
    },
  },
  {
    name: "bogus --root path fails cleanly",
    args: ["--root", bogusRoot],
    expect: {
      status: 1,
      stderrIncludes: "Missing required source-of-truth file",
      stderrStartsWith: "ADCOS 2.0 project-spec check FAILED",
      stdoutNotIncludes: "PASSED",
    },
  },
  {
    name: "empty --root value is a usage error",
    args: ["--root"],
    expect: { status: 2, stderrIncludes: "--root requires a non-empty path argument" },
  },
];

function evaluateCase(run, expect) {
  const failures = [];
  if (run.spawnError) failures.push("spawn error: " + run.spawnError);
  if (expect.status === "nonzero") {
    if (!(typeof run.status === "number" && run.status !== 0))
      failures.push("expected a non-zero exit, got: " + run.status);
  } else if (run.status !== expect.status) {
    failures.push("expected exit " + expect.status + ", got: " + run.status);
  }
  if (expect.stdoutIncludes && !run.stdout.includes(expect.stdoutIncludes)) {
    failures.push("stdout should include: " + JSON.stringify(expect.stdoutIncludes));
  }
  if (expect.stdoutNotIncludes && run.stdout.includes(expect.stdoutNotIncludes)) {
    failures.push("stdout should not include: " + JSON.stringify(expect.stdoutNotIncludes));
  }
  if (expect.stderrIncludes && !run.stderr.includes(expect.stderrIncludes)) {
    failures.push("stderr should include: " + JSON.stringify(expect.stderrIncludes));
  }
  if (expect.stderrStartsWith && !run.stderr.startsWith(expect.stderrStartsWith)) {
    failures.push("stderr should start with: " + JSON.stringify(expect.stderrStartsWith));
  }
  if (expect.errorLines !== undefined && countErrorLines(run.stderr) !== expect.errorLines) {
    failures.push(
      "expected " + expect.errorLines + " error line(s), got: " + countErrorLines(run.stderr),
    );
  }
  return failures;
}

const results = [];
for (const testCase of cases) {
  const run = runChecker(testCase.args, testCase.cwd);
  const failures = evaluateCase(run, testCase.expect);
  results.push({ name: testCase.name, run, failures });
}

process.stdout.write("== ADCOS 2.0 project-spec checker test runner ==\n");
process.stdout.write("checker : scripts/check-project-spec.mjs\n");
process.stdout.write("repo    : " + repoRoot + "\n\n");

const width = Math.max(...cases.map((testCase) => testCase.name.length));
for (const [index, result] of results.entries()) {
  const label = (result.name + " ".repeat(width)).slice(0, width);
  const status = result.failures.length === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    "[" +
      status +
      "] " +
      (index + 1) +
      "/" +
      results.length +
      " " +
      label +
      " exit=" +
      result.run.status +
      "\n",
  );
  for (const failure of result.failures) {
    process.stdout.write("        " + failure + "\n");
  }
  if (result.failures.length > 0) {
    const stdout = result.run.stdout.trim();
    const stderr = result.run.stderr.trim();
    if (stdout)
      process.stdout.write(
        "        --- stdout ---\n" +
          stdout
            .split("\n")
            .map((line) => "        " + line)
            .join("\n") +
          "\n",
      );
    if (stderr)
      process.stdout.write(
        "        --- stderr ---\n" +
          stderr
            .split("\n")
            .map((line) => "        " + line)
            .join("\n") +
          "\n",
      );
  }
}

const failed = results.filter((result) => result.failures.length > 0).length;
process.stdout.write("\n" + (results.length - failed) + "/" + results.length + " cases PASSED\n");
if (failed > 0) {
  process.exitCode = 1;
}
