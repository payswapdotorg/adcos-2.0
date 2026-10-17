#!/usr/bin/env node
// P5-W1 RELEASE GATE (work order `## P5-W1`) — the executable checklist
// runner behind docs/runbooks/release-gate.md.
//
// Core steps (work-order order):
//   1. spec checker            (node scripts/check-project-spec.mjs)
//   2. secrets check           (node scripts/ops/check-secrets.mjs)
//   3. restore drill FRESH pass (node --import tsx scripts/ops/restore-drill.mjs)
//   4. health probe on the drill fixture
//   5. STAGING THROUGH THE REAL UI — the BUILT product-web
//      (packages/product-web/dist, built per P5-W2) served over loopback
//      HTTP under headless chromium, against a staging state file seeded
//      by the drill fixture, with window.__adcos_bridge__ routed to the
//      REAL desktop router (apps/desktop-adcos/src/main/router.ts) over
//      the REAL createSurfacesService. Asserts the identity + resources +
//      group-purchase panels render and one REAL bridge round-trip
//      (enroll) persists to the staging state file.
// Supporting steps: architecture:check, product lint, product typechecks,
// desktop battery, renderer build freshness.
//
// Exit non-zero on any HARD fail. PENDING-station items are reported with
// the exact command the TL/station must run — never silently passed.
//
// Usage:
//   node --import tsx scripts/ops/release-gate.mjs
//     [--workspace <dir>]     (default .run-logs/ops/gate-workspace)
//     [--report <path>]       (also write the gate report JSON)
//     [--evidence <dir>]      (screenshots; default <workspace>/evidence)
//     [--staging-port <port>] (default 4173, loopback only)
//
// Honest scope: staging proves UI/bridge/durability — NEVER live provider
// forwarding or payment settlement (ADR-0004 BLOCKED-ON-OPERATOR).

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    workspace: join(REPO_ROOT, ".run-logs", "ops", "gate-workspace"),
    report: null,
    evidence: null,
    stagingPort: 4173,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--workspace") options.workspace = argv[++i];
    else if (arg === "--report") options.report = argv[++i];
    else if (arg === "--evidence") options.evidence = argv[++i];
    else if (arg === "--staging-port") options.stagingPort = Number(argv[++i]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (argv.includes("--workspace") && !options.workspace) throw new Error("--workspace requires a path");
  options.workspace = resolve(options.workspace);
  options.evidence = options.evidence ? resolve(options.evidence) : join(options.workspace, "evidence");
  return options;
}

const options = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Gate report machinery
// ---------------------------------------------------------------------------

const report = {
  gate: "p5-w1 release gate",
  work_order: "P5-W1",
  lane: "p5w1",
  started_at: new Date().toISOString(),
  environment: { node: process.version, platform: `${process.platform} ${process.arch}`, repo_root: REPO_ROOT },
  steps: [],
  pending_station: [],
  verdict: null,
};
const hardFailures = [];

async function stepAsync(name, fn) {
  const started = performance.now();
  const detail = {};
  let status = "PASS";
  try {
    const verdict = await fn(detail);
    if (verdict === "PENDING") status = "PENDING-station";
  } catch (error) {
    status = "FAIL";
    hardFailures.push({ step: name, error: String(error?.message ?? error) });
    detail.error = String(error?.message ?? error);
  }
  const ms = Number((performance.now() - started).toFixed(0));
  report.steps.push({ name, status, ms, ...detail });
  process.stdout.write(`[release-gate] ${name}: ${status} (${ms} ms)\n`);
  return status;
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function pendingStation(name, command, why) {
  report.pending_station.push({ name, command, why });
  process.stdout.write(`[release-gate] PENDING-station: ${name} — run: ${command}\n`);
}

/** Spawn a command, inherit stdout/stderr, return { code, stdout } (stdout captured too). */
function runCommand(command, args, opts = {}) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? REPO_ROOT,
      stdio: ["ignore", "pipe", "inherit"],
      shell: opts.shell ?? false,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      process.stdout.write(String(chunk));
    });
    child.on("exit", (code) => resolveExit({ code: code ?? 1, stdout }));
    child.on("error", (error) => reject(error));
  });
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

rmSync(options.workspace, { recursive: true, force: true });
mkdirSync(options.workspace, { recursive: true });
mkdirSync(options.evidence, { recursive: true });
const drillWorkspace = join(options.workspace, "drill");
const stagingDir = join(options.workspace, "staging");
mkdirSync(stagingDir, { recursive: true });

// ---------------------------------------------------------------------------
// Step 1 — spec checker (governance first)
// ---------------------------------------------------------------------------

await stepAsync("spec checker (node scripts/check-project-spec.mjs)", async (detail) => {
  const { code, stdout } = await runCommand(process.execPath, ["scripts/check-project-spec.mjs"]);
  detail.exit_code = code;
  detail.summary = stdout.trim().split("\n").pop();
  assertEq(code, 0, "spec checker exit code");
});

// ---------------------------------------------------------------------------
// Step 2 — secrets check (credentials isolation)
// ---------------------------------------------------------------------------

await stepAsync("secrets check (node scripts/ops/check-secrets.mjs)", async (detail) => {
  const { code, stdout } = await runCommand(process.execPath, ["scripts/ops/check-secrets.mjs"]);
  detail.exit_code = code;
  detail.summary = stdout.trim().split("\n").pop();
  assertEq(code, 0, "secrets check exit code");
});

// ---------------------------------------------------------------------------
// Step 3 — restore drill FRESH pass
// ---------------------------------------------------------------------------

await stepAsync("restore drill fresh pass (node --import tsx scripts/ops/restore-drill.mjs)", async (detail) => {
  const { code } = await runCommand(process.execPath, [
    "--import", "tsx", "scripts/ops/restore-drill.mjs", "--out", drillWorkspace,
  ]);
  detail.exit_code = code;
  const drillReport = JSON.parse(readFileSync(join(drillWorkspace, "drill-report.json"), "utf8"));
  detail.verdict = drillReport.verdict;
  detail.total_ms = drillReport.total_ms;
  detail.workspace = drillWorkspace;
  assertEq(code, 0, "restore drill exit code");
  assertEq(drillReport.verdict, "PASS", "restore drill verdict");
});

// ---------------------------------------------------------------------------
// Step 4 — health probe on the drill fixture
// ---------------------------------------------------------------------------

const fixtureState = join(drillWorkspace, "fixture", "adcos-state.jsonl");

await stepAsync("health probe on the drill fixture", async (detail) => {
  const { code } = await runCommand(process.execPath, [
    "--import", "tsx", "scripts/ops/health-probe.mjs", "--state", fixtureState,
  ]);
  detail.exit_code = code;
  assertEq(code, 0, "health probe exit code (HEALTHY required on the clean fixture)");
});

// ---------------------------------------------------------------------------
// Step 5 — STAGING THROUGH THE REAL UI
// ---------------------------------------------------------------------------

await stepAsync("staging through the real UI (built product-web + real bridge round-trip)", async (detail) => {
  // 5a. ensure the renderer build exists (build per P5-W2 when stale).
  const distDir = join(REPO_ROOT, "packages", "product-web", "dist");
  if (!existsSync(join(distDir, "index.html"))) {
    const { code } = await runCommand("pnpm", ["--filter", "@adcos/product-web", "build"]);
    assertEq(code, 0, "product-web build exit code");
    detail.renderer_built = true;
  } else {
    detail.renderer_built = false;
    detail.renderer_note = "dist present (built per P5-W2 invocation)";
  }
  assertEq(existsSync(join(distDir, "index.html")), true, "dist/index.html exists");

  // 5b. seed the staging state file from the drill fixture.
  const stagingState = join(stagingDir, "staging-state.jsonl");
  copyFileSync(fixtureState, stagingState);
  const stagingLinesBefore = readFileSync(stagingState, "utf8").split("\n").filter((l) => l !== "").length;
  assertEq(stagingLinesBefore, 10, "staging state seeded with the 10-snapshot drill fixture");

  // 5c. compose the REAL desktop wiring: the same router + session the
  // Electron ipcMain handlers delegate to, over the REAL service.
  const routerUrl = pathToFileURL(join(REPO_ROOT, "apps", "desktop-adcos", "src", "main", "router.ts")).href;
  const sessionUrl = pathToFileURL(join(REPO_ROOT, "apps", "desktop-adcos", "src", "main", "session.ts")).href;
  const contractUrl = pathToFileURL(join(REPO_ROOT, "apps", "desktop-adcos", "src", "contract.ts")).href;
  const surfacesUrl = pathToFileURL(join(REPO_ROOT, "packages", "surfaces", "src", "contract.ts")).href;
  const { routeAdcosRequest } = await import(routerUrl);
  const { DesktopSession } = await import(sessionUrl);
  const { ADCOS_BRIDGE_GLOBAL } = await import(contractUrl);
  const { createSurfacesService } = await import(surfacesUrl);

  const service = createSurfacesService({
    statePath: stagingState,
    now: () => Date.now(),
    operatorPrincipals: ["ops@local"],
    developerPrincipals: ["dev@local"],
  });
  const session = new DesktopSession();

  // The SAME wrapper the ipcMain.handle applies in the real main process.
  const handleCall = (request) => {
    try {
      return { ok: true, data: routeAdcosRequest(service, session, request) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  // 5d. serve the built renderer over loopback HTTP.
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".map": "application/json" };
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let filePath = join(distDir, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
  const port = options.stagingPort;
  await new Promise((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
  const stagingUrl = `http://127.0.0.1:${port}/index.html`;
  detail.staging_url = stagingUrl;

  // 5e. headless chromium via playwright-core (workspace dependency; the
  // browser binary from PLAYWRIGHT_BROWSERS_PATH or a sibling revision).
  const { chromium } = await import("playwright-core");
  const chromiumPath = await resolveChromiumExecutable(chromium);
  detail.chromium = chromiumPath;
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });

    // Install the REAL bridge contract shape before page scripts run:
    // __adcos_bridge__.call(request) → exposed binding → real router.
    await page.exposeFunction("__adcos_bridge_call", (request) => handleCall(request));
    await page.addInitScript(
      ([globalName]) => {
        const holder = globalThis;
        holder[globalName] = {
          call: (request) => holder.__adcos_bridge_call(request),
        };
      },
      [ADCOS_BRIDGE_GLOBAL],
    );

    await page.goto(stagingUrl, { waitUntil: "networkidle" });

    // 5f-1. the shell renders: 7 panels + product header.
    const panelLabels = ["Identity", "My resources", "Reality Lab", "Organizations", "Group purchase", "Role views", "About"];
    for (const label of panelLabels) {
      const button = page.getByRole("button", { name: new RegExp("^" + label) });
      assertEq(await button.count() >= 1, true, `panel button '${label}' renders`);
    }
    const headerBadge = await page.getByText("payments: opaque refs", { exact: false }).count();
    assertEq(headerBadge >= 1, true, "ADR-0004 badge renders in the header");

    // 5f-2. IDENTITY panel renders real bridge data.
    await page.getByRole("button", { name: /^Identity/ }).click();
    await page.getByText("Current identity").waitFor({ state: "visible" });
    const principalVisible = await page.getByText("ada@local").count();
    assertEq(principalVisible >= 1, true, "identity panel shows the session principal (ada@local)");
    const snapshotsRow = await page.getByText("Restored snapshots").count();
    assertEq(snapshotsRow >= 1, true, "durable-state card renders (restored snapshots row)");
    const durability = service.durability();
    assertEq(durability.snapshots, 10, "staging service folded the 10-snapshot fixture");
    await page.screenshot({ path: join(options.evidence, "staging-identity.png") });

    // 5f-3. RESOURCES panel renders the seeded fixture resource.
    await page.getByRole("button", { name: /^My resources/ }).click();
    await page.getByText("Enroll a resource").waitFor({ state: "visible" });
    const resourceRow = page.locator("li span.adcos-mono", { hasText: "res-drill-1" });
    assertEq(await resourceRow.count() >= 1, true, "seeded fixture resource res-drill-1 renders");
    await page.screenshot({ path: join(options.evidence, "staging-resources.png") });

    // 5f-4. GROUP PURCHASE panel renders the seeded request + order state.
    await page.getByRole("button", { name: /^Group purchase/ }).click();
    await page.getByText("Open a group purchase request").waitFor({ state: "visible" });
    assertEq(await page.getByText("req-drill-1").count() >= 1, true, "seeded fixture request req-drill-1 renders");
    const orderedChip = await page.locator(".adcos-chip", { hasText: "ORDERED" }).count();
    assertEq(orderedChip >= 1, true, "order-lifecycle chip ORDERED renders (order state survived)");
    await page.screenshot({ path: join(options.evidence, "staging-purchase.png") });

    // 5f-5. ONE REAL bridge round-trip (enroll) persists to the staging file.
    await page.getByRole("button", { name: /^My resources/ }).click();
    await page.getByText("Enroll a resource").waitFor({ state: "visible" });
    await page.getByLabel("Resource id").fill("res-gate-1");
    await page.getByLabel("Device").fill("device-gate-1");
    await page.getByLabel("Type").fill("router");
    await page.getByLabel("Capability").fill("backhaul/5g");
    await page.getByLabel("Modes (comma separated)").fill("always-on");
    await page.getByLabel("Concurrent limit").fill("1");
    await page.getByRole("button", { name: "Enroll", exact: true }).click();

    // The enrolled resource appears as a VISIBLE resource row after the
    // view refresh (the resource item list, not the observe-form options).
    await page
      .locator("li span.adcos-mono", { hasText: "res-gate-1" })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    // And it PERSISTED: the staging state file grew by exactly one snapshot
    // whose folded state contains the new resource (write-before-ack).
    const stagingLinesAfter = readFileSync(stagingState, "utf8").split("\n").filter((l) => l !== "").length;
    assertEq(stagingLinesAfter, stagingLinesBefore + 1, "staging state grew by exactly one snapshot on the enroll round-trip");
    const lastLine = JSON.parse(
      readFileSync(stagingState, "utf8").split("\n").filter((l) => l !== "").pop(),
    );
    assertEq(
      lastLine.resources.some((r) => r.id === "res-gate-1"),
      true,
      "persisted snapshot contains the enrolled resource",
    );
    assertEq(service.durability().snapshots, 11, "service folded 11 snapshots after the round-trip");
    await page.screenshot({ path: join(options.evidence, "staging-enroll-roundtrip.png") });

    // The live session durability counters flowed back through the bridge.
    await page.getByRole("button", { name: /^Identity/ }).click();
    await page.getByText("Current identity").waitFor({ state: "visible" });

    detail.roundtrip = {
      method: "enrollResource",
      applied_resource: "res-gate-1",
      staging_state_before: stagingLinesBefore,
      staging_state_after: stagingLinesAfter,
    };
    detail.screenshots = [
      join(options.evidence, "staging-identity.png"),
      join(options.evidence, "staging-resources.png"),
      join(options.evidence, "staging-purchase.png"),
      join(options.evidence, "staging-enroll-roundtrip.png"),
    ];
    detail.transport_note =
      "CDP page binding replaces the Electron IPC channel only; the bridge contract (AdcosBridge.call), the desktop router, the session, the surfaces service and the durable JSONL store are the REAL shipped wiring. The Electron IPC/preload layer itself is proven by the P5-W2 packaged-app smoke.";
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolveClose) => server.close(() => resolveClose()));
  }
});

/** Resolve a chromium executable: explicit env override → playwright default
 *  → any installed playwright chromium revision → common system paths. */
async function resolveChromiumExecutable(chromium) {
  const candidates = [];
  if (process.env.ADCOS_GATE_CHROMIUM) candidates.push(process.env.ADCOS_GATE_CHROMIUM);
  try {
    candidates.push(chromium.executablePath());
  } catch {
    // playwright-core without browsers installed throws here — fall through.
  }
  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? tmpdir(), ".cache", "ms-playwright");
  const { readdirSync } = await import("node:fs");
  try {
    for (const entry of readdirSync(cacheRoot)) {
      if (/^chromium(-\d+)?$/.test(entry)) {
        candidates.push(join(cacheRoot, entry, "chrome-linux64", "chrome"));
        candidates.push(join(cacheRoot, entry, "chrome-linux", "chrome"));
      }
    }
  } catch {
    // no cache dir — fall through
  }
  candidates.push("/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome");
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error(
    "no chromium executable found for the staging step — install playwright chromium or set ADCOS_GATE_CHROMIUM; the staging step is then re-run with: node --import tsx scripts/ops/release-gate.mjs",
  );
}

// ---------------------------------------------------------------------------
// Supporting steps (release-gate.md checklist items 2, 4–6)
// ---------------------------------------------------------------------------

await stepAsync("architecture check (node scripts/architecture/architecture-check.mjs check)", async (detail) => {
  const { code, stdout } = await runCommand(process.execPath, ["scripts/architecture/architecture-check.mjs", "check"]);
  detail.exit_code = code;
  detail.summary = stdout.trim().split("\n").pop();
  assertEq(code, 0, "architecture check exit code");
});

await stepAsync("product lint (npx oxlint packages/product-web apps/desktop-adcos)", async (detail) => {
  const { code, stdout } = await runCommand("npx", ["oxlint", "packages/product-web", "apps/desktop-adcos"]);
  detail.exit_code = code;
  detail.summary = stdout.trim().split("\n").pop();
  assertEq(code, 0, "product lint exit code (0 errors required)");
});

await stepAsync("product typechecks (tsc --noEmit, product-web + desktop-adcos)", async (detail) => {
  const results = {};
  const web = await runCommand("pnpm", ["--filter", "@adcos/product-web", "exec", "tsc", "--noEmit"]);
  results.product_web = web.code;
  const desktop = await runCommand("pnpm", ["--filter", "@adcos/desktop-app", "exec", "tsc", "--noEmit"]);
  results.desktop_adcos = desktop.code;
  detail.exit_codes = results;
  assertEq(web.code, 0, "product-web tsc exit code");
  assertEq(desktop.code, 0, "desktop-adcos tsc exit code");
});

await stepAsync("desktop battery (node --import tsx --test test/router.test.ts)", async (detail) => {
  const cwd = join(REPO_ROOT, "apps", "desktop-adcos");
  const { code, stdout } = await runCommand(process.execPath, ["--import", "tsx", "--test", "test/router.test.ts"], { cwd });
  detail.exit_code = code;
  detail.summary = stdout.trim().split("\n").pop();
  assertEq(code, 0, "desktop battery exit code (3/3 required)");
});

// ---------------------------------------------------------------------------
// PENDING-station items (reported with exact commands — never faked)
// ---------------------------------------------------------------------------

pendingStation(
  "package linux artifacts (deb + AppImage + SHA256SUMS)",
  "cd apps/desktop-adcos && pnpm package:linux && sha256sum release/adcos-desktop_1.0.0_amd64.deb release/adcos-desktop-1.0.0-x86_64.AppImage > SHA256SUMS.md",
  "packaging runs at the integration station with electron-builder caches; artifacts are release-time, not gate-time",
);
pendingStation(
  "anonymous download verification (post-publish)",
  "node --import tsx scripts/ops/health-probe.mjs --release-channel adcos-desktop-v<version>",
  "assets exist only AFTER the GitHub Release is published; the gate runs pre-publish",
);
pendingStation(
  "real-GPU packaged-app smoke on the operator Ubuntu machine",
  "install the deb from the release; launch; verify the 7 panels + one enroll round-trip; evidence screenshots",
  "sandbox smoke ran headless Xvfb (--disable-gpu) in P5-W2; real-GPU rendering is operator-host evidence",
);
pendingStation(
  "current-state.json + work-orders.md evidence update",
  "edit spec/development-state/current-state.json (frontier/completed evidence) + the lane evidence in spec/work-orders.md",
  "human station step: governance files are updated by the TL at acceptance, not by the gate",
);

// ---------------------------------------------------------------------------
// Verdict + report
// ---------------------------------------------------------------------------

report.finished_at = new Date().toISOString();
report.verdict = hardFailures.length === 0 ? "PASS" : "FAIL";
report.hard_failures = hardFailures;
report.workspace = options.workspace;
report.evidence_dir = options.evidence;

const reportPath = join(options.workspace, "release-gate-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
if (options.report) {
  const target = resolve(options.report);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
}

const passCount = report.steps.filter((s) => s.status === "PASS").length;
process.stdout.write(
  `[release-gate] verdict ${report.verdict} — ${passCount}/${report.steps.length} steps PASS, ` +
    `${report.pending_station.length} PENDING-station item(s), ${hardFailures.length} hard failure(s)` +
    ` — report ${reportPath}${options.report ? " (+ " + resolve(options.report) + ")" : ""}\n`,
);

process.exitCode = report.verdict === "PASS" ? 0 : 1;
