#!/usr/bin/env node
/**
 * check-secrets.mjs — P5-W1 credentials-isolation gate.
 *
 * Law (ops/environments/README.md #3): secrets never enter the tracked
 * tree. This scanner fails the release gate when a secret literal or an
 * unsafe secret-file reference appears in tracked files.
 *
 * Usage: node scripts/ops/check-secrets.mjs [--root <repo>]
 * Exit 0 = clean; exit 1 = violations (printed); exit 2 = usage error.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv.includes("--root")
  ? process.argv[process.argv.indexOf("--root") + 1]
  : join(import.meta.dirname, "..", "..");

const MAX_BYTES = 2_000_000; // skip monsters (lockfiles, fixtures by size)

/** Secret literal patterns — the classes this repo's lifecycle can produce. */
const LITERAL_PATTERNS = [
  { re: /ghp_[A-Za-z0-9]{36,}/, label: "GitHub PAT (ghp_)" },
  { re: /github_pat_[A-Za-z0-9_]{22,}/, label: "GitHub fine-grained PAT" },
  { re: /gho_[A-Za-z0-9]{36,}/, label: "GitHub OAuth token (gho_)" },
  { re: /ghs_[A-Za-z0-9]{36,}/, label: "GitHub server token (ghs_)" },
  { re: /sk-[A-Za-z0-9]{20,}/, label: "OpenAI-style API key (sk-)" },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/, label: "Slack token" },
  { re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, label: "private key block" },
  { re: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/, label: "Bearer credential literal" },
];

/** 0600-law tripwire: tracked files must not claim to hold live secrets. */
const REFERENCE_PATTERNS = [
  { re: /\.env\.secret|secrets\.(json|env)|\.pem|\.p12|id_rsa/, label: "secret-file reference in tracked tree" },
];

function trackedFiles() {
  const out = execFileSync(
    process.platform === "win32" ? "git.exe" : "git",
    ["ls-files"],
    { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
  );
  return out.split("\n").filter(Boolean);
}

function check() {
  const files = trackedFiles();
  const violations = [];
  for (const rel of files) {
    const abs = join(root, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue; // raced away (submodule etc.)
    }
    if (!st.isFile() || st.size > MAX_BYTES) continue;
    let text;
    try {
      text = readFileSync(abs, "utf-8");
    } catch {
      continue;
    }
    for (const { re, label } of LITERAL_PATTERNS) {
      const m = text.match(re);
      if (m) {
        violations.push(`${rel}: ${label} literal (${m[0].slice(0, 12)}…)`);
      }
    }
    for (const { re, label } of REFERENCE_PATTERNS) {
      if (re.test(rel)) {
        violations.push(`${rel}: ${label}`);
      }
    }
  }
  return violations;
}

const violations = check();
if (violations.length === 0) {
  console.log("check-secrets: CLEAN (no secret literals, no secret-file references in tracked files)");
  process.exit(0);
}
console.error(`check-secrets: ${violations.length} violation(s):`);
for (const v of violations) console.error(`  - ${v}`);
console.error("Fix: remove the secret from the tracked tree; source it from an env var / keyring / 0600 file outside the repo.");
process.exit(1);
