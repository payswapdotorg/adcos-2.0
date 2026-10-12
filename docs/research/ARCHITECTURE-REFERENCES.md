# Architecture Reference Register

These references ground architectural patterns; they do not substitute for implementation proof or establish unverified performance claims.

## Repository-local design authorities

- ADCOS Architecture 1.1 and locks: https://github.com/payswapdotorg/ADCOS/blob/main/spec/architecture.md and https://github.com/payswapdotorg/ADCOS/blob/main/spec/architecture-lock.md. Canonical ConnectivityContract, capability-oriented adapters, provider eligibility, assurance and optimizer boundary.
- ShareNet architecture and research: https://github.com/payswapdotorg/ShareNet/blob/main/spec/architecture.md and https://github.com/payswapdotorg/ShareNet/blob/main/spec/research.md. Peer transport, gateway bridging, measured contribution and explicitly bounded store-carry-forward.
- RoamLink authority model: https://github.com/payswapdotorg/RoamLink/blob/main/spec/authority-model.md. Separation of experience state and canonical ADCOS connectivity state.
- UniCom README: https://github.com/payswapdotorg/UniCom/blob/main/README.md. Group-buy discovery, participant recruitment, offer requests and governed commerce.
- PaySwap 3.0 architecture: https://github.com/payswapdotorg/PaySwap-3.0/blob/main/spec/architecture/PAYSWAP-3.0.md and https://github.com/payswapdotorg/PaySwap-3.0/blob/main/spec/dependency/work-orders.md. Reality Lab, Strategy/Organization separation, evidence-linked execution graphs, counterfactuals and controlled promotion.
- ZCode baseline: https://github.com/zai-org/ZCode/tree/29628c9acdb81b703bbd4080c207a0e7ce5e276e.

## Technical references

- IETF RFC 8446, TLS 1.3: https://www.rfc-editor.org/rfc/rfc8446 — established transport security.
- IETF RFC 9000, QUIC: https://www.rfc-editor.org/rfc/rfc9000 — secure multiplexed transport.
- IETF RFC 8684, Multipath TCP: https://www.rfc-editor.org/rfc/rfc8684 — possible mechanism for compatible endpoints; not a universal seamless-failover or bandwidth-summing guarantee.
- IETF RFC 9171, Bundle Protocol v7: https://www.rfc-editor.org/rfc/rfc9171 — store-carry-forward for delay/disruption-tolerant intents.
- AWS Cloud WAN: https://docs.aws.amazon.com/network-manager/latest/cloudwan/what-is-cloudwan.html — declarative network policy pattern.
- Cloudflare WAN documentation: https://developers.cloudflare.com/cloudflare-wan/ — cloud-managed network and security pattern.

## Research hygiene

For time-sensitive claims record publication/version and access date. Separate vendor case studies from independent measurements. Distinguish standards from drafts and vendor-specific implementations. Do not copy another project's private code or assume a feature because a README describes its target architecture. Turn each chosen pattern into a bounded decision, work order and acceptance criteria.
