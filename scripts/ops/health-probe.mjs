#!/usr/bin/env node
// P5-W1 health prober (work order `## P5-W1`, monitoring contract
// ops/monitoring/health-contracts.md).
//
// Probes a shipped surface for operational health and emits a
// machine-readable verdict:
//
//   node --import tsx scripts/ops/health-probe.mjs --state <path-to-jsonl>
//   node --import tsx scripts/ops/health-probe.mjs --desktop <profileDir>
//   node --import tsx scripts/ops/health-probe.mjs --release-channel [tag]
//
// Verdicts (INVARIANTS #5 discipline — states stay distinct, never masked):
//   HEALTHY   — target present, parses, last line well-formed, the REAL
//               service rehydrates over it (fold stats match the scan);
//   FRESH     — state file absent: no command has ever been applied (a
//               legitimate first-run condition, NOT an error);
//   DEGRADED  — parses but torn/corrupt tail lines were detected and
//               skipped (the fold still works; the tail is reported,
//               never trusted);
//   UNHEALTHY — the target cannot be read or folds to nothing usable.
//
// Exit codes: 0 = HEALTHY/FRESH, 2 = DEGRADED, 1 = UNHEALTHY, 64 = usage.
//
// Read-only guarantee: the line-level scan reads the target file directly;
// the rehydration check constructs the REAL createSurfacesService over a
// TEMP COPY of the log (constructor fold), so the probe never writes to
// the probed location. No commands are issued — role fail-closed queries
// only.
//
// Honest scope: a static probe cannot prove the Electron main process is
// up RIGHT NOW; live liveness signals are defined in
// ops/monitoring/health-contracts.md (window present, panels render,
// bridge responsive). This probe is the state-file + release-channel leg
// of that contract.

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const USAGE = `usage: node --import tsx scripts/ops/health-probe.mjs --state <path>
       node --import tsx scripts/ops/health-probe.mjs --desktop <profileDir>
       node --import tsx scripts/ops/health-probe.mjs --release-channel [tag]`;

function parseArgs(argv) {
  const options = { state: null, desktop: null, releaseChannel: null, tag: "adcos-desktop-v1.0.0" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--state") {
      options.state = argv[++i];
      if (!options.state) throw new Error("--state requires a path");
    } else if (arg === "--desktop") {
      options.desktop = argv[++i];
      if (!options.desktop) throw new Error("--desktop requires a path");
    } else if (arg === "--release-channel") {
      options.releaseChannel = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        options.tag = argv[++i];
      }
    } else {
      throw new Error(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  const modes = [options.state, options.desktop, options.releaseChannel].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error(`exactly one probe mode required (--state | --desktop | --release-channel)\n${USAGE}`);
  }
  return options;
}

// Load the REAL surfaces public contract (public entrypoint; tsx loader).
const surfacesContractUrl = pathToFileURL(join(REPO_ROOT, "packages", "surfaces", "src", "contract.ts")).href;
const { createSurfacesService } = await import(surfacesContractUrl);

const report = {
  probe: "p5w1 health-probe",
  at: new Date().toISOString(),
  target: null,
  checks: [],
  stats: null,
  verdict: null,
};
const failures = [];
const degradations = [];

function check(name, ok, detail) {
  report.checks.push({ name, ok: ok === true, ...detail });
  if (ok !== true) failures.push({ name, detail: detail ?? {} });
  process.stdout.write(
    `[health-probe]   ${name}: ${ok === true ? "ok" : "FAIL"}${detail ? " — " + JSON.stringify(detail) : ""}\n`,
  );
}

function degrade(name, detail) {
  degradations.push({ name, detail });
  report.checks.push({ name, ok: true, degraded: true, ...detail });
  process.stdout.write(`[health-probe]   ${name}: DEGRADED — ${JSON.stringify(detail ?? {})}\n`);
}

/** Probe one JSONL state file (the surfaces durable store contract). */
function probeStateFile(path) {
  report.target = { kind: "state", path: resolve(path) };

  if (!existsSync(path)) {
    report.verdict = "FRESH";
    report.checks.push({ name: "state file exists", ok: true, fresh: true, note: "no command applied yet — legitimate first-run state" });
    process.stdout.write("[health-probe]   state file exists: FRESH (no command applied yet)\n");
    return;
  }

  const st = statSync(path);
  check("state file exists and is a regular file", st.isFile(), { bytes: st.size });

  let raw;
  try {
    raw = readFileSync(path, "utf8");
    check("state file readable as UTF-8", true, { bytes: raw.length });
  } catch (error) {
    check("state file readable as UTF-8", false, { error: String(error?.message ?? error) });
    report.verdict = "UNHEALTHY";
    return;
  }

  const lines = raw.split("\n");
  let valid = 0;
  let torn = 0;
  let lastNonEmpty = null;
  for (const line of lines) {
    if (line === "") continue;
    lastNonEmpty = line;
    try {
      const parsed = JSON.parse(line);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        ["consents", "resources", "observations", "memberships", "mandates", "requests", "offers", "commitments", "opportunities", "orders"].every((k) =>
          Array.isArray(parsed[k]),
        )
      ) {
        valid += 1;
      } else {
        torn += 1; // parseable but not shaped like a surface state — corrupt, not trusted
      }
    } catch {
      torn += 1;
    }
  }
  report.stats = { lines: valid + torn, validSnapshots: valid, tornLines: torn, bytes: st.size };

  check("JSONL scan: every line parses or is counted torn", valid + torn === report.stats.lines, {
    validSnapshots: valid,
    tornLines: torn,
  });
  if (torn > 0) {
    degrade("torn/corrupt lines detected (reported, not trusted)", { tornLines: torn });
  }

  if (lastNonEmpty !== null) {
    let lastOk = false;
    try {
      JSON.parse(lastNonEmpty);
      lastOk = true;
    } catch {
      lastOk = false;
    }
    if (lastOk) {
      check("last non-empty line is well-formed JSON", true, { length: lastNonEmpty.length });
    } else if (torn > 0) {
      // The torn tail IS the last line: already counted and skipped by the
      // scan (and by the store's fold — drill-proven). DEGRADED, not
      // UNHEALTHY: the service keeps working off the last intact snapshot.
      degrade("last line is the torn tail (skipped by the fold; self-heals)", {
        length: lastNonEmpty.length,
        tornLines: torn,
      });
    } else {
      check("last non-empty line is well-formed JSON", false, { length: lastNonEmpty.length });
    }
  } else {
    // File exists but has no lines at all: an empty file folds to empty
    // state — treat as FRESH-equivalent (degenerate but honest).
    report.verdict = "FRESH";
    report.checks.push({ name: "state file has content", ok: true, fresh: true, note: "empty log — no command applied yet" });
    return;
  }

  if (valid === 0) {
    check("at least one intact snapshot folds", false, { validSnapshots: 0 });
    report.verdict = "UNHEALTHY";
    return;
  }

  // Rehydration over a TEMP COPY: the REAL service constructor re-reads and
  // folds the log (read-only probe — zero writes to the probed location).
  const tempDir = mkdtempSync(join(tmpdir(), "adcos-health-probe-"));
  try {
    const tempCopy = join(tempDir, "probe-state.jsonl");
    copyFileSync(path, tempCopy);
    const service = createSurfacesService({
      statePath: tempCopy,
      now: () => 0, // fixed clock — a probe never reads ambient time
      operatorPrincipals: [],
      developerPrincipals: [],
    });
    const durability = service.durability();
    check("service rehydrates over the log (constructor fold)", durability.snapshots === valid, {
      foldedSnapshots: durability.snapshots,
      scanSnapshots: valid,
      foldedTornLines: durability.tornLines,
      scanTornLines: torn,
    });
    // Role fail-closed query: proves the rehydrated instance ANSWERS
    // queries (no principal holds the operator role in this probe config).
    const refused = service.getOperatorView("health-probe@local");
    check("rehydrated service answers a role-gated query (fail closed)", refused.applied === false, {
      reason: refused.reason,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  report.verdict = failures.length > 0 ? "UNHEALTHY" : torn > 0 ? "DEGRADED" : "HEALTHY";
}

/** Probe an installed desktop profile dir (Electron userData layout). */
function probeDesktop(profileDir) {
  const profile = resolve(profileDir);
  report.target = { kind: "desktop", profileDir: profile };
  process.stdout.write(`[health-probe] desktop profile: ${profile}\n`);

  const statePath = join(profile, "state", "adcos-state.jsonl");
  probeStateFile(statePath);

  const mainLog = join(profile, "main.log");
  if (existsSync(mainLog)) {
    const st = statSync(mainLog);
    const lastLine = readFileSync(mainLog, "utf8").trim().split("\n").pop() ?? "";
    check("main.log present (main process ran)", true, {
      bytes: st.size,
      lastModified: st.mtime.toISOString(),
      lastLine: lastLine.slice(0, 80),
    });
  } else {
    // main.log appears on first logMain() call; absence is honest info, not
    // a failure of the state plane.
    report.checks.push({
      name: "main.log present (main process ran)",
      ok: true,
      note: "absent — the shipped 1.0.0 main writes main.log only on logMain() invocations",
    });
    process.stdout.write("[health-probe]   main.log present: ABSENT (info — see ops/monitoring/health-contracts.md)\n");
  }
}

/** Probe the release channel: assets anonymously reachable. */
async function probeReleaseChannel(tag) {
  report.target = { kind: "release-channel", tag };
  const base = `https://github.com/payswapdotorg/adcos-2.0/releases/download/${tag}`;
  const assets = [
    `adcos-desktop_1.0.0_amd64.deb`,
    `adcos-desktop-1.0.0-x86_64.AppImage`,
    `SHA256SUMS.md`,
  ].map((name) => `${base}/${name}`);
  let reachable = 0;
  for (const url of assets) {
    let ok = false;
    let status = null;
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow" });
      status = response.status;
      ok = response.ok;
    } catch (error) {
      status = String(error?.cause?.code ?? error?.message ?? error);
    }
    check(`release asset anonymously reachable: ${url.split("/").pop()}`, ok, { httpStatus: status });
    if (ok) reachable += 1;
  }
  report.verdict = failures.length > 0 ? "UNHEALTHY" : "HEALTHY";
  report.stats = { assets: assets.length, reachable };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const options = parseArgs(process.argv.slice(2));
  process.stdout.write("[health-probe] probing…\n");
  if (options.state !== null) {
    probeStateFile(options.state);
  } else if (options.desktop !== null) {
    probeDesktop(options.desktop);
  } else if (options.releaseChannel === true) {
    await probeReleaseChannel(options.tag);
  }
} catch (error) {
  process.stderr.write(`[health-probe] usage error: ${String(error?.message ?? error)}\n${USAGE}\n`);
  process.exit(64);
}

if (report.verdict === null) {
  report.verdict = failures.length > 0 ? "UNHEALTHY" : "HEALTHY";
}

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
process.stdout.write(`[health-probe] verdict: ${report.verdict}\n`);

process.exitCode =
  report.verdict === "HEALTHY" || report.verdict === "FRESH" ? 0 : report.verdict === "DEGRADED" ? 2 : 1;
