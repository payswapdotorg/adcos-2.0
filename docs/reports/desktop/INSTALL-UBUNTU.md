# ADCOS Desktop — Ubuntu install (v1.0.0)

ADCOS Desktop is the **ADCOS 2.0 — Connectivity OS** product as a native
Ubuntu desktop application: resource enrollment and consent, Reality Lab
evaluations, organizations, group purchasing and the order lifecycle — all
running on the real merged ADCOS domain packages with durable local state.

This is the product itself. The inherited ZCode substrate app is not
bundled and is unreachable by construction (verified: zero zcode entries
in the shipped archive).

## Requirements

- Ubuntu 20.04 or newer, x86-64
- The deb's standard dependencies (installed automatically by apt):
  libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils,
  libatspi2.0-0, libsecret-1-0, libgbm1, libasound2

## Option A — .deb (recommended)

```bash
curl -LO https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/adcos-desktop_1.0.0_amd64.deb
sudo apt install ./adcos-desktop_1.0.0_amd64.deb
```

Launch: `adcos-desktop` (or "ADCOS" from your application menu).

Uninstall: `sudo apt remove adcos-desktop`

## Option B — AppImage (no installation)

```bash
curl -LO https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/adcos-desktop-1.0.0-x86_64.AppImage
chmod +x adcos-desktop-1.0.0-x86_64.AppImage
./adcos-desktop-1.0.0-x86_64.AppImage
```

## Verify the download

```bash
curl -LO https://github.com/payswapdotorg/adcos-2.0/releases/download/adcos-desktop-v1.0.0/SHA256SUMS.md
sha256sum -c SHA256SUMS.md --ignore-missing
```

Expected:

```
4c1a040311029da76d5912563513dc464010b2a5e72ef2587cef9f1a687be119  adcos-desktop_1.0.0_amd64.deb
0a00b2a90d283ba595fbe00cad5e459071b751e850dfa043138851fe3549f7f4  adcos-desktop-1.0.0-x86_64.AppImage
```

## Where your data lives

The app persists its durable state log (write-before-ack JSONL) under
`~/.config/adcos-desktop/state/adcos-state.jsonl`. Deleting that file
resets the local journeys.

## Honest capability statement

Per the repository README, the ADCOS specifications do not imply the
referenced capabilities are already implemented. This desktop app
demonstrates the merged domain logic with local persisted state:

- REAL: resource enrollment/consent/observation, Lab evaluations, org
  founding/membership/mandates, group purchasing with the order lifecycle,
  operator/developer role views, durable restart-safe persistence.
- NOT CLAIMED: live provider forwarding, physical-device cooperation, or
  payment settlement. Payments use opaque typed references (ADR-0004);
  live money movement is BLOCKED-ON-OPERATOR (rail selection is an operator
  decision).
