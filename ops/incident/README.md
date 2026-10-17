# P5-W1 — Incident & Support Operations (`ops/incident/`)

Owner: lane p5w1 (work order `## P5-W1`). Playbook:
[`docs/runbooks/incident-playbook.md`](../../docs/runbooks/incident-playbook.md).
Severity definitions: [`severity-matrix.md`](./severity-matrix.md).

## Intake (what exists TODAY — no invented channels)

The support channel that exists today is **GitHub issues on
`payswapdotorg/adcos-2.0`**. That is the entire intake surface, and it is
the only one this lane wires for. (The inherited substrate's community
links in `config/default.json` belong to the ZCode substrate — NOT to the
ADCOS product — and are never presented to ADCOS users.)

- Users/operators open issues; label set: `incident`, `support`,
  `sev-1..sev-5` (per the matrix), `state-plane`, `release-channel`,
  `app-crash`, `adr-0004-scope` (anything provider/payment-shaped).
- ADR-0004-scope issues are triaged to the operator decision channel as
  BLOCKED-ON-OPERATOR — they are never "fixed" with fake rails.

## Triage

1. Label severity within one business day (matrix below).
2. Reproduce: ask the reporter for the diagnostics bundle (below) —
   WITHOUT secrets.
3. Classify the surface: state plane (JSONL), app plane (Electron),
   release channel, or domain refusal (A-9 class — honest refusals are
   not incidents).

## Support operations (state files, per platform)

| Platform | State file | userData dir |
| --- | --- | --- |
| Linux (Ubuntu — the shipped target) | `~/.config/adcos-desktop/state/adcos-state.jsonl` | `~/.config/adcos-desktop` |
| macOS (PENDING-station) | `~/Library/Application Support/ADCOS/state/adcos-state.jsonl` | `~/Library/Application Support/ADCOS` |
| Windows (PENDING-station) | `%APPDATA%\adcos-desktop\state\adcos-state.jsonl` | `%APPDATA%\adcos-desktop` |

### Collecting diagnostics WITHOUT shipping secrets

The durable JSONL contains **no credentials by construction** (secrets
battery 6/6; environment contract law), so the state file itself is
safe to attach — but it DOES contain tenant business data (journey rows,
opaque payment references), so:

1. **Default ask**: a REDACTED EXCERPT, not the whole file:
   - the health-probe output (machine verdict + stats — no row data):
     `node --import tsx scripts/ops/health-probe.mjs --state <path>`;
   - `wc -c` + `wc -l` of the JSONL;
   - the LAST line only, with principal-shaped strings masked
     (`sed -E 's/[a-z0-9._%+-]+@[a-z0-9.-]+/[principal]/g'`).
2. **Ask for the full JSONL** only when state-plane reproduction is
   blocked without it, and say why. Treat it as tenant data in the issue
   (non-public transfer preferred: the operator zips it and shares a
   private link; the issue thread receives only the analysis).
3. **Never ask for**: provider credentials, OS keyring contents, or
   `~/.config/adcos-desktop/main.log` beyond the last ~50 lines. Main log
   lines are timestamped lifecycle text; the last lines suffice and the
   older tail is noise.
4. The secrets gate (`scripts/ops/check-secrets.mjs`) runs at every
   release precisely so that anything committed back into the repo stays
   credential-free.

## Escalation to the operator

Anything in the ADR-0004 lane (live provider, payment rail selection,
physical-device scope) or requiring money/business decisions is escalated
with the ADR-0004 badge and the honest state: BLOCKED-ON-OPERATOR /
UNKNOWN — never approximated. The incident is parked (status:
`blocked-on-operator`) with the decision recorded, not silently closed.

## Postmortems

SEV-1 and SEV-2 incidents close with a postmortem entry in the issue (or a
linked `docs/reports/deployment/` note for station-side incidents):
summary, timeline, root cause, what the drill/probe/gate caught vs missed,
and one concrete prevention item wired into a runbook/gate. Template in
the incident playbook.
