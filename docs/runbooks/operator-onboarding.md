# P5-W1 — Operator Onboarding Runbook (non-developer)

For the operator installing and running the ADCOS Desktop product
(ADCOS 2.0 — Connectivity OS) on Ubuntu. No development toolchain needed
beyond the probe/drill scripts (a plain Node.js 24+ install).

## 1. Install (Ubuntu x64)

Option A — deb (recommended):

```bash
# from the GitHub Release adcos-desktop-v1.0.0 (or newer):
wget https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/adcos-desktop_1.0.0_amd64.deb
wget https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/SHA256SUMS.md
sha256sum -c SHA256SUMS.md          # MUST say OK before you install
sudo apt install ./adcos-desktop_1.0.0_amd64.deb
```

Option B — AppImage (keep the PREVIOUS version's file when upgrading;
rollback for AppImages is "run the old file"):

```bash
chmod +x adcos-desktop-1.0.0-x86_64.AppImage
./adcos-desktop-1.0.0-x86_64.AppImage
```

## 2. First run checks

- Launch: the window title is **ADCOS — Connectivity OS** with the 7-panel
  sidebar (Identity, My resources, Reality Lab, Organizations, Group
  purchase, Role views, About).
- The Identity panel shows the durable-state counters (restored snapshots
  / torn tail lines = 0 / 0 on a fresh install).
- Enroll a test resource (My resources → Enroll) — the snapshot counter
  must increment IMMEDIATELY (write-before-ack: the write happens before
  the UI acknowledges).
- Identities are LOCAL DEMO identities (ada@local …) — honestly labeled,
  NOT accounts, NOT authentication.

## 3. Where your data lives

| What | Path |
| --- | --- |
| Durable state (journey data) | `~/.config/adcos-desktop/state/adcos-state.jsonl` |
| Main-process log | `~/.config/adcos-desktop/main.log` |
| Everything (clean-uninstall) | `~/.config/adcos-desktop/` |

Deletion: removing the state file = full erasure of journey data (no
second copy exists; see `ops/retention/README.md` for the exact
OS-level-remnant honesty list).

## 4. Back up (do this before upgrades, weekly otherwise)

```bash
cp -a ~/.config/adcos-desktop/state/adcos-state.jsonl \
      ~/adcos-state-$(date +%F).jsonl          # keep a rotation of ~7
```

The restore procedure if things break: copy the newest backup back over
the live file — the app re-opens over it and replays the last intact
snapshot (the restore drill proves this end-to-end).

## 5. Health checks (the probe)

With a Node 24+ install and the repo checked out (or just its
`scripts/ops/` + `packages/` on a machine with the workspace installed):

```bash
node --import tsx scripts/ops/health-probe.mjs --desktop ~/.config/adcos-desktop
```

Read the verdict honestly:

- **HEALTHY** — state parses, folds, everything consistent.
- **FRESH** — no commands applied yet (first run). Not an error.
- **DEGRADED** (exit 2) — a torn/corrupt tail line was detected and
  SKIPPED; the app self-heals off the last intact snapshot. Take a
  snapshot copy of the file (evidence) and watch for repeats.
- **UNHEALTHY** (exit 1) — the state file cannot fold. Restore from your
  newest backup (§4), then file an incident (GitHub issue, SEV-1).

## 6. Reading UNKNOWN / STALE / DEGRADED (product states — not errors)

The product shows resource states as themselves, never as fake success:

- **UNKNOWN** (fuchsia chip) — no observation recorded yet. Benign.
- **STALE** — the newest observation is old. Refresh it.
- **DEGRADED** (orange chip) — sharing continues but observed quality
  dropped. Check the physical device.

A REFUSED command (red banner with a reason, e.g. "mandate expired") is
the domain answering honestly — it is not a bug and not an outage.

## 7. The ADR-0004 badge (what "payments: opaque refs ·
BLOCKED-ON-OPERATOR" means)

Every money-adjacent panel carries this badge. It means: the product
records purchases with OPAQUE payment references only; NO live payment
rail is selected or integrated; live money movement is deferred to you
(the operator) — a pending decision, never a hidden outage. Nothing to
fix; nothing to wait for; it is the honest current state.

## 8. Upgrades and rollback

- Upgrade: install the new deb over the old one (state is untouched).
- Rollback: `sudo apt install ./adcos-desktop_<previous>_amd64.deb`
  (downgrade in place) — back up state FIRST:
  `cp -a ~/.config/adcos-desktop/state ~/state-pre-rollback-$(date +%s)`.
  Full doctrine: `ops/drills/rollback.md`.

## 9. The restore drill (monthly or before trusting a new version)

```bash
node --import tsx scripts/ops/restore-drill.mjs     # verdict must be PASS
```

It seeds a real journey, snaps a backup, destroys the live log, restores,
and verifies the state survived EXACTLY. PASS = your recovery guarantee
is proven; FAIL = do not trust new releases until it passes (file SEV-2).

## 10. Escalation path

1. GitHub issue on `payswapdotorg/adcos-2.0` (the intake channel that
   exists today) — attach the probe verdict, NOT credentials.
2. Severity is triaged per `ops/incident/severity-matrix.md`.
3. Anything provider/payment-shaped is escalated to you as
   BLOCKED-ON-OPERATOR (ADR-0004) — recorded, never approximated.
