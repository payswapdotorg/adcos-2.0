# P5-W1 — Rollback Doctrine

Owner: lane p5w1 (work order `## P5-W1`). Scope: the SHIPPED product
releases of P5-W2 — GitHub Release `adcos-desktop-v*` carrying
`adcos-desktop_<version>_amd64.deb`, `adcos-desktop-<version>-x86_64.AppImage`,
`SHA256SUMS.md`, `INSTALL-UBUNTU.md` (v1.0.0 published 2026-10-16).

## The rollback unit is the RELEASE VERSION (pin-to-previous)

There is no cluster, no server fleet, no database migration to roll back.
The product is a single-node desktop app; "rollback" means: **pin the
operator's machine back to the previous release version of the app**.

### deb path (Ubuntu, the shipped install path)

```bash
# current (e.g. 1.1.0) is bad — pin to the previous release:
sudo apt install ./adcos-desktop_1.0.0_amd64.deb   # downgrades over the new install
# verify:
dpkg -l adcos-desktop | tail -1
sha256sum -c SHA256SUMS.md   # against the v1.0.0 file from the GitHub Release
```

`apt install ./file.deb` of an older version performs the downgrade (dpkg
replaces the package; app dirs are version-independent). If apt refuses the
downgrade path in a future toolchain, `sudo dpkg -i
adcos-desktop_1.0.0_amd64.deb` is the direct equivalent.

### AppImage path

AppImages are self-contained per-version files: keep the previous version's
AppImage on disk (e.g. `~/Applications/adcos-desktop-1.0.0-x86_64.AppImage`)
and launch it directly. No install step exists to reverse — rollback is
"run the old file", which is why the operator runbook recommends NOT
deleting the previous AppImage until the new one is verified.

### State is NOT rolled back (and must not be)

The durable state (`~/.config/adcos-desktop/state/adcos-state.jsonl`) is
append-only JSONL written by the CURRENT app version. Rolling the app back
does not touch it, and must not: user journey state is the operator's data.

## Version-to-version state compatibility policy (honest)

- **Reads are forward-compatible by construction**: the store folds the log
  on load and accepts any line that `isSurfaceStateLike` (all ten
  top-level arrays present); a NEWER app reading an OLDER log works
  because the shape guard is structural, not version-pinned. This is a
  design property of the frozen surface — labeled **PROVEN-as-design** in
  `docs/reports/security/backup-restore-load-plan.md` (§5.1 vocabulary);
  the restore drill exercises exact-shape replay, not cross-version shape
  evolution.
- **An OLDER app reading a NEWER log**: also folds (last intact
  parseable+shaped snapshot wins) — unknown EXTRA fields are preserved by
  JSON parse and ignored by the older projections. However, once a newer
  version has WRITTEN snapshots a rollback cannot interpret semantically,
  the honest statement is: the older app will still fold and serve the
  rows it recognizes; it does not validate fields it does not know. For
  v1.x (single store shape) this is equivalent to full compatibility.
- **Write-side rollback: N/A by design.** The store is a single-node
  append-only log — there is no write topology to roll back, no
  distributed epoch, no compaction to reverse. The only write-side risk is
  a new version writing shapes that older versions mis-read; the release
  gate's staging step (real UI over a seeded state file) plus the drill's
  shape-guard assertions are the mitigation.
- **There is no multi-node state topology to roll back.** This is a
  single-node desktop product; any future multi-instance coordination
  state (coordination inbox/outbox) is a different store with its own
  runbook — NOT covered by this doctrine, and honest about it.

## Rollback decision procedure (operator)

1. Symptom reported (GitHub issue) → triage per
   `ops/incident/severity-matrix.md`.
2. If a workaround exists → apply it; keep the version.
3. If the current release breaks a core journey (enroll / consent /
   purchase / state fold) and no workaround exists:
   a. pin back to the previous release version (deb or AppImage path
      above);
   b. BEFORE launching the old version, back up state:
      `cp -a ~/.config/adcos-desktop/state ./state-pre-rollback-$(date +%s)`;
   c. verify with the health probe:
      `node --import tsx scripts/ops/health-probe.mjs --state
      ~/.config/adcos-desktop/state/adcos-state.jsonl` → HEALTHY/DEGRADED
      (not UNHEALTHY);
   d. run the drill's post-restore verification vocabulary (§2.3 of the
      backup/restore plan) against the live view: enroll a test resource,
   read it back, then REVOKE it (leaves the state consistent).
4. Escalate to the repo (GitHub issue, severity label) — include the app
   version, probe verdict, and whether state was backed up.

## What rollback does NOT cover (labeled)

- **Live provider/payment state**: BLOCKED-ON-OPERATOR (ADR-0004); no
  rail exists to roll back. Never approximated with fake success.
- **The substrate ZCode app**: not shipped by this product
  (product-locked); out of scope by construction.
- **Data repair beyond snapshot restore**: if the log itself is corrupted
  in a way the fold cannot survive, the recovery is
  restore-from-snapshot (the drill's procedure) — the snapshot cadence is
  therefore part of rollback readiness: the operator runbook recommends
  a daily copy of the JSONL (cron) into a rotation of 7.
