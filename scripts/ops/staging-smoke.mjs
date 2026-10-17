#!/usr/bin/env node
/**
 * staging-smoke.mjs — P5-W1 Task P5W1-6 step 12: STAGING THROUGH THE REAL
 * UI (the release-gate item that is PENDING-station wherever no display
 * exists; this script IS the station runner).
 *
 * What it does (all REAL, nothing mocked):
 *   1. SEED    a staging state file through the REAL SurfacesService
 *              (public contract) at an isolated XDG_CONFIG_HOME.
 *   2. LAUNCH  the REAL Electron desktop app (apps/desktop-adcos out/main)
 *              under Xvfb with CDP on :9223 and --disable-gpu.
 *   3. ASSERT  the product UI renders: window title ADCOS, the 7-panel
 *              nav, the honest ADR-0004 badge in the header.
 *   4. BRIDGE  a REAL round-trip through window.__adcos_bridge__
 *              (session -> resources render the seeded row -> a NEW
 *              enroll applies).
 *   5. PERSIST assert the staging state file GREW (write-before-ack
 *              through the real app's main-process service).
 *
 * Usage: node --import tsx scripts/ops/staging-smoke.mjs [--keep]
 * Exit 0 = PASS; 1 = FAIL (report JSON on stdout).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createSurfacesService } from "../../packages/surfaces/src/contract.ts";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const ROOT = join(import.meta.dirname, "..", "..");
const KEEP = process.argv.includes("--keep");
const PORT = 9300 + (process.pid % 300); // unique per run: a leaked app from an aborted run must not own our CDP endpoint

// reap any staging electron leaked by an aborted earlier run (exact binary path — never the replay Chrome)
try {
  spawnSync("pkill", ["-f", `${join(ROOT, "node_modules", "electron", "dist", "electron")}.*desktop-adcos`]);
} catch { /* best effort */ }

const work = mkdtempSync(join(tmpdir(), "adcos-staging-"));
const configHome = join(work, "xdg-config");
mkdirSync(configHome, { recursive: true });

// Electron userData = <appData>/<appName>; appData on Linux = $XDG_CONFIG_HOME.
const APP_NAME = "@adcos/desktop-app"; // package.json name (no productName field)
const stateDir = join(configHome, APP_NAME, "state");
const statePath = join(stateDir, "adcos-state.jsonl");
mkdirSync(stateDir, { recursive: true });

const report = { smoke: "staging-smoke", workOrder: "P5-W1", checks: {} };
let app = null;
let xvfb = null;
const fail = (msg) => { report.verdict = "FAIL"; report.reason = msg; finish(1); };
function finish(code) {
  try { if (app?.kill) app.kill("SIGTERM"); } catch { /* */ }
  try { if (xvfb?.kill) xvfb.kill("SIGTERM"); } catch { /* */ }
  report.workDir = KEEP ? work : undefined;
  console.log(JSON.stringify(report, null, 2));
  if (!KEEP) rmSync(work, { recursive: true, force: true });
  process.exit(code);
}

// --- 1. SEED through the real service ---------------------------------------
const FIXED_NOW = 1_800_000_000_000;
{
  const service = createSurfacesService({
    statePath, now: () => FIXED_NOW,
    operatorPrincipals: ["ops@local"], developerPrincipals: ["dev@local"],
  });
  const r = service.enrollResource("ada@local", {
    id: "res-staging-seed", device: "device-staging", type: "phone",
    capability: "tether/4g", modes: ["hotspot"], limits: { concurrent: 2 },
  });
  if (r.applied !== true) fail(`seed enroll not applied: ${JSON.stringify(r).slice(0, 120)}`);
  report.checks.seeded = { statePath, bytes: readFileSync(statePath).length };
}

const bytesBefore = readFileSync(statePath).length;

// --- 2. LAUNCH the real app under Xvfb ---------------------------------------
xvfb = spawn("Xvfb", [":95", "-screen", "0", "1280x840x24"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 600));

const electronBin = join(ROOT, "node_modules", "electron", "dist", "electron");
if (!existsSync(electronBin)) fail(`electron binary missing at ${electronBin} (run its install.js)`);
app = spawn(electronBin, [join(ROOT, "apps", "desktop-adcos"), "--disable-gpu", `--remote-debugging-port=${PORT}`], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: ":95", XDG_CONFIG_HOME: configHome, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
app.stderr.on("data", (d) => { stderr += d.toString(); });
report.checks.launched = { pid: app.pid, display: ":95", cdp: PORT };

// --- 3-4. CDP assertions ------------------------------------------------------
async function cdpCall(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (data) => {
      try {
        const m = JSON.parse(data.toString());
        if (m.id === id) { ws.off("message", onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
      } catch { /* ignore */ }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(ws, expr, timeoutMs = 15000) {
  const r = await cdpCall(ws, nextId(), "Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
  if (r.exceptionDetails) throw new Error(`eval exception: ${JSON.stringify(r.exceptionDetails).slice(0, 200)}`);
  return r.result.value;
}

let msgId = 0;
const nextId = () => ++msgId;

try {
  // wait for the CDP endpoint
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const list = JSON.parse((await import("node:https")).get ? "" : ""); // placeholder, replaced below
    } catch { /* */ }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const pages = await res.json();
      target = pages.find((p) => p.type === "page" && (p.url || "").startsWith("file://")) ?? null;
    } catch { /* not up yet */ }
  }
  if (!target) fail(`no CDP page target (app stderr tail: ${stderr.slice(-400)})`);
  report.checks.cdpTarget = { url: target.url.slice(0, 80), title: target.title, port: PORT };

  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });

  // title + panels + badge
  for (let i = 0; i < 40; i++) {
    const title = await evalJs(ws, `document.title`);
    if (typeof title === "string" && title.startsWith("ADCOS")) break;
    if (i === 39) fail(`window title never became ADCOS* (got ${JSON.stringify(title)})`);
    await new Promise((r) => setTimeout(r, 500));
  }
  report.checks.windowTitle = await evalJs(ws, `document.title`);

  const navInfo = await evalJs(ws, `(() => {
    const nav = document.querySelector('nav[aria-label="Product panels"]');
    const buttons = nav ? nav.querySelectorAll('button') : [];
    const badge = document.querySelector('header span.adcos-chip');
    return { nav: !!nav, panels: buttons.length, badge: badge ? badge.textContent.trim() : null };
  })()`);
  report.checks.ui = navInfo;
  if (!navInfo.nav || navInfo.panels < 7) fail(`product nav missing or <7 panels: ${JSON.stringify(navInfo)}`);
  if (!navInfo.badge || !navInfo.badge.includes("ADR-0004")) fail(`ADR-0004 badge missing: ${JSON.stringify(navInfo.badge)}`);

  // bridge session round-trip (REAL IPC)
  const session = await evalJs(ws, `window.__adcos_bridge__.call({ method: "session" })`);
  report.checks.bridgeSession = { ok: session?.ok, principal: session?.data?.principal, roles: session?.data?.roles, persistence: session?.data?.persistence };
  if (session?.ok !== true || session?.data?.principal !== "ada@local") fail(`bridge session failed: ${JSON.stringify(session).slice(0, 200)}`);

  // click the Resources panel (label "My resources"); seeded row must render
  await evalJs(ws, `(() => { const btns = [...document.querySelectorAll('nav[aria-label="Product panels"] button')]; const r = btns.find(b => b.textContent.includes('My resources')); if (!r) throw new Error('resources button not found'); r.click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 700));
  const resourcesText = await evalJs(ws, `document.querySelector('main') ? document.querySelector('main').innerText.slice(0, 600) : ''`);
  report.checks.resourcesPanelShowsSeed = resourcesText.includes("res-staging-seed");
  if (!resourcesText.includes("res-staging-seed")) fail(`seeded resource not rendered in Resources panel: ${resourcesText.slice(0, 160)}`);

  // NEW enroll through the REAL bridge (write-before-ack must persist)
  const enroll = await evalJs(ws, `window.__adcos_bridge__.call({ method: "enrollResource", input: { id: "res-staging-live", device: "device-live", type: "phone", capability: "tether/5g", modes: ["hotspot"], limits: { concurrent: 1 } } })`);
  report.checks.bridgeEnroll = { ok: enroll?.ok, applied: enroll?.data?.applied };
  if (enroll?.ok !== true || enroll?.data?.applied !== true) fail(`bridge enroll failed: ${JSON.stringify(enroll).slice(0, 200)}`);

  // --- 5. persistence on disk through the real app ---------------------------
  await new Promise((r) => setTimeout(r, 800));
  const bytesAfter = readFileSync(statePath).length;
  report.checks.persistence = { bytesBefore, bytesAfter, grew: bytesAfter > bytesBefore };
  if (bytesAfter <= bytesBefore) fail(`staging state file did NOT grow through the app (${bytesBefore} -> ${bytesAfter})`);

  report.verdict = "PASS";
  report.checks.honestScope = "dev-tree desktop app (out/main + out/renderer) under Xvfb; REAL IPC bridge; REAL durable JSONL; not the packaged asar (that is the P5-W2 smoke class).";
  ws.close();
  finish(0);
} catch (error) {
  fail(`exception: ${String(error?.message ?? error).slice(0, 300)} | stderr tail: ${stderr.slice(-300)}`);
}
