# Rollback doctrine (P5-W1)

## What "rollback" means for this product

The shipped ADCOS Desktop (P5-W2) is a **single-node local desktop app**
distributed as versioned GitHub Release artifacts. Rollback therefore has
exactly two axes:

1. **Release rollback (the product binary)** — pin back to a previous
   release version.
2. **State rollback (the durable JSONL store)** — restore a state
   snapshot (see `restore-drill.md`).

There is **no multi-node state topology** to roll back and no server-side
deployment: "production" is the end-user machine (see
`ops/environments/matrix.md` — honest limits).

## Release rollback procedure

Ubuntu x64, both supported artifacts (per `INSTALL-UBUNTU.md` shipped
with the release):

```bash
# deb track — install a previous version OVER the current one:
curl -LO https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/adcos-desktop_1.0.0_amd64.deb
sudo apt install ./adcos-desktop_1.0.0_amd64.deb     # downgrades to 1.0.0

# AppImage track — no install step: run the previous AppImage directly:
chmod +x adcos-desktop-1.0.0-x86_64.AppImage && ./adcos-desktop-1.0.0-x86_64.AppImage
```

Always verify against `SHA256SUMS.md` from the same release before
installing (the release gate verifies anonymous download + sha256 at
publish time; the installer should re-verify at use time).

## State compatibility across versions (the honest law)

- The durable store is an **append-only JSONL event log** replayed on
  load (write-before-ack; see `packages/surfaces/src/domain/state.ts`).
- **Forward compatibility**: a newer reader over an older log is the
  normal upgrade path — unknown/older lines are events the current
  projections understand by schema-version discipline; the drill
  (`scripts/ops/restore-drill.mjs`) proves exact replay.
- **Rolling the BINARY back**: the older product version reads the SAME
  log. Lines appended by the newer version may carry event shapes the
  older reader does not know — the safe procedure after a binary
  rollback is to **restore the state snapshot taken before the upgrade**
  (step 2 of the drill's production procedure). If no snapshot exists,
  keep the post-upgrade state file aside and file an incident
  (`ops/incident/README.md`) instead of hand-editing the log — hand
  edits are forbidden (they break the write-before-ack audit trail).
- **There is no write-side rollback of the log itself**: the log is
  append-only by law; "undo" is a domain event (e.g. WITHDRAW commitment,
  consent PAUSE), never a file mutation.

## When to roll back vs. when not to

- **Roll back** on: release-level regressions in the product surface,
  renderer load failures, IPC bridge breakage — binary-scoped faults.
- **Do NOT roll back for** data-shape faults or store corruption —
  restore the state snapshot instead (the binary rarely caused it; the
  log is the asset to protect).
- **Never**: partial log surgery. The audit trail is the product's
  honesty spine.

## BLOCKED-ON-OPERATOR remainder (ADR-0004)

Live-provider deployment and payment-rail rollback semantics CANNOT be
defined until the operator selects the live provider/hardware and rail.
This doctrine deliberately claims nothing about them. When the operator
unblocks P4-W2, this document gains a live-deployment rollback section —
until then, any such section would be fabrication.
