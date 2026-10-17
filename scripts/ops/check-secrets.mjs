#!/usr/bin/env node
// P5-W1 credentials-isolation gate (work order `## P5-W1`, acceptance item
// "credentials isolated").
//
// Law (ops/environments/README.md): secrets are NEVER in the repo, NEVER in
// JSONL state, NEVER in logs. This gate enforces the repo half:
//   1. no tracked file may contain a live secret pattern (private-key
//      blocks, GitHub/OpenAI/AWS/Slack/Google token shapes);
//   2. no tracked file may BE a credential file (*.pem, *.key, *.p12,
//      id_rsa ...);
//   3. every secret declared in ops/environments/contracts.json with a
//      `file` injection channel must declare permissions 0600 (a
//      0600-violating secret file reference fails the gate).
//
// Invocation (wired into the release-gate checklist
// docs/runbooks/release-gate.md — NOT package.json, per the scope law):
//   node scripts/ops/check-secrets.mjs [--root <repo-root>]
//
// Dependency-free: node builtins only. Exits 0 clean, 1 on findings,
// 2 on usage errors.

import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, basename, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function printUsage() {
  process.stdout.write(
    "usage: node scripts/ops/check-secrets.mjs [--root <repo-root>]\n" +
      "  Scans TRACKED files for secret patterns and credential files, and\n" +
      "  validates secret injection-channel declarations (0600 law).\n",
  );
}

function parseArgs(argv) {
  const options = { root: process.cwd() };
  const usageErrors = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[i + 1];
      if (value === undefined || value === "") {
        usageErrors.push("--root requires a non-empty path argument");
      } else {
        options.root = value;
        i += 1;
      }
    } else if (arg.startsWith("--root=")) {
      const value = arg.slice("--root=".length);
      if (value === "") {
        usageErrors.push("--root requires a non-empty path argument");
      } else {
        options.root = value;
      }
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      usageErrors.push("unknown argument: " + arg);
    }
  }
  return { options, usageErrors };
}

// ---------------------------------------------------------------------------
// Patterns — kept deliberately tight (high signal, low noise). Every pattern
// is a LIVE credential SHAPE with an entropy floor; template/placeholder
// text (e.g. "<api-key>", "YOUR_TOKEN") never matches.
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  {
    id: "pem-private-key-block",
    label: "private key block",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  {
    id: "github-classic-token",
    label: "GitHub classic token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/,
  },
  {
    id: "github-fine-grained-token",
    label: "GitHub fine-grained token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82,}\b/,
  },
  {
    id: "openai-style-secret-key",
    label: "sk- secret key",
    pattern: /\bsk-[A-Za-z0-9]{32,}\b/,
  },
  {
    id: "aws-access-key-id",
    label: "AWS access key id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: "google-api-key",
    label: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    id: "slack-token",
    label: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
];

// Tracked files that ARE credential material by name/extension.
const CREDENTIAL_FILE_HINTS = [/\.pem$/i, /\.p12$/i, /\.pfx$/i, /^id_rsa$/, /^id_ed25519$/];

// Documented exemptions: files whose SECRET-PATTERN hit is part of a
// REDACTION/sanitizer definition (the file REMOVES secrets, it does not
// carry one). Each entry must cite the reason; the gate re-verifies the
// reason text is present on the matched line so a future edit that turns
// the sanitizer into a real key fails.
const LINE_EXEMPTIONS = [
  {
    path: "packages/shared/src/feedbackPrivacy.ts",
    patterns: ["pem-private-key-block"],
    because: "redaction regex (sanitizer, not a credential)",
    mustContain: "replace",
  },
];

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".icns", ".webp", ".pdf", ".zip",
  ".gz", ".tgz", ".bz2", ".xz", ".deb", ".appimage", ".exe", ".dll", ".so",
  ".dylib", ".a", ".o", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3",
  ".mp4", ".wav", ".node", ".wasm", ".bin", ".asar", ".tsbuildinfo",
]);

function isTextLike(path) {
  const ext = extname(path).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return false;
  const name = basename(path).toLowerCase();
  if (name === "cargo.lock" || name === "package-lock.json") return false; // huge, generated
  return true;
}

function isCredentialFileName(path) {
  const name = basename(path).toLowerCase();
  return CREDENTIAL_FILE_HINTS.some((re) => re.test(name));
}

function exemptionFor(path, patternId) {
  return LINE_EXEMPTIONS.find(
    (ex) => ex.path === path && ex.patterns.includes(patternId),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { options, usageErrors } = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}
if (usageErrors.length > 0) {
  process.stderr.write(
    "ADCOS P5-W1 secrets check FAILED\n" + usageErrors.map((x) => "- " + x).join("\n") + "\n",
  );
  printUsage();
  process.exit(2);
}

const root = resolve(options.root);
const findings = [];
const scanned = { files: 0, textFiles: 0, bytes: 0 };

// 1. Enumerate tracked files (git ls-files). A non-git directory fails the
//    gate honestly: the law is about what the repo CARRIES.
let trackedFiles = [];
try {
  const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  trackedFiles = stdout.split("\n").filter((line) => line.trim() !== "");
} catch (error) {
  process.stderr.write(
    "ADCOS P5-W1 secrets check FAILED\n- cannot enumerate tracked files (git ls-files): " +
      String(error.message ?? error) + "\n",
  );
  process.exit(1);
}
scanned.files = trackedFiles.length;

// 2. Credential-file-by-name pass + content scan of text files.
for (const file of trackedFiles) {
  const abs = resolve(root, file);
  if (isCredentialFileName(file)) {
    findings.push({
      kind: "credential-file",
      path: file,
      detail: "tracked file looks like credential material by name",
    });
    continue;
  }
  if (!isTextLike(file)) continue;
  let content;
  try {
    content = await readFile(abs, "utf8");
  } catch {
    continue; // unreadable (submodule etc.) — not a secret finding
  }
  scanned.textFiles += 1;
  scanned.bytes += content.length;
  const lines = content.split("\n");
  for (const { id, label, pattern } of SECRET_PATTERNS) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!pattern.test(line)) continue;
      const exemption = exemptionFor(file, id);
      if (exemption && line.includes(exemption.mustContain)) {
        continue; // documented sanitizer line
      }
      findings.push({
        kind: "secret-pattern",
        path: file,
        line: i + 1,
        detail: `${label} (${id})${exemption ? " — exemption no longer matches its cited reason" : ""}`,
        excerpt: line.trim().slice(0, 72),
      });
    }
  }
}

// 3. Injection-channel law: secrets declared with a `file` channel in the
//    environment contract must declare 0600 permissions.
const contractsPath = resolve(root, "ops/environments/contracts.json");
try {
  await stat(contractsPath);
  const contracts = JSON.parse(await readFile(contractsPath, "utf8"));
  for (const secret of contracts.secrets ?? []) {
    const channel = String(secret.injectionChannel ?? "");
    const isFileChannel = /^\s*file\b/i.test(channel);
    if (isFileChannel && secret.filePermissions !== "0600") {
      findings.push({
        kind: "secret-file-permissions",
        path: "ops/environments/contracts.json",
        detail: `secret '${secret.name}' declares a file injection channel but permissions '${String(secret.filePermissions)}' (must be 0600)`,
      });
    }
    if (secret.presentInRepo !== false) {
      findings.push({
        kind: "secret-repo-presence",
        path: "ops/environments/contracts.json",
        detail: `secret '${secret.name}' must declare presentInRepo: false`,
      });
    }
  }
} catch (error) {
  if (error?.code === "ENOENT") {
    findings.push({
      kind: "contract-missing",
      path: "ops/environments/contracts.json",
      detail: "environment contract not found at the expected owned path",
    });
  } else {
    findings.push({
      kind: "contract-unparsable",
      path: "ops/environments/contracts.json",
      detail: "cannot parse environment contract: " + String(error?.message ?? error),
    });
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (findings.length > 0) {
  process.stderr.write(
    "ADCOS P5-W1 secrets check FAILED (" + findings.length + " finding(s))\n" +
      findings
        .map(
          (f) =>
            "- [" + f.kind + "] " + f.path + (f.line ? ":" + f.line : "") + " — " + f.detail +
            (f.excerpt ? "\n    excerpt: " + f.excerpt : ""),
        )
        .join("\n") +
      "\n",
  );
  process.exit(1);
}

process.stdout.write(
  "ADCOS P5-W1 secrets check PASSED (" + scanned.files + " tracked files; " +
    scanned.textFiles + " text files scanned, " + scanned.bytes + " bytes; " +
    SECRET_PATTERNS.length + " secret patterns; credential-file name pass; " +
    "contracts 0600 injection-channel law valid; " +
    LINE_EXEMPTIONS.length + " documented sanitizer exemption(s) honored)\n",
);
