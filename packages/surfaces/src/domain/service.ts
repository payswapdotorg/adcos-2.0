import type { GroupPurchaseOffer } from "@adcos/contracts";
import { buildCustomerView, type CustomerView } from "./projections.js";
import type { ConsentEvent } from "./journeys.js";
import {
  buildOperatorView,
  buildDeveloperView,
  type OperatorView,
  type DeveloperView,
} from "./role-views.js";
import type {
  SurfaceState,
  SurfaceStatePersistence,
  SurfaceStoreStats,
  CommandResult,
} from "./state.js";
import { snapshotFromState } from "./state.js";
import {
  enrollResource,
  applyConsentEvent,
  revokeResource as revokeResourceImpl,
  recordObservation as recordObservationImpl,
  type EnrollResourceInput,
  type ResourceEnrollResult,
  type ConsentEventResult,
  type ObservationInput,
  type ObservationResult,
} from "./resource-commands.js";
import {
  runLabEvaluation as runLabEvaluationImpl,
  formOrganization as formOrganizationImpl,
  applyMembershipEvent as applyMembershipEventImpl,
  inviteMember as inviteMemberImpl,
  type LabEvaluationInput,
  type LabEvaluationResult,
  type FormationInput,
  type FormationResult,
  type MembershipEventInput,
  type MembershipEventResult,
  type InviteMemberInput,
  type InviteMemberResult,
} from "./org-commands.js";
import {
  openGroupPurchase as openGroupPurchaseImpl,
  receiveOffer as receiveOfferImpl,
  commitToPurchase as commitToPurchaseImpl,
  withdrawCommitment as withdrawCommitmentImpl,
  advancePurchaseOrder as advancePurchaseOrderImpl,
  type OpenPurchaseInput,
  type OpenPurchaseResult,
  type ReceiveOfferResult,
  type CommitInput,
  type CommitResult,
  type WithdrawCommitmentResult,
  type AdvanceOrderInput,
  type AdvanceOrderResult,
} from "./purchase-commands.js";

// ============================================================================
// SurfacesService — the product-surface service behind the role journeys.
//
// Composition discipline:
// - commands are pure functions over the persisted state (domain layer);
// - the service owns authorization context, durability (write-before-ack
//   through the injected persistence port) and view assembly;
// - command results NEVER carry service state — callers receive explicit
//   applied/reason outcomes plus their own scoped projections only
//   (tenant isolation at the command boundary, not just the view boundary);
// - views are built from persisted state through the merged projections
//   (buildCustomerView) and the role views (operator/developer).
//
// The clock is injected; the domain never reads ambient time.
// ============================================================================

export interface SurfacesServiceOptions {
  /** Durable state port (adapters layer implements it). */
  persistence: SurfaceStatePersistence;
  /** Injected clock (epoch ms). */
  now: () => number;
  /** Principals holding the operator role (deployment config, not state). */
  operatorPrincipals?: readonly string[];
  /** Principals holding the developer role (deployment config, not state). */
  developerPrincipals?: readonly string[];
}

/** A command outcome with the internal state field redacted. */
export type PublicResult<R> = Omit<R, "state">;

export interface RoleViewResult<V> {
  applied: boolean;
  reason?: string;
  view?: V;
}

function redact<R extends CommandResult>(outcome: R): PublicResult<R> {
  const { state: _redacted, ...publicOutcome } = outcome;
  return publicOutcome;
}

export class SurfacesService {
  private state: SurfaceState;
  private readonly persistence: SurfaceStatePersistence;
  private readonly now: () => number;
  private readonly operators: readonly string[];
  private readonly developers: readonly string[];

  constructor(options: SurfacesServiceOptions) {
    this.persistence = options.persistence;
    this.now = options.now;
    this.operators = options.operatorPrincipals ?? [];
    this.developers = options.developerPrincipals ?? [];
    this.state = this.persistence.restore();
  }

  /** Durability stats of the underlying store (reported, never faked). */
  durability(): SurfaceStoreStats {
    return this.persistence.stats();
  }

  // --- resource & consent journey -------------------------------------------

  enrollResource(actor: string, input: EnrollResourceInput): PublicResult<ResourceEnrollResult> {
    return this.commit(enrollResource(this.state, actor, input, this.now()));
  }

  applyConsentEvent(
    actor: string,
    resourceId: string,
    event: ConsentEvent,
  ): PublicResult<ConsentEventResult> {
    return this.commit(applyConsentEvent(this.state, actor, resourceId, event, this.now()));
  }

  revokeResource(actor: string, resourceId: string): PublicResult<CommandResult> {
    return this.commit(revokeResourceImpl(this.state, actor, resourceId));
  }

  recordObservation(
    actor: string,
    resourceId: string,
    input: ObservationInput,
  ): PublicResult<ObservationResult> {
    return this.commit(recordObservationImpl(this.state, actor, resourceId, input, this.now()));
  }

  // --- lab, formation and membership journey ---------------------------------

  /** Run a Lab comparison and persist the advisory opportunity (no gating:
   *  the Lab proposes and never acts — INVARIANTS #21). */
  runLabEvaluation(input: LabEvaluationInput): PublicResult<LabEvaluationResult> {
    return this.commit(runLabEvaluationImpl(this.state, input, this.now()));
  }

  formOrganization(actor: string, input: FormationInput): PublicResult<FormationResult> {
    return this.commit(formOrganizationImpl(this.state, actor, input, this.now()));
  }

  applyMembershipEvent(
    actor: string,
    input: MembershipEventInput,
  ): PublicResult<MembershipEventResult> {
    return this.commit(applyMembershipEventImpl(this.state, actor, input, this.now()));
  }

  inviteMember(actor: string, input: InviteMemberInput): PublicResult<InviteMemberResult> {
    return this.commit(inviteMemberImpl(this.state, actor, input, this.now()));
  }

  // --- group-purchase and order journey ---------------------------------------

  openGroupPurchase(actor: string, input: OpenPurchaseInput): PublicResult<OpenPurchaseResult> {
    return this.commit(openGroupPurchaseImpl(this.state, actor, input, this.now()));
  }

  receiveOffer(actor: string, offer: GroupPurchaseOffer): PublicResult<ReceiveOfferResult> {
    return this.commit(receiveOfferImpl(this.state, actor, offer, this.now()));
  }

  commitToPurchase(actor: string, input: CommitInput): PublicResult<CommitResult> {
    return this.commit(commitToPurchaseImpl(this.state, actor, input, this.now()));
  }

  withdrawCommitment(actor: string, commitmentId: string): PublicResult<WithdrawCommitmentResult> {
    return this.commit(withdrawCommitmentImpl(this.state, actor, commitmentId, this.now()));
  }

  advancePurchaseOrder(actor: string, input: AdvanceOrderInput): PublicResult<AdvanceOrderResult> {
    return this.commit(advancePurchaseOrderImpl(this.state, actor, input, this.now()));
  }

  // --- role views ---------------------------------------------------------------

  /** The customer-role view: only the principal's own rows (never widens). */
  getCustomerView(principal: string): CustomerView {
    return buildCustomerView(snapshotFromState(this.state), principal, this.now());
  }

  /** Operator cross-tenant aggregate view (role-gated, boundaries explicit). */
  getOperatorView(principal: string): RoleViewResult<OperatorView> {
    if (!this.operators.includes(principal)) {
      return {
        applied: false,
        reason: `principal '${principal}' does not hold the operator role`,
      };
    }
    return { applied: true, view: buildOperatorView(this.state, principal, this.now()) };
  }

  /** Developer integration/contract surface view (role-gated). */
  getDeveloperView(principal: string): RoleViewResult<DeveloperView> {
    if (!this.developers.includes(principal)) {
      return {
        applied: false,
        reason: `principal '${principal}' does not hold the developer role`,
      };
    }
    return { applied: true, view: buildDeveloperView(this.state, principal) };
  }

  // --- internals -----------------------------------------------------------------

  /** Persist write-before-ack, swap state, and redact the public result. */
  private commit<R extends CommandResult>(outcome: R): PublicResult<R> {
    if (outcome.applied) {
      this.persistence.persist(outcome.state);
      this.state = outcome.state;
    }
    return redact(outcome);
  }
}
