#!/usr/bin/env node
// P5-W1 RESTORE DRILL (work order `## P5-W1`, acceptance item "recovery
// drill passed") — a REAL executable drill against the REAL durable store.
//
// Runbook: ops/drills/restore-drill.md. Convenience wrapper:
// scripts/ops/run-drills.mjs.
//
// Phases:
//   1. SEED      — a full customer journey through the REAL
//                 createSurfacesService (packages/surfaces public contract)
//                 into a durable JSONL log: enroll → consent OPT_IN →
//                 observation → Lab evaluation (PURSUE) → org formation →
//                 group purchase → offer → commitment → AUTHORIZE →
//                 PLACE_ORDER (opaque payment reference, ADR-0004).
//   2. SNAPSHOT  — copy the log (backup), sha256 it, re-read + re-hash to
//                 verify content integrity (the backup procedure from
//                 docs/reports/security/backup-restore-load-plan.md §2.1).
//   3. CORRUPT   — the failure we recover from: (a) torn-tail: append a
//                 truncated line and prove the store detects/skips it
//                 (tornLines reported, last intact snapshot folded);
//                 (b) total loss: overwrite the live log with garbage and
//                 prove the service reopens EMPTY (all lines torn) —
//                 without the backup, state is gone.
//   4. RESTORE   — copy the backup over the live log; verify the restored
//                 bytes hash-match the snapshot (§2.2 restore procedure).
//   5. VERIFY    — reopen the service over the restored log and assert the
//                 customer view + order lifecycle survived EXACTLY (deep
//                 equality vs the pre-failure reference), the restored
//                 instance is WRITABLE (one benign consent write grows the
//                 log before its ack — write-before-ack), and role gating
//                 still fails closed after restore (deployment config, not
//                 the log, governs roles — §2.3 step 4).
//   6. REPORT    — emit a drill report JSON (timings, verdict) and exit
//                 0 on PASS / 1 on FAIL.
//
// Usage:
//   node --import tsx scripts/ops/restore-drill.mjs [--out <dir>] [--report <path>] [--keep]
//     --out     drill workspace (default: mkdtemp; an explicit --out is kept
//               so the release gate can reuse the fixture)
//     --report  where to ALSO write drill-report.json (e.g. evidence)
//     --keep    keep a default temp workspace instead of cleaning it
//
// Honest scope: this drill proves CONTROL-PLANE state durability for the
// surfaces JSONL store. It is NOT live provider recovery and NOT payment
// settlement evidence — those remain BLOCKED-ON-OPERATOR (ADR-0004).
//
// Dependency-free apart from the workspace's own tsx loader: node builtins
// + the REAL surfaces public contract. No mocks, no simulated store.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { out: null, report: null, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      options.out = argv[++i];
      if (!options.out) throw new Error("--out requires a path");
    } else if (arg === "--report") {
      options.report = argv[++i];
      if (!options.report) throw new Error("--report requires a path");
    } else if (arg === "--keep") {
      options.keep = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

// Load the REAL surfaces public contract (TS source; tsx loader handles it).
// Deep imports are NOT used: packages/surfaces/src/contract.ts IS the public
// entrypoint declared in architecture-policy.yaml.
const surfacesContractUrl = pathToFileURL(join(REPO_ROOT, "packages", "surfaces", "src", "contract.ts")).href;
const { createSurfacesService } = await import(surfacesContractUrl);

// Drill constants — the injected clock is FIXED (deterministic replay).
const FIXED_NOW = 1_800_000_000_000;
const PRINCIPAL = "ada@local";
const OPERATORS = ["ops@local"];
const DEVELOPERS = ["dev@local"];
const RESOURCE_ID = "res-drill-1";
const EVAL_ID = "eval-drill-1";
const ORG_ID = "org-drill-1";
const REQUEST_ID = "req-drill-1";
const OFFER_ID = "offer-drill-1";

function newService(statePath) {
  return createSurfacesService({
    statePath,
    now: () => FIXED_NOW,
    operatorPrincipals: OPERATORS,
    developerPrincipals: DEVELOPERS,
  });
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function lineCount(path) {
  return readFileSync(path, "utf8").split("\n").filter((line) => line !== "").length;
}

/** Apply a command through the public service API; fail the drill loudly on
 *  an honest domain refusal (the seed journey must apply every step). */
function mustApply(label, outcome) {
  assert.ok(
    outcome.applied === true,
    `seed step '${label}' was refused by the domain service: ${JSON.stringify(outcome)}`,
  );
  return outcome;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const explicitOut = options.out !== null;
const workspace = explicitOut ? resolve(options.out) : mkdtempSync(join(tmpdir(), "adcos-restore-drill-"));
rmSync(workspace, { recursive: true, force: true });
mkdirSync(join(workspace, "live"), { recursive: true });
mkdirSync(join(workspace, "backup"), { recursive: true });
mkdirSync(join(workspace, "fixture"), { recursive: true });

const livePath = join(workspace, "live", "adcos-state.jsonl");
const backupPath = join(workspace, "backup", "adcos-state.jsonl");
const fixturePath = join(workspace, "fixture", "adcos-state.jsonl");
const reportPath = join(workspace, "drill-report.json");

const report = {
  drill: "p5-w1 restore drill",
  work_order: "P5-W1",
  lane: "p5w1",
  started_at: new Date().toISOString(),
  clock: "fixed (epoch ms " + FIXED_NOW + ")",
  environment: {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    repo_root: REPO_ROOT,
  },
  scope: "control-plane state durability of the surfaces JSONL store; NOT live provider recovery; NOT payment settlement (ADR-0004 BLOCKED-ON-OPERATOR)",
  phases: [],
  checks: [],
  verdict: null,
  workspace,
  paths: { live: livePath, backup: backupPath, fixture: fixturePath, report: reportPath },
};

const failures = [];

function phase(name, fn) {
  const started = performance.now();
  const detail = {};
  let ok = true;
  try {
    fn(detail);
  } catch (error) {
    ok = false;
    failures.push({ phase: name, error: String(error?.message ?? error) });
    detail.error = String(error?.message ?? error);
  }
  const ms = Number((performance.now() - started).toFixed(3));
  report.phases.push({ name, ms, ok, ...detail });
  const mark = ok ? "ok" : "FAIL";
  process.stdout.write(`[restore-drill] phase ${name}: ${mark} (${ms} ms)\n`);
  return ok;
}

function check(name, condition, detail) {
  report.checks.push({ name, ok: condition === true, ...detail });
  if (condition !== true) {
    failures.push({ check: name, detail: detail ?? {} });
  }
  process.stdout.write(
    `[restore-drill]   check ${name}: ${condition === true ? "ok" : "FAIL"}${detail ? " — " + JSON.stringify(detail) : ""}\n`,
  );
}

// The reference state the restore must reproduce EXACTLY (captured in the
// seed phase, after every applied command is durably acknowledged).
const reference = { view: null, orderState: null, resourceShare: null, tornLines: 0 };

// ---------------------------------------------------------------------------
// Phase 1 — SEED (the full journey through the REAL service)
// ---------------------------------------------------------------------------

const seedCounts = {};
phase("seed", (detail) => {
  const service = newService(livePath);

  mustApply("enroll", service.enrollResource(PRINCIPAL, {
    id: RESOURCE_ID,
    device: "device-drill-1",
    type: "phone",
    capability: "tether/4g",
    modes: ["hotspot"],
    limits: { concurrent: 2 },
  }));
  mustApply("consent OPT_IN", service.applyConsentEvent(PRINCIPAL, RESOURCE_ID, "OPT_IN"));
  mustApply("observe", service.recordObservation(PRINCIPAL, RESOURCE_ID, {
    status: "UNKNOWN",
    declaredVersion: "1",
  }));
  mustApply("lab evaluation", service.runLabEvaluation({
    id: EVAL_ID,
    intent: "connectivity.cost.reduction",
    baseline: { strategy: "baseline-status-quo", cost: 120, reliability: 0.9 },
    alternatives: [{ strategy: "pooled-provider-plan", cost: 80, reliability: 0.92 }],
    selectedStrategy: "pooled-provider-plan",
    confidence: 0.8,
    assumptions: ["measured window only"],
  }));
  mustApply("formation", service.formOrganization(PRINCIPAL, {
    organization: ORG_ID,
    pursuitEvidenceId: `${EVAL_ID}-opportunity`,
    candidates: [{ principal: PRINCIPAL, consent: true, consentRecordedAt: FIXED_NOW }],
    minFounders: 1,
    authorityScope: "group.purchase",
    initialMandates: [{ principal: PRINCIPAL, scope: "group.purchase", permissions: ["commit"] }],
  }));
  mustApply("open group purchase", service.openGroupPurchase(PRINCIPAL, {
    id: REQUEST_ID,
    intent: "connectivity.group-plan",
    organization: ORG_ID,
    requirements: { quantity: 1 },
    threshold: 1,
    expiresAt: FIXED_NOW + 3_600_000,
  }));
  mustApply("receive offer", service.receiveOffer(PRINCIPAL, {
    id: OFFER_ID,
    request: REQUEST_ID,
    supplier: "provider-a",
    product: "group-connectivity-plan",
    capability: "tether/4g",
    region: "accra",
    quantity: 1,
    perMemberCost: 40,
    totalCost: 40,
    recurringCharges: [{ amount: 40, frequency: "monthly", description: "pooled" }],
    oneTimeCharges: [{ amount: 0, description: "setup" }],
    term: "12 months",
    limitations: ["fair-use"],
    expiry: FIXED_NOW + 86_400_000,
    provenance: "drill:supplier-terms",
  }));
  mustApply("commit", service.commitToPurchase(PRINCIPAL, {
    requestId: REQUEST_ID,
    allocation: { share: 1 },
  }));
  mustApply("authorize", service.advancePurchaseOrder(PRINCIPAL, {
    requestId: REQUEST_ID,
    event: "AUTHORIZE",
  }));
  mustApply("place order (opaque payment reference, ADR-0004)", service.advancePurchaseOrder(PRINCIPAL, {
    requestId: REQUEST_ID,
    event: "PLACE_ORDER",
    paymentReference: {
      id: "payref-drill-1",
      type: "opaque",
      authority: "authorized-financial-authority (role, unselected rail)",
      created: FIXED_NOW,
      settled: false,
    },
  }));

  seedCounts.snapshots = service.durability().snapshots;
  seedCounts.lines = lineCount(livePath);
  detail.applied_commands = 10;
  detail.durability = service.durability();
  detail.log_lines = seedCounts.lines;

  // The reference state the restore must reproduce EXACTLY.
  const view = service.getCustomerView(PRINCIPAL);
  const orderCard = view.groupPurchases.find((card) => card.requestId === REQUEST_ID);
  assert.ok(orderCard !== undefined, "seeded request present in the customer view");
  assert.equal(orderCard.orderState, "ORDERED", "order state after PLACE_ORDER");
  reference.view = JSON.parse(JSON.stringify(view));
  reference.orderState = orderCard.orderState;
  reference.resourceShare = view.resources.find((r) => r.resourceId === RESOURCE_ID)?.share;
  reference.tornLines = service.durability().tornLines;
});

check("seed: 10 applied commands, write-before-ack grew the log to 10 lines", seedCounts.lines === 10 && seedCounts.snapshots === 10, {
  lines: seedCounts.lines,
  snapshots: seedCounts.snapshots,
});
check("seed: zero torn lines in the pristine log", reference.tornLines === 0);

// ---------------------------------------------------------------------------
// Phase 2 — SNAPSHOT (backup + content-hash verification)
// ---------------------------------------------------------------------------

const snapshotInfo = {};
phase("snapshot", (detail) => {
  copyFileSync(livePath, backupPath);
  snapshotInfo.hash = sha256File(backupPath);
  snapshotInfo.bytes = statSync(backupPath).size;
  // Verify content integrity: re-read the backup and re-hash (the copy is
  // byte-identical), and confirm every line parses as a surface state.
  snapshotInfo.rehash = sha256File(backupPath);
  const lines = readFileSync(backupPath, "utf8").split("\n").filter((l) => l !== "");
  snapshotInfo.lines = lines.length;
  for (const line of lines) {
    JSON.parse(line); // throws on corruption — snapshot must be pristine
  }
  detail.bytes = snapshotInfo.bytes;
  detail.sha256 = snapshotInfo.hash;
  detail.lines = snapshotInfo.lines;
});

check("snapshot: content hash verified (re-hash equal, 10 parseable lines)", snapshotInfo.hash === snapshotInfo.rehash && snapshotInfo.lines === 10, {
  sha256: snapshotInfo.hash,
  bytes: snapshotInfo.bytes,
});

// Preserve a pristine fixture copy for staging reuse (release gate).
copyFileSync(livePath, fixturePath);
check("fixture: pristine seeded log preserved for staging", sha256File(fixturePath) === snapshotInfo.hash);

// ---------------------------------------------------------------------------
// Phase 3 — CORRUPT (the failure we recover from)
// ---------------------------------------------------------------------------

phase("corrupt-torn-tail", (detail) => {
  // (a) crash-during-persist simulation: a truncated final line.
  appendTornTail(livePath);
  const tornService = newService(livePath);
  const durability = tornService.durability();
  detail.durability = durability;
  // The torn line is counted and skipped; the last INTACT snapshot is folded
  // (the store keeps working — battery-proven property, re-proven here).
  assert.equal(durability.tornLines, 1, "torn tail detected");
  assert.equal(durability.snapshots, 10, "10 intact snapshots still folded");
  const tornView = tornService.getCustomerView(PRINCIPAL);
  assert.deepEqual(
    tornView,
    JSON.parse(JSON.stringify(reference.view)),
    "fold over torn tail reproduces the reference view",
  );
  // Repair in place is NOT log surgery: restore-from-backup is the doctrine,
  // so we leave the torn state to be superseded by the restore phase below.
});

function appendTornTail(path) {
  // A partial JSON line: valid prefix, no terminator — exactly what a crash
  // mid-appendFileSync leaves behind.
  const intact = readFileSync(path, "utf8").split("\n").filter((l) => l !== "");
  const last = intact[intact.length - 1] ?? "{}";
  writeFileSync(path, readFileSync(path, "utf8") + last.slice(0, Math.max(1, Math.floor(last.length / 2))));
}

phase("corrupt-total-loss", (detail) => {
  // (b) the unrecoverable-in-place failure: the live log is destroyed.
  writeFileSync(livePath, "\u0000corrupt-not-json\u0000 {{\nnot a snapshot\n\xFF\xFE");
  const lostService = newService(livePath);
  detail.durability_after_loss = lostService.durability();
  detail.view_resources_after_loss = lostService.getCustomerView(PRINCIPAL).resources.length;
  // Without the backup the service reopens EMPTY (every line torn) — it does
  // not crash, and it does not invent state. This is the honest data-loss
  // baseline the restore must recover from.
  assert.equal(lostService.getCustomerView(PRINCIPAL).resources.length, 0, "state is gone without the backup");
  assert.ok(lostService.durability().tornLines > 0, "corrupt lines reported, never trusted");
});

// ---------------------------------------------------------------------------
// Phase 4 — RESTORE (backup → live)
// ---------------------------------------------------------------------------

phase("restore", (detail) => {
  copyFileSync(backupPath, livePath);
  detail.restored_sha256 = sha256File(livePath);
  detail.restored_lines = lineCount(livePath);
  assert.equal(sha256File(livePath), snapshotInfo.hash, "restored file hash equals the snapshot hash");
  assert.equal(lineCount(livePath), 10, "restored log has the full 10 snapshots");
});

// ---------------------------------------------------------------------------
// Phase 5 — VERIFY (reopen over the restored log; state survived EXACTLY)
// ---------------------------------------------------------------------------

phase("verify-reopen", (detail) => {
  const restored = newService(livePath);
  const durability = restored.durability();
  detail.durability = durability;

  // §2.3 step 1: snapshots >= 1, tornLines explained (0 on a clean backup).
  check("restore: 10 snapshots re-folded, 0 torn lines on the clean backup", durability.snapshots === 10 && durability.tornLines === 0, durability);

  // §2.3 step 2: the customer view survived EXACTLY (write-before-ack replay).
  const view = restored.getCustomerView(PRINCIPAL);
  assert.deepEqual(view, JSON.parse(JSON.stringify(reference.view)), "customer view survived the restore EXACTLY");

  // §2.3 step 2 (order lifecycle): the group-purchase card carries the exact
  // order machine state reached before the failure.
  const orderCard = view.groupPurchases.find((card) => card.requestId === REQUEST_ID);
  assert.ok(orderCard !== undefined, "restored view exposes the seeded request");
  assert.equal(orderCard.orderState, "ORDERED", "order lifecycle state survived EXACTLY (PLACE_ORDER → ORDERED)");
  assert.equal(orderCard.committedParticipants, 1, "commitment accounting survived");
  assert.equal(view.resources.length, 1, "enrolled resource survived");
  assert.equal(view.organizations.length, 1, "organization membership survived");
  check("restore: order lifecycle state survived EXACTLY", orderCard.orderState === "ORDERED", {
    requestId: REQUEST_ID,
    orderState: orderCard.orderState,
  });
  check("restore: consent state survived (resource share)", view.resources[0]?.share === reference.resourceShare, {
    share: view.resources[0]?.share,
  });

  // §2.3 step 3: cross-tenant aggregate readable by the configured operator.
  const operatorView = restored.getOperatorView(OPERATORS[0]);
  assert.equal(operatorView.applied, true, "operator role config survives (deployment config, not state)");
  check("restore: operator aggregate view available to the configured operator", operatorView.applied === true);

  // §2.3 step 4: an unconfigured principal is REFUSED — roles fail closed.
  const refused = restored.getOperatorView(PRINCIPAL);
  assert.equal(refused.applied, false, "customer must be refused the operator view after restore");
  assert.ok((refused.reason ?? "") !== "", "refusal carries a reason");
  check("restore: role gating fails closed after restore (customer refused)", refused.applied === false, {
    reason: refused.reason,
  });

  // §2.3 step 5: one benign write proves the restored instance is WRITABLE,
  // and write-before-ack is re-proven (the log grows BEFORE the ack spreads).
  const linesBefore = lineCount(livePath);
  const pause = restored.applyConsentEvent(PRINCIPAL, RESOURCE_ID, "PAUSE");
  assert.equal(pause.applied, true, "benign write (consent PAUSE) applied on the restored instance");
  assert.equal(lineCount(livePath), linesBefore + 1, "log grew by exactly one snapshot on the applied write");
  const pauseLines = lineCount(livePath);
  const resume = restored.applyConsentEvent(PRINCIPAL, RESOURCE_ID, "RESUME");
  assert.equal(resume.applied, true, "consent RESUME applied");
  assert.equal(lineCount(livePath), pauseLines + 1, "second benign write also appended before ack");
  const shareAfter = restored.getCustomerView(PRINCIPAL).resources.find((r) => r.resourceId === RESOURCE_ID)?.share;
  assert.equal(shareAfter, "SHARED", "consent machine round-trips over the restored store");
  check("restore: instance writable + write-before-ack (benign write grew the log before ack)", true, {
    lines_before: linesBefore,
    lines_after_pause: pauseLines,
    lines_after_resume: lineCount(livePath),
  });

  // Restart over the post-write log: the NEW write also survives a restart.
  const postWrite = newService(livePath);
  assert.equal(postWrite.durability().snapshots, 12, "12 snapshots after two benign writes");
  assert.equal(
    postWrite.getCustomerView(PRINCIPAL).resources.find((r) => r.resourceId === RESOURCE_ID)?.share,
    "SHARED",
    "benign writes survive a further restart",
  );
  check("restore: post-restore writes survive a further restart", true);
});

// ---------------------------------------------------------------------------
// Phase 6 — REPORT
// ---------------------------------------------------------------------------

report.finished_at = new Date().toISOString();
report.verdict = failures.length === 0 ? "PASS" : "FAIL";
report.failures = failures;
const totalMs = Number(report.phases.reduce((sum, p) => sum + p.ms, 0).toFixed(3));
report.total_ms = totalMs;

writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
if (options.report) {
  const reportTarget = resolve(options.report);
  mkdirSync(dirname(reportTarget), { recursive: true });
  writeFileSync(reportTarget, JSON.stringify(report, null, 2) + "\n");
}

process.stdout.write(
  `[restore-drill] verdict ${report.verdict} in ${totalMs} ms — report ${reportPath}` +
    (options.report ? ` (+ ${resolve(options.report)})` : "") + "\n",
);

if (!explicitOut && !options.keep) {
  rmSync(workspace, { recursive: true, force: true });
  process.stdout.write("[restore-drill] default temp workspace cleaned (--keep to preserve; --out to pin)\n");
}

process.exitCode = report.verdict === "PASS" ? 0 : 1;
