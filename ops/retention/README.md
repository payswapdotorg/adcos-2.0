# P5-W1 — Retention & Privacy Contract (`ops/retention/`)

Owner: lane p5w1 (work order `## P5-W1`). Scope: the SHIPPED product
(P5-W2 desktop app). This contract states EXACTLY what persistent data the
product writes, where it lives, and what deletion removes — verified
against the store implementation, not asserted from memory.

## What the durable JSONL contains

`<userData>/state/adcos-state.jsonl` — append-only JSONL, one FULL state
snapshot per applied command (write-before-ack). Every snapshot row is a
contracts-typed projection row:

- consents (resource share-consent states + timestamps),
- resource projection references (device/type/capability/modes/limits +
  observed status),
- capability observations (status/freshness evidence),
- organization memberships and mandates,
- group-purchase requests, offers, commitments,
- advisory opportunities (Lab evidence),
- order records — carrying **opaque payment references only**
  (`PaymentReference`: id + type + authority-role + created + settled
  flag) per ADR-0004.

**NO live payment data by construction**: no amounts charged, no rail
semantics, no credentials. Monetary values on offers/commitments are
supplier-term evidence numbers (e.g. `perMemberCost: 40` from recorded
public terms), never transaction records.

## Where it lives

| Platform | Durable state | userData dir |
| --- | --- | --- |
| Linux (shipped target, PROVEN by P5-W2 smoke) | `~/.config/adcos-desktop/state/adcos-state.jsonl` | `~/.config/adcos-desktop` |
| macOS / Windows | PENDING-station (Electron-documented paths; see environment matrix) | `~/Library/Application Support/ADCOS` / `%APPDATA%\adcos-desktop` |

## The complete write surface (verified in code)

The shipped product writes exactly TWO domain-relevant files (verified by
scanning every filesystem call in `apps/desktop-adcos/src` and
`packages/surfaces/src/adapters`):

1. the state JSONL (append-only, `appendFileSync` in
   `packages/surfaces/src/adapters/jsonl-state-store.ts` — plus a
   `mkdirSync` of its parent on construction);
2. `main.log` (append-only lifecycle lines, `logMain()` in
   `apps/desktop-adcos/src/main/index.ts`).

The renderer persists NOTHING (verified: zero `localStorage` /
`sessionStorage` / `indexedDB` usage in `packages/product-web/src` — all
renderer state is memory-only, sourced through the bridge). Electron's
Chromium layer additionally manages cache subdirectories under userData
(`Cache/`, `Code Cache/`, `GPUCache/`, `Local Storage/` scaffolding) —
these hold no domain data (the renderer never persists domain state), but
they DO exist on disk.

## User-controlled deletion — what EXACTLY remains

**Delete the file = full erasure of the domain state.** The state store
recreates an empty log on the next applied command (constructor:
absent file → fresh start — verified in the store implementation and
exercised by the restore drill's total-loss phase, which reopens EMPTY).

Precisely what remains after `rm ~/.config/adcos-desktop/state/adcos-state.jsonl`:

- **Nothing of the journey data** — no second copy exists anywhere in the
  product (single-file store; renderer memory-only; no telemetry, no
  cloud sync — the product is local-only by construction: `file://`
  window, navigation restricted, window-open denied).
- **OS-level remnants (honest list)**:
  - filesystem-level: freed blocks are not zeroed by `rm` — standard
    POSIX semantics; an attacker with raw-disk access and no overwrite
    since deletion could theoretically recover bytes. (Same residual as
    any local file deletion; a `shred`-style overwrite closes it if the
    threat model requires.)
  - if the file was deleted via a desktop file manager, it may sit in
    the OS trash until emptied;
  - any backup copies the OPERATOR made (retention of backups is the
    operator's own policy — see below);
  - `main.log` still records lifecycle lines (timestamps + status text,
    no journey rows) — delete it for a fully clean slate;
  - Chromium-managed cache dirs remain (no domain data, per the verified
    write surface).
- **Full clean uninstall** = remove the whole `~/.config/adcos-desktop`
  directory (state, main.log, caches) + `sudo apt remove adcos-desktop`
  (or delete the AppImage file). `apt remove` leaves config dirs by
  Debian convention; `apt purge` removes packaged system files only —
  the userData dir is the user's to remove.

## Backups inherit the same retention

- Backup copies of the JSONL (operator snapshots, the drill's
  `backup/`+`fixture/` copies) contain the SAME tenant business data
  under the SAME no-credentials law. They inherit this contract:
  deletion requests must extend to snapshot copies, and snapshot copies
  must be access-controlled like the live file (the P4-W1 plan's §2.1
  guidance).
- The restore drill's workspaces are transient (temp, auto-cleaned) or
  gitignored (`.run-logs/`) — never committed. The one committed
  evidence fixture is synthetic drill data (`res-drill-1` etc.) with no
  real principal beyond the frozen demo identities.
- Retention period: the product itself has NO expiry/cleanup job (honest:
  the frozen store has no compaction). The log grows append-only; see
  `ops/costs/README.md` for the measured growth. Data minimization is
  therefore operational: the operator decides snapshot cadence and
  archiving; nothing is auto-deleted by the product.

## Privacy posture (honest)

- No telemetry, no crash reporting, no analytics — nothing leaves the
  machine (product lock verified in P5-W2: `will-navigate` file://-only,
  window-open denied; asar contains 0 zcode entries).
- Local demo identities are NOT authentication and carry no credentials.
- Secrets never enter the state file (P4-W1 secrets battery 6/6;
  environment contract law).
