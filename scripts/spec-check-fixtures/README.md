# spec-check fixtures (work order P0-W2)

Minimal negative fixture trees for `scripts/check-project-spec.mjs`, exercised
by `scripts/test-check-project-spec.mjs`.

Each tree is a complete but tiny skeleton of the required file set — one- and
two-line stubs, never copies of the real specifications. The shared baseline
stub is otherwise VALID (it passes the checker), and each tree breaks exactly
one governance invariant:

| Fixture | Broken invariant | Expected checker failure |
| --- | --- | --- |
| `missing-spec/` | a required source-of-truth file is removed (`spec/dependency-graph.md`) | `Missing required source-of-truth file: spec/dependency-graph.md` |
| `invalid-json/` | `spec/development-state/current-state.json` is malformed JSON | `Cannot parse current-state JSON: ...` |
| `unknown-frontier/` | current-state `frontier` references `P9-W9`, which has no `## P*-*` heading in `spec/work-orders.md` | `frontier work order is not defined in spec/work-orders.md: P9-W9` |
| `duplicate-work-order/` | `spec/work-orders.md` contains the same `## P0-W2` heading twice | `duplicate work-order ID in spec/work-orders.md: P0-W2` |

The runner asserts each fixture fails with exactly one error line, proving the
stub trees stay minimal and only the targeted invariant is broken. Do not add
real specification content here; these trees are test inputs, not documents.
