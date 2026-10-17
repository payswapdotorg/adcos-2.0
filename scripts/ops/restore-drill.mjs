#!/usr/bin/env node
/**
 * restore-drill.mjs — P5-W1 Task P5W1-2: the REAL restore drill against
 * the REAL durable store (SurfacesService over JsonlSurfaceStateStore).
 *
 * Phases (ops/drills/restore-drill.md is the runbook):
 *   1. SEED    — a full customer journey (enroll → consent → observe →
 *                Lab evaluation → founding → group purchase → offer →
 *                commitment → order lifecycle to RECONCILED) through the
 *                public SurfacesService contract.
 *   2. SNAPSHOT— copy the JSONL log; record sha256 + line count + the
 *                asserted customer-view state.
 *   3. FAIL    — corrupt the live log the way real disks do (torn final
 *                line + junk appended).
 *   4. RESTORE — put the snapshot back over the live path.
 *   5. REOPEN  — a NEW service instance over the restored log; assert the
 *                journey state survived EXACTLY (write-before-ack replay).
 *   6. REPORT  — machine-readable verdict with timings; exit non-zero on
 *                any drill failure.
 *
 * Run: node --import tsx scripts/ops/restore-drill.mjs [--out <report.json>]
 *
 * Scope honesty (ADR-0004): this drill proves CONTROL-PLANE state
 * durability and restore procedure. It is NOT live-provider recovery and
 * proves nothing about payment rails (BLOCKED-ON-OPERATOR).
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Public contract entrypoint of @adcos/surfaces (scripts/ is not a managed
// module; this file IS the package's public API — no deep import).
import { createSurfacesService } from "../../packages/surfaces/src/contract.ts";

const FIXED_NOW = 1_800_000_000_000;
const ACTOR = "ada@local";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;
const t0 = performance.now();
const timings = {};
const failures = [];

function must(cond, label) {
  if (!cond) {
    failures.push(label);
    throw new Error(`drill assertion failed: ${label}`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function openService(statePath) {
  return createSurfacesService({
    statePath,
    now: () => FIXED_NOW,
    operatorPrincipals: ["ops@local"],
    developerPrincipals: ["dev@local"],
  });
}

/** The full journey through the PUBLIC service methods (router-parity). */
function runJourney(service) {
  const steps = [];
  const step = (label, result) => {
    must(result && result.applied === true, `${label} applied (got: ${JSON.stringify(result).slice(0, 160)})`);
    steps.push(label);
    return result;
  };
  step("enrollResource", service.enrollResource(ACTOR, {
    id: "res-drill-1", device: "device-drill", type: "phone",
    capability: "tether/4g", modes: ["hotspot"], limits: { concurrent: 2 },
  }));
  step("consent OPT_IN", service.applyConsentEvent(ACTOR, "res-drill-1", "OPT_IN"));
  step("observe", service.recordObservation(ACTOR, "res-drill-1", { status: "UNKNOWN", declaredVersion: "1" }));
  step("runLabEvaluation", service.runLabEvaluation({
    id: "eval-drill-1", intent: "connectivity.cost.reduction",
    baseline: { strategy: "baseline-status-quo", cost: 120, reliability: 0.9 },
    alternatives: [{ strategy: "pooled-provider-plan", cost: 80, reliability: 0.92 }],
    selectedStrategy: "pooled-provider-plan", confidence: 0.8, assumptions: ["measured window only"],
  }));
  step("formOrganization", service.formOrganization(ACTOR, {
    organization: "org-drill", pursuitEvidenceId: "eval-drill-1-opportunity",
    candidates: [{ principal: ACTOR, consent: true, consentRecordedAt: FIXED_NOW }],
    minFounders: 1, authorityScope: "group.purchase",
    initialMandates: [{ principal: ACTOR, scope: "group.purchase", permissions: ["commit"] }],
  }));
  step("openGroupPurchase", service.openGroupPurchase(ACTOR, {
    id: "req-drill", intent: "connectivity.group-plan", organization: "org-drill",
    requirements: { quantity: 1 }, threshold: 1, expiresAt: FIXED_NOW + 3_600_000,
  }));
  step("receiveOffer", service.receiveOffer(ACTOR, {
    id: "offer-drill", request: "req-drill", supplier: "provider-a",
    product: "group-connectivity-plan", capability: "tether/4g", region: "accra",
    quantity: 1, perMemberCost: 40, totalCost: 40,
    recurringCharges: [{ amount: 40, frequency: "monthly", description: "pooled" }],
    oneTimeCharges: [{ amount: 0, description: "setup" }],
    term: "12 months", limitations: ["fair-use"], expiry: FIXED_NOW + 86_400_000,
    provenance: "drill:supplier-terms",
  }));
  step("commitToPurchase", service.commitToPurchase(ACTOR, { requestId: "req-drill", allocation: { share: 1 } }));
  step("advance AUTHORIZE", service.advancePurchaseOrder(ACTOR, { requestId: "req-drill", event: "AUTHORIZE" }));
  step("advance PLACE_ORDER", service.advancePurchaseOrder(ACTOR, {
    requestId: "req-drill", event: "PLACE_ORDER",
    paymentReference: {
      id: "payref-drill", type: "opaque",
      authority: "authorized-financial-authority (role, unselected rail)",
      created: FIXED_NOW, settled: false,
    },
  }));
  step("advance CONFIRM_CONTRACT", service.advancePurchaseOrder(ACTOR, { requestId: "req-drill", event: "CONFIRM_CONTRACT" }));
  step("advance MARK_FULFILLED", service.advancePurchaseOrder(ACTOR, { requestId: "req-drill", event: "MARK_FULFILLED" }));
  step("advance RECONCILE", service.advancePurchaseOrder(ACTOR, { requestId: "req-drill", event: "RECONCILE", usageEvidenceComplete: true }));
  return steps;
}

/** The exact state the restore must preserve (view rows). */
function captureState(service) {
  const view = service.getCustomerView(ACTOR);
  const json = JSON.stringify(view);
  return {
    viewSha256: createHash("sha256").update(json).digest("hex"),
    summary: {
      resources: view.resources.length,
      resourceIds: view.resources.map((r) => r.resourceId ?? r.id).sort(),
      organizations: view.organizations.map((o) => o.organization).sort(),
      groupPurchases: view.groupPurchases.map((p) => p.id ?? p.requestId ?? String(p)).sort(),
      opportunities: view.opportunities.map((o) => o.id).sort(),
      viewBytes: json.length,
    },
  };
}

try {
  // --- Phase 1: SEED ---------------------------------------------------------
  let t = performance.now();
  const dir = mkdtempSync(join(tmpdir(), "adcos-restore-drill-"));
  const liveLog = join(dir, "adcos-state.jsonl");
  const snapshot = join(dir, "snapshot-adcos-state.jsonl");
  const seeder = openService(liveLog);
  const steps = runJourney(seeder);
  const seededState = captureState(seeder);
  timings.seedMs = Math.round(performance.now() - t);
  const seededDurability = seeder.durability();

  // --- Phase 2: SNAPSHOT -----------------------------------------------------
  t = performance.now();
  copyFileSync(liveLog, snapshot);
  const snapshotSha = sha256(snapshot);
  const snapshotBytes = statSync(snapshot).size;
  const snapshotLines = readFileSync(snapshot, "utf-8").split("\n").filter(Boolean).length;
  timings.snapshotMs = Math.round(performance.now() - t);
  must(snapshotBytes > 0 && snapshotLines >= steps.length, `snapshot has content (${snapshotLines} lines, ${snapshotBytes} B)`);

  // --- Phase 3: FAIL (corrupt the live log like a real disk does) ------------
  t = performance.now();
  const original = readFileSync(liveLog, "utf-8");
  const torn = original.slice(0, Math.floor(original.length * 0.8)) + '\n{"torn":"truncation-simulat'; // torn final line
  writeFileSync(liveLog, torn);
  appendFileSync(liveLog, "\n\x00\x01garbage-not-json"); // junk block
  timings.failMs = Math.round(performance.now() - t);
  must(sha256(liveLog) !== snapshotSha, "live log actually corrupted (hash differs)");

  // --- Phase 4: RESTORE -----------------------------------------------------
  t = performance.now();
  copyFileSync(snapshot, liveLog);
  const restoredSha = sha256(liveLog);
  timings.restoreMs = Math.round(performance.now() - t);
  must(restoredSha === snapshotSha, "restored log hash EXACTLY matches snapshot");

  // --- Phase 5: REOPEN (new instance over the restored log) ------------------
  t = performance.now();
  const reopened = openService(liveLog);
  const reopenedState = captureState(reopened);
  const reopenedDurability = reopened.durability();
  timings.reopenMs = Math.round(performance.now() - t);
  must(reopenedState.viewSha256 === seededState.viewSha256, "customer view EXACTLY equal after restore (view sha256)");
  must(
    JSON.stringify(reopenedState.summary) === JSON.stringify(seededState.summary),
    `summary equal (resources/purchases/ids): ${JSON.stringify(reopenedState.summary)} vs ${JSON.stringify(seededState.summary)}`
  );
  must(
    reopenedDurability.snapshots === seededDurability.snapshots && reopenedDurability.tornLines === 0,
    `durability stats survive (snapshots ${reopenedDurability.snapshots}==${seededDurability.snapshots}, tornLines 0 after clean restore)`
  );

  // --- Phase 6: REPORT -------------------------------------------------------
  const report = {
    drill: "restore-drill",
    workOrder: "P5-W1",
    verdict: "PASS",
    phases: {
      seed: { steps: steps.length, journey: steps },
      snapshot: { sha256: snapshotSha, bytes: snapshotBytes, lines: snapshotLines },
      fail: { simulated: "torn final line + junk appended (80% truncation)" },
      restore: { sha256: restoredSha, exactMatch: restoredSha === snapshotSha },
      reopen: {
        viewSha256Match: reopenedState.viewSha256 === seededState.viewSha256,
        summary: reopenedState.summary,
      },
    },
    timings,
    totalMs: Math.round(performance.now() - t0),
    scope: "control-plane state durability only; NOT live-provider recovery (ADR-0004: BLOCKED-ON-OPERATOR)",
    fixtureDir: dir,
  };
  const line = JSON.stringify(report, null, 2);
  console.log(line);
  if (OUT) writeFileSync(OUT, line + "\n");
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
} catch (error) {
  const report = {
    drill: "restore-drill",
    workOrder: "P5-W1",
    verdict: "FAIL",
    failures: failures.length ? failures : [String(error?.message ?? error)],
    timings,
    totalMs: Math.round(performance.now() - t0),
    scope: "control-plane state durability only; NOT live-provider recovery (ADR-0004: BLOCKED-ON-OPERATOR)",
  };
  console.error(JSON.stringify(report, null, 2));
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  process.exit(1);
}
