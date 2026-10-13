import { ShareNetPortSchema, type ShareNetPort } from "@adcos/contracts";

// ============================================================================
// ShareNet adapter seam — per spec/adr/ADR-0001 (ShareNet interop strategy:
// "adapter inside ADCOS 2.0 that implements ConnectivityPort semantics
// against the canonical, versioned, authenticated ADCOS developer boundary,
// and talks to ShareNet surfaces through ShareNet's public seams").
//
// This file defines the SEAM (the interface a real implementation must
// satisfy) plus a REFERENCE STUB that FAILS CLOSED on every operation.
//
// Grounding (public ShareNet sources only — no private protocol details):
//   - payswapdotorg/ShareNet spec/integrations/adcos.md publishes the
//     ConnectivityPort interface shape: createIntent, discoverOffers,
//     acceptOffer, getContract, getAssurance, getExecution, terminate.
//   - Its failure semantics law: when the boundary is unavailable, do not
//     fabricate state; block new acquisition; carry the last accepted
//     observation with freshness; continue local operations.
//   - ShareNet public transport crates (sharenet-transport-linux's
//     TunDevice/UdpTransport/gateway, sharenet-dtn's custody store) are the
//     public integration surfaces for ShareNet-side paths (ADR-0001).
//   - ADR-0001: "no 'ShareNet integrated' claim may be recorded before
//     [conformance/interop tests against a real ShareNet instance] pass."
//     No such instance exists in this sandbox, so the ONLY implementation
//     shipped here is the clearly-labeled failing-closed stub.
//
// The seam deliberately does NOT reproduce ShareNet's raw 7-endpoint
// unauthenticated HTTP wire table (ADR-0001 rejects serving it as a
// compatibility surface); it models the SEMANTIC operations with typed,
// fail-closed results only. Wire details belong to a future ADR-reviewed
// real adapter.
// ============================================================================

/** Labeled error: the ShareNet seam exists but no verified implementation does. */
export class ShareNetSeamUnavailableError extends Error {
  readonly failClosed: true = true;
  readonly seamKind = "sharenet" as const;
  /** Label REQUIRED by ADR-0001 — never present on a passing integration. */
  readonly notIntegrated: true = true;
  constructor(operation: string) {
    super(
      `ShareNet seam operation '${operation}' FAILS CLOSED: reference stub only, ` +
        "no verified ShareNet integration exists (ADR-0001 requires conformance/interop " +
        "tests against a real ShareNet instance before any 'ShareNet integrated' claim)",
    );
    this.name = "ShareNetSeamUnavailableError";
  }
}

/** Opaque reference shapes (public interface signature only; no wire detail). */
export type ShareNetIntentRef = string;
export type ShareNetOfferRef = string;
export type ShareNetContractRef = string;

/** Read-only projections stay opaque records: the seam never fabricates them. */
export interface ShareNetSeamProjection {
  readonly contractRef: ShareNetContractRef;
  readonly fields: Readonly<Record<string, unknown>>;
  /** Freshness/availability annotation the real adapter must carry. */
  readonly freshness: "FRESH" | "STALE" | "UNAVAILABLE";
}

/**
 * Honest availability probe. A REAL implementation reports the live boundary
 * state; the stub (and any implementation that cannot verify the boundary)
 * must report UNAVAILABLE — a probe never fabricates readiness, and an
 * unavailable seam never destroys otherwise-valid local state.
 */
export interface ShareNetSeamProbe {
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly implementation: string;
  readonly reason?: string;
}

/**
 * The seam a future real ShareNet adapter implements. All operations are
 * consequential: they MUST fail closed (typed rejection) whenever the
 * boundary cannot be verified, and MUST NOT fabricate contract, observation
 * or execution state (ShareNet's public failure-semantics law).
 */
export interface ShareNetCoordinationSeam {
  readonly seamKind: "sharenet";
  /** Implementation label — the stub's label is part of its fail-closed contract. */
  readonly implementation: string;
  /** Read-only, honest availability probe (never fabricates readiness). */
  probe(): Promise<ShareNetSeamProbe>;
  createIntent(requirement: Readonly<Record<string, unknown>>): Promise<ShareNetIntentRef>;
  discoverOffers(intent: ShareNetIntentRef): Promise<readonly ShareNetOfferRef[]>;
  acceptOffer(intent: ShareNetIntentRef, offer: ShareNetOfferRef): Promise<ShareNetContractRef>;
  getContract(contract: ShareNetContractRef): Promise<ShareNetSeamProjection>;
  getAssurance(contract: ShareNetContractRef): Promise<Readonly<Record<string, unknown>>[]>;
  getExecution(contract: ShareNetContractRef): Promise<ShareNetSeamProjection>;
  terminate(contract: ShareNetContractRef): Promise<void>;
}

export interface ShareNetSeamOptions {
  /**
   * Port configuration validated against the frozen ShareNetPort contract
   * shape (endpoint, capabilities, auth). Validation failures are typed
   * configuration errors — also fail closed, never defaulted.
   */
  readonly port: unknown;
}

const STUB_IMPLEMENTATION_LABEL =
  "adcos-coordination/sharenet-seam:failing-closed-reference-stub (NOT integrated)";

/**
 * Construct the ShareNet seam. The port configuration is validated against
 * the frozen ShareNetPort contract; even a VALID configuration yields the
 * failing-closed stub in this repository today (ADR-0001: the real adapter
 * lands with conformance/interop tests against a real ShareNet instance).
 */
export function createShareNetSeam(options: ShareNetSeamOptions): ShareNetCoordinationSeam {
  const parsed = ShareNetPortSchema.safeParse(options.port);
  if (!parsed.success) {
    throw new ShareNetSeamConfigurationError(
      `invalid ShareNet port configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const port: ShareNetPort = parsed.data;
  return new FailingClosedShareNetSeamStub(port);
}

/** Typed configuration error (fail closed on malformed port config). */
export class ShareNetSeamConfigurationError extends Error {
  readonly failClosed: true = true;
  constructor(message: string) {
    super(message);
    this.name = "ShareNetSeamConfigurationError";
  }
}

/**
 * REFERENCE STUB — clearly labeled, fails closed on EVERY consequential
 * operation with ShareNetSeamUnavailableError. It performs no I/O, invents
 * no ShareNet protocol details, and fabricates no state. It exists so the
 * seam compiles, wires, and provably refuses to claim integration.
 */
class FailingClosedShareNetSeamStub implements ShareNetCoordinationSeam {
  readonly seamKind = "sharenet" as const;
  readonly implementation = STUB_IMPLEMENTATION_LABEL;

  constructor(private readonly port: ShareNetPort) {}

  async probe(): Promise<ShareNetSeamProbe> {
    return {
      status: "UNAVAILABLE",
      implementation: STUB_IMPLEMENTATION_LABEL,
      reason:
        "no verified ShareNet integration exists (ADR-0001); boundary endpoint " +
        `${this.port.endpoint} was never contacted — readiness is never fabricated`,
    };
  }

  async createIntent(): Promise<ShareNetIntentRef> {
    throw new ShareNetSeamUnavailableError("createIntent");
  }

  async discoverOffers(): Promise<readonly ShareNetOfferRef[]> {
    throw new ShareNetSeamUnavailableError("discoverOffers");
  }

  async acceptOffer(): Promise<ShareNetContractRef> {
    throw new ShareNetSeamUnavailableError("acceptOffer");
  }

  async getContract(): Promise<ShareNetSeamProjection> {
    throw new ShareNetSeamUnavailableError("getContract");
  }

  async getAssurance(): Promise<Readonly<Record<string, unknown>>[]> {
    throw new ShareNetSeamUnavailableError("getAssurance");
  }

  async getExecution(): Promise<ShareNetSeamProjection> {
    throw new ShareNetSeamUnavailableError("getExecution");
  }

  async terminate(): Promise<void> {
    throw new ShareNetSeamUnavailableError("terminate");
  }
}
