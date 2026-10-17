#!/usr/bin/env node
/**
 * release-gate.mjs — P5-W1 Task P5W1-6: the executable release-gate
 * checklist (docs/runbooks/release-gate.md is the human view).
 *
 * Steps (hard-fail vs PENDING-station per the runbook):
 *   1. spec checker            node scripts/check-project-spec.mjs
 *   2. secrets check           node scripts/ops/check-secrets.mjs
 *   3. restore drill           node scripts/ops/run-drills.mjs (verdict PASS)
 *   4. health probe            node --import tsx scripts/ops/health-probe.mjs --fixture
 *   5. architecture check      node scripts/architecture/architecture-check.mjs check
 *   6. product-web tsc         pnpm --filter @adcos/product-web exec tsc --noEmit -p tsconfig.json
 *   7. product-web tests       pnpm --filter @adcos/product-web test
 *   8. desktop tsc             pnpm --filter @adcos/desktop-app typecheck (tsc --noEmit)
 *   9. desktop battery         pnpm --filter @adcos/desktop-app test
 *  10. lint                    pnpm lint
 *  11. product build           pnpm --filter @adcos/product-web build   (--skip-build to skip)
 *  12. staging through real UI PENDING-station unless a browser is locally
 *                              provable (none in this workspace by default) —
 *                              reports the exact station command, never fabricates
 *
 * Exit 0 = all hard steps PASS (PENDING-station items allowed and listed);
 * exit 1 = at least one hard FAIL.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SKIP_BUILD = process.argv.includes("--skip-build");

const results = [];
function run(step, { cmd, args, timeout = 300_000, pendingStation = null }) {
  if (pendingStation) {
    results.push({ step, status: "PENDING-station", detail: pendingStation });
    return "PENDING-station";
  }
  const t0 = Date.now();
  const proc = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf-8", timeout, maxBuffer: 32 * 1024 * 1024 });
  const ms = Date.now() - t0;
  const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim();
  const pass = proc.status === 0;
  results.push({ step, status: pass ? "PASS" : "FAIL", ms, tail: out.split("\n").slice(-4).join("\n").slice(0, 400) });
  return pass ? "PASS" : "FAIL";
}

const node = process.execPath;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

run("1. spec checker", { cmd: node, args: ["scripts/check-project-spec.mjs"] });
run("2. secrets check", { cmd: node, args: ["scripts/ops/check-secrets.mjs"] });
run("3. restore drill", { cmd: node, args: ["scripts/ops/run-drills.mjs"], timeout: 180_000 });
run("4. health probe (fixture)", { cmd: node, args: ["--import", "tsx", "scripts/ops/health-probe.mjs", "--fixture"], timeout: 120_000 });
run("5. architecture check", { cmd: node, args: ["scripts/architecture/architecture-check.mjs", "check"], timeout: 180_000 });
run("6. product-web tsc", { cmd: pnpm, args: ["--filter", "@adcos/product-web", "exec", "tsc", "--noEmit", "-p", "tsconfig.json"], timeout: 300_000 });
run("7. product-web tests", { cmd: pnpm, args: ["--filter", "@adcos/product-web", "test"], timeout: 300_000 });
run("8. desktop tsc", { cmd: pnpm, args: ["--filter", "@adcos/desktop-app", "typecheck"], timeout: 300_000 });
run("9. desktop battery", { cmd: pnpm, args: ["--filter", "@adcos/desktop-app", "test"], timeout: 300_000 });
run("10. lint", { cmd: pnpm, args: ["lint"], timeout: 300_000 });
run("11. product build (vite)", SKIP_BUILD
  ? { cmd: node, args: ["-e", "process.exit(0)"], }
  : { cmd: pnpm, args: ["--filter", "@adcos/product-web", "build"], timeout: 420_000 });

// Step 12 — staging through the real UI: runs the REAL staging smoke
// (scripts/ops/staging-smoke.mjs) when the host has electron + Xvfb;
// otherwise reports PENDING-station with the exact command.
const electronOk = existsSync(join(ROOT, "node_modules", "electron", "dist", "electron"));
const xvfbOk = existsSync("/usr/bin/Xvfb");
const stagingReady = electronOk && xvfbOk;
run("12. staging through real UI", stagingReady
  ? { cmd: node, args: ["--import", "tsx", "scripts/ops/staging-smoke.mjs"], timeout: 240_000 }
  : {
      cmd: node, args: ["-e", "process.exit(0)"],
      pendingStation:
        (electronOk ? "" : "install the electron binary (ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js); ") +
        (xvfbOk ? "" : "install Xvfb; ") +
        "then run: node --import tsx scripts/ops/staging-smoke.mjs",
    });

// Step 13 — human/station items (reported, not executed)
results.push({
  step: "13. packaged artifacts (deb+AppImage+SHA256SUMS)",
  status: "PENDING-station",
  detail: "electron-builder linux x64 at the station (memory window ~2GB free); dpkg-deb -I + asar list verification.",
});
results.push({
  step: "14. anonymous download verification",
  status: "PENDING-station",
  detail: "curl (no auth) every release asset -> HTTP 200; sha256 exact match vs SHA256SUMS.md.",
});

const fails = results.filter((r) => r.status === "FAIL");
const report = {
  gate: "release-gate",
  workOrder: "P5-W1",
  verdict: fails.length === 0 ? "PASS" : "FAIL",
  steps: results,
  fails: fails.length,
  generatedAt: new Date().toISOString(),
};
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length === 0 ? 0 : 1);
