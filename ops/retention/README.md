# Retention & privacy contract (P5-W1)

## What the durable store contains

`<userData>/state/adcos-state.jsonl` — an append-only log of
**journey events** produced through the public SurfacesService:
resource enrollments, consent transitions (OPT_IN/OPT_OUT/PAUSE/
RESUME), observations, Lab evaluations, organization founding/
membership, group-purchase offers/commitments, order lifecycle
events, and **opaque payment references** (ADR-0004: id + type +
authority role + timestamps — NO live payment data, no credentials,
no account numbers; the live rail is BLOCKED-ON-OPERATOR and
unselected).

What it **never** contains (verified by construction and enforced by
gates):

- credentials or tokens (`check-secrets.mjs` tripwire; the composition
  has no secret inputs — see `ops/environments/contracts.json`)
- live provider traffic or provider account identifiers
- anything the user did not do through the product's own commands

## Where it lives

Per-user, per-machine, under the OS app-data dir for "ADCOS"
(`~/.config/ADCOS` on Linux) — NOT synced, NOT uploaded (the product
makes no telemetry or sync egress; the product lock forbids remote
URLs by construction). Backups exist only where the USER (or operator
following `ops/drills/restore-drill.md`) puts them.

## User-controlled deletion — the exact truth

- **Delete the file = full erasure of product state.** Verified
  against the store implementation: the service holds no other
  durable copy; a fresh file starts a fresh state (the restore drill
  proves the file IS the state).
- What remains after deletion, honestly:
  - **OS-level remnants**: none written by the product beyond the file
    itself and `main.log` (also under userData — delete the whole
    `~/.config/ADCOS` directory to remove everything).
  - **The append-only main.log** shares the userData dir and contains
    ops lines (no journey payloads) — same deletion procedure.
  - **Backups the user took** are outside the product's reach (by
    design); the user deletes them where they put them.
- Retention horizon: **none is imposed** — the product keeps events
  until the user deletes them. No background pruning exists.

## Backups inherit this contract

A state snapshot is the same class of data (journey events, opaque
references) — whoever holds the backup holds exactly that, nothing
more. The release channel (`ops/environments/contracts.json`) never
receives state.

## Honest limits

- "Local demo identities" (ada@local etc.) are labels for principal
  switching, NOT authentication — no auth claims, no PII verification.
- If a future lane introduces real account identities, THIS document
  and the deletion procedure must be re-verified and amended with the
  new evidence before that lane merges.
