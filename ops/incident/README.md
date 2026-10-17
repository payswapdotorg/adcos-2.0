# ADCOS incident & support operations (P5-W1)

## Intake (what exists TODAY)

- **User reports**: GitHub issues on `payswapdotorg/adcos-2.0` — the only
  standing channel. No support desk, no in-app reporter (the product has
  no telemetry egress by construction — see health contracts).
- **Operator-initiated**: release-gate failures, probe verdicts, drill
  failures (see `ops/monitoring/alerts.md` A1–A11).

## Triage

1. Classify severity per `severity-matrix.md`.
2. Identify the surface: desktop app / state store / release channel.
3. Follow `docs/runbooks/incident-playbook.md` (the playbook: collect
   diagnostics, decide rollback vs. restore, communicate, postmortem).

## Support operations (state file handling)

- **Where state lives**: `<userData>/state/adcos-state.jsonl`
  (Linux: `~/.config/ADCOS/state/adcos-state.jsonl`) — see
  `ops/environments/matrix.md`.
- **Collecting diagnostics WITHOUT shipping secrets**: the state file
  contains journey events + opaque payment references (ADR-0004) — no
  credentials by construction (`check-secrets.mjs` enforces the tree;
  the composition has no secret inputs to leak). `main.log` (append-only
  ops lines under userData) may accompany it. Ask the reporter to
  **redact principal ids** if they consider them identifying; otherwise
  send the file as-is.
- **When to ask for the full JSONL vs. a redacted excerpt**: full file
  for A1/A2 (store integrity), A3 drill failures; excerpt (the lines
  around the reported action) for command-level surprises. Never ask
  users to hand-EDIT the log (rollback doctrine forbids it).

## Escalation

- Everything escalates to the operator (repo owner) — there is no
  on-call rotation. S1 release blockers block the release until the
  operator decides; S2/S3 are handled as issues with the linked
  runbook procedure.

## Honest limits

- No SLA exists (no paid support org). Response times are
  best-effort by the operator.
- Live-provider incidents CANNOT exist yet — BLOCKED-ON-OPERATOR
  (ADR-0004). Any provider-incident procedure would be fabricated
  until the operator selects the live integration.
