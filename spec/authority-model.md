# Authority and Integration Model

| Concern | Canonical owner | ADCOS 2.0 role |
|---|---|---|
| ZCode runtime/platform/tool/workflow APIs | Inherited ZCode substrate until explicitly migrated | Extend through public package/platform interfaces |
| Customer product identity, experience preferences and support UX | ADCOS 2.0 product domain | Own customer/provider/admin surfaces and its preferences |
| User/org principals and device enrollment | Approved identity/trust authority; device owner for local facts/permissions | Keep references and user experience; enforce scoped commands |
| Resource sharing preferences/limits | Resource owner and product domain | Own opt-in, schedule, limits, pause/revoke and contributor experience |
| Provider capabilities/offers/eligibility | Existing ADCOS provider/connectivity domain and providers | Discover and request through public ADCOS interface |
| ConnectivityIntent, ConnectivityContract, ExecutionPlan, path/session, usage evidence, assurance and connectivity settlement reference | payswapdotorg/ADCOS | Store references/projections only; canonical changes use public commands |
| Provider-native routing, subscriber state, radio/core and credentials | Underlying provider/adapter | Never claim ownership or leak secrets/private topology to core |
| Peer/gateway protocol, ShareNet circuits/routes/content semantics and contribution accounting | payswapdotorg/ShareNet | Integrate through supported public boundary |
| RoamLink experience/device-context semantics | payswapdotorg/RoamLink for its bounded domain | Reuse its authority/integration model; do not create duplicate connectivity authority |
| Group-buy discovery/commerce reference patterns | payswapdotorg/UniCom; binding order/finance remains with the applicable commerce/payment authority | Discover demand and offers, present proposals, track approvals/references |
| Reality Lab strategies/Organizations/opportunities in this product | ADCOS 2.0 Lab advisory domain | Produce candidates and evidence; no external side effects without gate |
| Actual payment transaction/finality | Authorized financial/payment system | Store references and reconciled projections, not a competing ledger |
| Group membership and member mandate | Organization/member authority defined by accepted product contract | Track explicit proposal, acceptance, withdrawal, allocation and audit state |

## Boundary rules

Domain types must not import UI/runtime implementation details or provider-native SDK types. ADCOS 2.0 may maintain read projections of canonical ADCOS state but may not bypass it for connectivity commands.

If an existing integration interface is insufficient, create an adapter-gap work item and ADR. Do not quietly create shadow contract, routing, usage, or settlement authorities. Changes to sibling repositories are not implied by changes here; submit separately reviewed changes in those repositories when required.
