# Operator onboarding (P5-W1)

For the operator (non-developer) running the ADCOS Desktop product.
Everything here is what the shipped system actually does — no
aspirational claims (see the honesty notes inline).

## 1. Install (Ubuntu 20.04+ x64)

```bash
curl -LO https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/adcos-desktop_1.0.0_amd64.deb
sudo apt install ./adcos-desktop_1.0.0_amd64.deb
```

Or the AppImage (no install):

```bash
curl -LO https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/adcos-desktop-1.0.0-x86_64.AppImage
chmod +x adcos-desktop-1.0.0-x86_64.AppImage && ./adcos-desktop-1.0.0-x86_64.AppImage
```

Verify integrity first:

```bash
curl -LO https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/SHA256SUMS.md
sha256sum -c SHA256SUMS.md --ignore-missing
```

Full instructions ship with the release (`INSTALL-UBUNTU.md`).

## 2. What you are running

The product = the seven panels (Identity, Resources, Lab,
Organizations, Group purchase, role views, About) over the real durable
state log. The identity switcher offers **local demo identities** —
honest labels, NOT authentication. Group-purchase payments show
**opaque references** with a permanent "live rail: BLOCKED-ON-OPERATOR
(ADR-0004)" badge: the product never claims live money movement.

## 3. Where your state lives (and how to protect it)

- Linux: `~/.config/ADCOS/state/adcos-state.jsonl` (plus `main.log`
  in the same directory).
- **Back it up**: with the app closed, copy the file and keep it
  somewhere dated. That file IS your state.
- **Restore it**: copy it back (verify the hash if you recorded one),
  relaunch the app.
- **Delete it**: removing the file (or the whole `~/.config/ADCOS`)
  erases everything the product stored. See `ops/retention/README.md`
  for the exact what-remains truth.

## 4. Health checks (self-serve)

On a repo clone (any developer can run these for you):

```bash
node --import tsx scripts/ops/health-probe.mjs --state ~/.config/ADCOS/state/adcos-state.jsonl
# verdict HEALTHY / DEGRADED / UNKNOWN / DOWN with per-check detail

node scripts/ops/run-drills.mjs    # proves the storage layer on a fixture
```

Reading verdicts: **UNKNOWN is an honest state** — the product law
(INVARIANTS #5) renders UNKNOWN/STALE/DEGRADED as themselves, never as
healthy. A DEGRADED state file is usable but a snapshot-restore is
recommended (`ops/drills/restore-drill.md`).

## 5. Rolling back

Reinstall the previous release's deb over the current one (or run the
previous AppImage): see `ops/drills/rollback.md`. Your state survives a
binary rollback; snapshot first if the new version had been used.

## 6. When something breaks

File a GitHub issue on `payswapdotorg/adcos-2.0` with: what you did,
what you saw, the probe verdict if you ran it, and (for state problems)
the state file — it contains no credentials by construction
(`ops/incident/README.md` documents what it does contain). Severity
classification and response expectations: `ops/incident/severity-matrix.md`.

## 7. The pending decision only you can make (ADR-0004)

Live provider/hardware integration and the payment-rail selection are
**BLOCKED-ON-OPERATOR** — the roadmap lane P4-W2 waits on this decision.
Until then the product ships with opaque payment references and honest
blocked badges; nothing in the UI or docs claims live integration.
