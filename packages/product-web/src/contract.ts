/**
 * product-web 公开契约 — P5-W2 desktop product distribution。
 *
 * The ADCOS product UI's public surface: the typed bridge the desktop
 * preload implements (and the renderer consumes), plus the product
 * constants. The domain runtime is NOT here: the real SurfacesService
 * (over the durable JSONL store) is composed in the desktop app's main
 * process; this package reaches it only through `AdcosBridge.call`.
 *
 * Honesty laws carried in the contract itself:
 *  - `AdcosPaymentNotice` is surfaced wherever money is shown (ADR-0004:
 *    opaque references; live rail selection is BLOCKED-ON-OPERATOR).
 *  - Product capabilities are stated per the repository README: the specs
 *    do not imply the capabilities are already implemented; the UI shows
 *    persisted, reproducible local-journey state only.
 */
import type {
  AdvanceOrderInput,
  AdvanceOrderResult,
  CommandResult,
  CommitInput,
  CommitResult,
  ConsentEvent,
  ConsentEventResult,
  CustomerView,
  DeveloperView,
  EnrollResourceInput,
  FormationInput,
  FormationResult,
  InviteMemberInput,
  InviteMemberResult,
  LabEvaluationInput,
  LabEvaluationResult,
  MembershipEventInput,
  MembershipEventResult,
  ObservationInput,
  ObservationResult,
  OpenPurchaseInput,
  OpenPurchaseResult,
  OperatorView,
  ReceiveOfferResult,
  ResourceEnrollResult,
  RoleViewResult,
  SurfaceStoreStats,
  WithdrawCommitmentResult,
} from "@adcos/surfaces";
import type { GroupPurchaseOffer } from "@adcos/contracts";

export const PRODUCT_NAME = "ADCOS";
export const PRODUCT_TAGLINE = "Connectivity OS";
export const PRODUCT_WEB_VERSION = "1.0.0";

/** The ADR-0004 notice every money-adjacent surface must carry. */
export const ADCOS_PAYMENT_NOTICE =
  "Payments use opaque typed references (ADR-0004). No live payment rail is selected or integrated; live money movement is BLOCKED-ON-OPERATOR.";

/** A local demo identity — honestly labeled, never presented as auth. */
export interface AdcosPrincipal {
  principal: string;
  note: string;
}

export interface AdcosSession {
  principal: string;
  roles: readonly string[];
  productVersion: string;
  persistence: SurfaceStoreStats;
}

/** Service command results are JSON-serializable public outcomes. */
export interface AdcosBridgeOk<T> {
  ok: true;
  data: T;
}
export interface AdcosBridgeError {
  ok: false;
  error: string;
}
export type AdcosOutcome<T> = AdcosBridgeOk<T> | AdcosBridgeError;

export type AdcosResult<T> = Omit<T, "state">;

/** Requests are plain JSON — safe for contextBridge/IPC. */
export type AdcosRequest =
  | { method: "session" }
  | { method: "listPrincipals" }
  | { method: "switchPrincipal"; principal: string }
  | { method: "durability" }
  | { method: "customerView" }
  | { method: "operatorView" }
  | { method: "developerView" }
  | { method: "enrollResource"; input: EnrollResourceInput }
  | { method: "consent"; resourceId: string; event: ConsentEvent }
  | { method: "revokeResource"; resourceId: string }
  | { method: "observe"; resourceId: string; input: ObservationInput }
  | { method: "runLabEvaluation"; input: LabEvaluationInput }
  | { method: "formOrganization"; input: FormationInput }
  | { method: "applyMembershipEvent"; input: MembershipEventInput }
  | { method: "inviteMember"; input: InviteMemberInput }
  | { method: "openGroupPurchase"; input: OpenPurchaseInput }
  | { method: "receiveOffer"; offer: GroupPurchaseOffer }
  | { method: "commitToPurchase"; input: CommitInput }
  | { method: "withdrawCommitment"; commitmentId: string }
  | { method: "advancePurchaseOrder"; input: AdvanceOrderInput };

/** Response payloads — the public result types, stripped of service state. */
export interface AdcosResponses {
  session: AdcosSession;
  listPrincipals: { principals: readonly AdcosPrincipal[] };
  switchPrincipal: AdcosResult<object>;
  durability: SurfaceStoreStats;
  customerView: CustomerView;
  operatorView: RoleViewResult<OperatorView>;
  developerView: RoleViewResult<DeveloperView>;
  enrollResource: AdcosResult<ResourceEnrollResult>;
  consent: AdcosResult<ConsentEventResult>;
  revokeResource: AdcosResult<CommandResult>;
  observe: AdcosResult<ObservationResult>;
  runLabEvaluation: AdcosResult<LabEvaluationResult>;
  formOrganization: AdcosResult<FormationResult>;
  applyMembershipEvent: AdcosResult<MembershipEventResult>;
  inviteMember: AdcosResult<InviteMemberResult>;
  openGroupPurchase: AdcosResult<OpenPurchaseResult>;
  receiveOffer: AdcosResult<ReceiveOfferResult>;
  commitToPurchase: AdcosResult<CommitResult>;
  withdrawCommitment: AdcosResult<WithdrawCommitmentResult>;
  advancePurchaseOrder: AdcosResult<AdvanceOrderResult>;
}

/** The single bridge method the desktop preload implements. */
export interface AdcosBridge {
  call(request: AdcosRequest): Promise<AdcosOutcome<AdcosResponses[AdcosRequest["method"]]>>;
}

/** Thrown when the UI runs outside the ADCOS desktop runtime. */
export class AdcosBridgeUnavailableError extends Error {
  constructor() {
    super(
      "The ADCOS product surface requires the ADCOS desktop runtime (the domain service runs in the desktop main process).",
    );
    this.name = "AdcosBridgeUnavailableError";
  }
}

/** The global the ADCOS desktop preload exposes (contextBridge). */
export const ADCOS_BRIDGE_GLOBAL = "__adcos_bridge__";
