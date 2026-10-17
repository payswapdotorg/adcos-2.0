# P5-W1 Report — Deployment and Production Readiness

Work order: `## P5-W1` in `spec/work-orders.md`.
Executor: lane **p5w1** (worker packet; branch `work/p5-w1/deployment-readiness`
off base `d4d4436` — P5-W2 merged, per the dispatch order).
Date: 2026-10-17. All numbers below are REAL (command + transcript cited);
anything the sandbox could not execute is labeled **PENDING-station** with the
exact command. Nothing is fabricated.

## Verdict per task

| Task | Deliverable | Label | Evidence |
| --- | --- | --- | --- |
| P5W1-0 | Governance first | **PROVEN** | frontier `["P4-W2","P5-W1"]`, P5-W1 `IN_PROGRESS` active entry, spec checker exit 0 |
| P5W1-1 | Environment contracts | **PROVEN** | `ops/environments/**` + `scripts/ops/check-secrets.mjs` (real run + negative fixture) |
| P5W1-2 | Restore + rollback | **PROVEN** | `scripts/ops/restore-drill.mjs` verdict PASS (real transcript); `ops/drills/**`; `scripts/ops/run-drills.mjs` |
| P5W1-3 | Monitoring | **PROVEN** | `ops/monitoring/**` + `scripts/ops/health-probe.mjs` (all 4 verdict paths executed) |
| P5W1-4 | Incident/retention/costs | **PROVEN** (docs) with **PENDING-station** memory measurement | `ops/incident/**`, `ops/retention/README.md`, `ops/costs/README.md`, `docs/runbooks/incident-playbook.md` |
| P5W1-5 | Onboarding runbooks | **PROVEN** (docs; commands re-executed where possible) | `docs/runbooks/**` |
| P5W1-6 | Staging & release gate | **PROVEN** | `scripts/ops/release-gate.mjs` 9/9 PASS incl. real-UI staging + bridge round-trip |
| P5W1-7 | Gates | **PROVEN** | `evidence/gates.txt` (real transcripts, real exit codes) |

## P5W1-0 — Governance (PROVEN)

- `spec/development-state/current-state.json`: frontier → `["P4-W2", "P5-W1"]`
  (P4-W2 FIRST, order matters); `active_work_orders` gained the P5-W1 entry
  (id / status IN_PROGRESS / evidence, per existing schema style — evidence
  filled at delivery with the real artifacts below). The `status` prose was
  updated to keep the file self-consistent with the frontier change — the
  one derived edit beyond the letter of the scope note, called out here.
- `spec/work-orders.md`: ONLY the existing `## P5-W1` section extended with
  owned paths + the honesty law. No new sections; 12 unique work orders
  preserved (checker-verified).
- `node scripts/check-project-spec.mjs` → **PASSED (exit 0)** — 15 required
  files; 5 locked sections; 12 unique work orders; frontier valid.

## P5W1-1 — Environment contracts (PROVEN)

Files: `ops/environments/README.md` (contract law),
`ops/environments/contracts.json` (machine-readable),
`ops/environments/matrix.md` (human bindings).

- Every runtime input of the SHIPPED product enumerated, typed, owned,
  sourced: `surfaces.statePath`, `surfaces.now` (injected clock),
  `surfaces.operatorPrincipals`, `surfaces.developerPrincipals`,
  `desktop.userDataPath`, `desktop.mainLog`, frozen constants
  (`adcos:request`, `__adcos_bridge__`, local principals, window policy),
  plus the P5-W1 ops tool CLI inputs.
- **The no-env-var law is PROVEN by static scan**: zero
  `process.env`/`import.meta.env`/dotenv reads in `apps/desktop-adcos/src`
  and `packages/product-web/src` (transcript in §Gates). Staging vs
  production differ by BINDINGS only — the repo has no env-flag mechanism,
  stated as such.
- Substrate surfaces (`config/default.json`,
  `config/provider/zcode-builtin.json`) enumerated with their REAL
  consumers (inherited substrate tooling) and explicit NOT-consumed-by-
  product notes; provider config keys (templateIds, access types,
  baseUrls, builtinModelIds) carried in `contracts.json`.
- **Credentials isolation law**: secrets never in repo / JSONL / logs;
  each declared secret carries its injection channel (env var / OS
  keyring / file 0600) in `contracts.json`.
- Gate `scripts/ops/check-secrets.mjs`: 7 secret patterns + credential-file
  name pass + contracts 0600 law, over TRACKED files.
  - Real run: **PASSED, exit 0** — 7313 tracked files, 7220 text files
    scanned, 43,162,882 bytes, 1 documented sanitizer exemption
    (`packages/shared/src/feedbackPrivacy.ts` — redaction regex,
    exemption re-verified against its cited reason).
  - Negative fixture (separate git repo with a planted `ghp_…` token):
    **FAILED, exit 1** with the finding named — detection verified.
  - Wired into the release-gate checklist (`docs/runbooks/release-gate.md`
    + gate step 2), NOT into package.json (scope law).

## P5W1-2 — Restore drill + rollback doctrine (PROVEN)

Files: `scripts/ops/restore-drill.mjs`, `ops/drills/restore-drill.md`,
`ops/drills/rollback.md`, `scripts/ops/run-drills.mjs`.

The drill is REAL and executed against the REAL durable store — the public
`createSurfacesService` from `packages/surfaces/src/contract.ts` (loaded
via `node --import tsx`; verified importable from a root-level script
before writing the drill):

1. **SEED** — full journey (enroll `res-drill-1` → consent OPT_IN →
   observation → Lab evaluation (PURSUE) → org formation → group purchase →
   offer → commitment → AUTHORIZE → **PLACE_ORDER** with the opaque payment
   reference per ADR-0004): 10/10 commands applied, log grew to 10 lines
   (write-before-ack).
2. **SNAPSHOT** — backup copy, sha256 `3a3f719e…d2a2` (15,764 B),
   re-hash-verified, every line parses.
3. **CORRUPT** — (a) torn tail appended: detected (`tornLines: 1`), skipped,
   fold reproduces the reference view EXACTLY; (b) total loss: the live log
   destroyed; the service reopens EMPTY (fails honest — no invented state).
4. **RESTORE** — backup copied over the live log; hash byte-identical.
5. **VERIFY** — reopened service: customer view **deep-equal** to the
   pre-failure reference; order state **`ORDERED`** exactly; operator
   aggregate available; customer REFUSED the operator view (roles fail
   closed after restore); the restored instance is WRITABLE (benign consent
   PAUSE/RESUME grew the log 10→11→12 before ack) and the new writes
   survive a further restart.
6. **REPORT** — `drill-report.json` with per-phase timings; total 12–16 ms
   in-sandbox (recorded, not extrapolated).

Real transcript: `evidence/gates.txt` §restore drill; committed report:
`evidence/restore-drill-report.json` (verdict PASS).

Runbook (`ops/drills/restore-drill.md`): production usage, cadence
(every release via the gate; operator monthly + before
state-store-adjacent upgrades, against a COPY), pass/fail meaning,
escalation (SEV-2 path), and the honest scope: **control-plane state
durability only — NOT live provider recovery, NOT payment settlement
(ADR-0004 badge)**.

Rollback doctrine (`ops/drills/rollback.md`): product releases are the
GitHub Release + deb/AppImage artifacts; rollback =
**pin-to-previous-release-version** (`sudo apt install
adcos-desktop_1.0.0_amd64.deb` over the new one; AppImage = run the old
file); state file compatibility policy stated honestly (append-only log =
forward-compat reads by the structural shape guard; write-side rollback
N/A for a single-node JSONL; **no multi-node state topology exists to roll
back** — said explicitly); operator decision procedure with state backup
first.

`scripts/ops/run-drills.mjs`: wrapper ran — **all 1 drill(s) passed**,
exit 0.

## P5W1-3 — Monitoring (PROVEN)

Files: `ops/monitoring/health-contracts.md`, `ops/monitoring/alerts.md`,
`scripts/ops/health-probe.mjs`.

- HEALTHY defined per shipped surface: desktop app (main process up /
  renderer loaded / IPC bridge responsive — with the honest limit that a
  static probe cannot prove "up right now"), surfaces service (JSONL
  writable, replay-on-load consistent, clock injected), release channel
  (assets anonymously reachable).
- UNKNOWN/STALE/DEGRADED triad (INVARIANTS #5) mapped to operational
  signals with response rules; store-plane verdicts kept distinct
  (HEALTHY / FRESH / DEGRADED / UNHEALTHY); process-plane mapping; the
  provider plane stays UNKNOWN by construction (never inferred from
  timeouts).
- `scripts/ops/health-probe.mjs` — all four verdict paths executed FOR
  REAL: HEALTHY (drill fixture) exit 0; FRESH (absent state file) exit 0;
  DEGRADED (torn tail appended) exit 2; UNHEALTHY (garbage file) exit 1.
  Rehydration check constructs the REAL service over a TEMP COPY (zero
  writes to the probed file; read-only role-gated query proves the
  instance answers). Release-channel mode probes the three v1.0.0 assets
  anonymously (HEAD, no credentials).
- Alerts A-1…A-11 with severity, symptom, detection, runbook cross-links;
  honest scope note: single-node desktop product — local-first monitoring
  (logs + OS-level + probe), **no cluster telemetry claimed**.

## P5W1-4 — Incident/support, retention/privacy, cost bounds

Files: `ops/incident/README.md`, `ops/incident/severity-matrix.md`,
`docs/runbooks/incident-playbook.md`, `ops/retention/README.md`,
`ops/costs/README.md`.

- **Incident/support**: intake = GitHub issues (the channel that exists
  TODAY); severity SEV-1..SEV-5 with honest best-effort response
  expectations (no 24/7 on-call claimed — there is no service to page);
  diagnostics collection WITHOUT secrets (probe output + redacted excerpt
  by default; full JSONL only when reproduction is blocked, transported
  privately); escalation to operator with the ADR-0004 badge; postmortem
  template.
- **Retention/privacy**: what the JSONL contains (journey rows; **opaque
  payment references only, no live payment data, no credentials by
  construction** — P4-W1 secrets battery cited); where it lives per OS;
  user-controlled deletion: **delete the file = full erasure of the domain
  state**, verified against the store implementation (single-file store;
  constructor treats absent file as fresh start — exercised by the drill's
  total-loss phase). The EXACT remainder list is stated: POSIX freed-block
  semantics, OS trash if deleted via file manager, operator-made backups,
  `main.log` lines, Chromium cache dirs (no domain data); full clean
  uninstall = remove the whole userData dir. Backups inherit the same
  retention.
- **Cost bounds**: MEASURED (P5-W2 + this lane): renderer 226.48 kB JS +
  19.84 kB CSS; deb 80,365,602 B; AppImage 116,792,135 B; state growth
  from the real drill fixture: 10 commands → 15,764 B total, first
  snapshot 416 B, last 2,596 B (+524%), mean 1,576.4 B; ESTIMATE-labeled
  extrapolation (heavy user ≈ single-digit MB; snapshot amplification risk
  cited). App memory/CPU: **PENDING-station** (real-GPU host run:
  `pidstat -p <main> 1 10` — the sandbox smoke was Xvfb/`--disable-gpu`
  without RSS instrumentation; no number invented). Live provider costs,
  payment rail fees, provider-hardware economics: **UNKNOWN —
  BLOCKED-ON-OPERATOR (ADR-0004)** — listed as UNKNOWN, never estimated
  as if known.

## P5W1-5 — Onboarding runbooks (PROVEN as docs)

`docs/runbooks/developer-onboarding.md` (clone → pinned toolchain →
install `--ignore-scripts` → governance gates → the P5-W2 gate suite →
desktop build + battery → P5-W1 ops layer → truth sources); 
`docs/runbooks/operator-onboarding.md` (non-developer: deb/AppImage
install, SHA256SUMS verification, state location, probe + drill usage,
honest UNKNOWN/STALE/DEGRADED reading, ADR-0004 badge meaning, backup,
rollback, escalation); `docs/runbooks/release-gate.md` (the 14-item
checklist: hard vs PENDING-station rules, one-command runner,
post-publish verification).

## P5W1-6 — Staging & release gate (PROVEN)

`scripts/ops/release-gate.mjs` — the executable checklist. Real run:

```
[release-gate] spec checker: PASS
[release-gate] secrets check: PASS
[release-gate] restore drill fresh pass: PASS
[release-gate] health probe on the drill fixture: PASS
[release-gate] staging through the real UI (built product-web + real bridge round-trip): PASS
[release-gate] architecture check: PASS
[release-gate] product lint: PASS
[release-gate] product typechecks: PASS
[release-gate] desktop battery: PASS
[release-gate] verdict PASS — 9/9 steps PASS, 4 PENDING-station item(s), 0 hard failure(s) — exit 0
```

**The staging step is real end-to-end**: the BUILT `packages/product-web/dist`
(built per the P5-W2 invocation — 226.48 kB JS, byte-identical bundle name
`index-BucO_Wye.js`) served over loopback HTTP; headless chromium
(playwright-core 1.59.1, chromium-1200, 1280×840 viewport);
`window.__adcos_bridge__` injected before page scripts and routed to the
REAL desktop router (`apps/desktop-adcos/src/main/router.ts`) over the REAL
`DesktopSession` and REAL `createSurfacesService` on a staging state file
seeded from the drill fixture (10 snapshots). Asserted: 7 panels render;
ADR-0004 badge in the header; identity panel shows `ada@local` + the
durability card; resources panel renders the seeded `res-drill-1`; group
purchase renders `req-drill-1` with the **ORDERED** chip; then ONE REAL
bridge round-trip — the enroll form filled and submitted → `res-gate-1`
appears as a visible resource row AND the staging state file grew
**10 → 11 snapshots** with the folded snapshot containing the enrolled
resource (write-before-ack persisted through the whole bridge stack).
Evidence: `evidence/staging-{identity,resources,purchase,enroll-roundtrip}.png`
(4 valid 1280×840 PNGs, machine-verified) + step detail in
`evidence/release-gate-report.json`.

Transport honesty (also embedded in the gate report): the CDP page binding
replaces the Electron IPC channel only; the bridge contract, router,
session, service and durable store are the REAL shipped wiring — the
Electron IPC/preload layer itself stays covered by the P5-W2
packaged-app smoke (real Electron, real IPC, Xvfb+CDP).

**PENDING-station items reported by the gate (with exact commands):**
1. `cd apps/desktop-adcos && pnpm package:linux && sha256sum release/adcos-desktop_1.0.0_amd64.deb release/adcos-desktop-1.0.0-x86_64.AppImage > SHA256SUMS.md` — release-time packaging at the station.
2. `node --import tsx scripts/ops/health-probe.mjs --release-channel adcos-desktop-v<version>` — anonymous download verification AFTER publish.
3. Operator real-GPU packaged-app smoke on the Ubuntu machine (install, launch, 7 panels + enroll round-trip).
4. Governance updates at acceptance (current-state + work-orders evidence) — TL-owned.

## P5W1-7 — Gates (real commands, real output)

Full transcripts: `docs/reports/deployment/evidence/gates.txt`.
Summary (all real exit codes):

| Command | Result |
| --- | --- |
| `node scripts/check-project-spec.mjs` | **PASSED, exit 0** (15 files; 5 locked sections; 12 unique work orders) |
| `pnpm architecture:check` | **exit 0 — violations: 0, baseline: 0, new: 0** (no new modules added by this lane — non-managed `ops/**`/`scripts/ops/**` paths only) |
| `pnpm lint` | **exit 0, 0 errors** (repo-wide; inherited warnings unchanged). Lane-owned files: `npx oxlint scripts/ops` → **0 warnings, 0 errors** after cleanup |
| `node --import tsx scripts/ops/restore-drill.mjs` | **verdict PASS, exit 0** (real transcript above) |
| `node scripts/ops/run-drills.mjs` | **all 1 drill(s) passed, exit 0** |
| `node scripts/ops/check-secrets.mjs` | **PASSED, exit 0** (7313 tracked files) |
| `node --import tsx scripts/ops/health-probe.mjs --state <fixture>` | **HEALTHY, exit 0** |
| `node --import tsx scripts/ops/release-gate.mjs` | **PASS, exit 0** (9/9 steps, 4 PENDING-station, 0 hard failures) |
| `npx oxlint packages/product-web apps/desktop-adcos` | **0 warnings, 0 errors** (gate step) |
| product tsc (product-web + desktop-adcos) | **exit 0 / exit 0** (gate step) |
| desktop battery | **3/3 pass** (gate step) |

No tsc needed for this lane (no .ts/.tsx files added — ops scripts are
`.mjs` on purpose; verified: `git status` shows no TS additions).

## BLOCKERS / GAPs

- **No BLOCKERS.** No source change was required anywhere (the restore
  drill, probe, secrets gate and staging all worked against the frozen
  public contracts as-is).
- GAP (inherited, documented not fixed): memory/CPU bounds of the packaged
  app unmeasured in-sandbox → PENDING-station command recorded in
  `ops/costs/README.md`.
- GAP (by mandate): live provider / payment rail / physical-device
  everything remains **BLOCKED-ON-OPERATOR (ADR-0004, P4-W2)** — this lane
  never claims it (acceptance law quoted in the work-order extension).
- Cosmetic: the `status` prose field of `current-state.json` was edited in
  addition to the frontier/active-entry (to keep the file self-consistent);
  flagged here for TL review since the scope note named only frontier +
  active entry.

## File manifest (all additive; owned paths only)

```
ops/environments/README.md            ops/monitoring/health-contracts.md
ops/environments/contracts.json       ops/monitoring/alerts.md
ops/environments/matrix.md            ops/retention/README.md
ops/incident/README.md                ops/costs/README.md
ops/incident/severity-matrix.md       ops/drills/restore-drill.md
ops/drills/rollback.md
scripts/ops/check-secrets.mjs         scripts/ops/restore-drill.mjs
scripts/ops/health-probe.mjs          scripts/ops/run-drills.mjs
scripts/ops/release-gate.mjs
docs/runbooks/developer-onboarding.md
docs/runbooks/operator-onboarding.md
docs/runbooks/incident-playbook.md
docs/runbooks/release-gate.md
docs/reports/deployment/p5w1-report.md (this file)
docs/reports/deployment/evidence/gates.txt
docs/reports/deployment/evidence/restore-drill-report.json
docs/reports/deployment/evidence/release-gate-report.json
docs/reports/deployment/evidence/staging-identity.png
docs/reports/deployment/evidence/staging-resources.png
docs/reports/deployment/evidence/staging-purchase.png
docs/reports/deployment/evidence/staging-enroll-roundtrip.png
spec/development-state/current-state.json   (frontier + active entry + status prose)
spec/work-orders.md                          (P5-W1 section extension only)
```

Zero edits to: package.json (any), architecture-policy.yaml, any
`packages/**` or `apps/**` source, any test, any config. Frozen contract
names untouched.
