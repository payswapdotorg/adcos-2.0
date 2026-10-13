/**
 * surfaces 模块公开契约：角色体验投影（客户/操作员/开发者视图 + 共享同意
 * 状态机）与驱动真实旅程的 SurfacesService（组合 contracts/economics/lab/
 * organizations/group-purchasing 的公开契约；coordination 在旅程/应用层
 * 组合，不在本包声明依赖内 —— 见 architecture-policy.yaml）。
 * 消费方只允许从这里 import。租户隔离：命令结果与视图都只暴露该
 * principal 拥有/参与/归属的行；UNKNOWN/STALE/DEGRADED 以本来的状态呈现
 * （INVARIANTS #5）。持久化经 adapters 层 JSONL 存储（write-before-ack，
 * 重启可恢复）。浏览器 UI 与可访问性验收仍属后续工作单。
 */

// --- merged P2-W1 TL slice (domain projections + consent machine) -----------
export { buildCustomerView, resourceShareState } from "./domain/projections.js";
export type {
  DomainSnapshot,
  ResourceConsent,
  ResourceCard,
  ResourceShareState,
  GroupPurchaseCard,
  CustomerView,
} from "./domain/projections.js";
export { advanceConsent } from "./domain/journeys.js";
export type { ConsentEvent, ConsentTransition } from "./domain/journeys.js";

// --- role views (operator aggregate / developer contract surface) -----------
export { buildOperatorView, buildDeveloperView } from "./domain/role-views.js";
export type {
  OperatorView,
  OperatorOrganizationSummary,
  OperatorRequestProgress,
  OperatorFleetSummary,
  DeveloperView,
  DeveloperContractFamily,
  DeveloperVersionCompatibility,
  DeveloperPackageSurface,
  DeveloperStateRowKind,
} from "./domain/role-views.js";

// --- service state + persistence port ----------------------------------------
export type {
  SurfaceState,
  ResourceConsentRecord,
  OrderRecord,
  SurfaceStoreStats,
  SurfaceStatePersistence,
  CommandResult,
} from "./domain/state.js";

// --- service (journey commands + role-gated views) ---------------------------
import { SurfacesService } from "./domain/service.js";
export { SurfacesService } from "./domain/service.js";
export type { SurfacesServiceOptions, PublicResult, RoleViewResult } from "./domain/service.js";
export type {
  EnrollResourceInput,
  ResourceEnrollResult,
  ConsentEventResult,
  ObservationInput,
  ObservationResult,
} from "./domain/resource-commands.js";
export type {
  LabEvaluationInput,
  LabEvaluationResult,
  FormationInput,
  FormationResult,
  MembershipEventInput,
  MembershipEventResult,
  InviteMemberInput,
  InviteMemberResult,
} from "./domain/org-commands.js";
export type {
  OpenPurchaseInput,
  OpenPurchaseResult,
  ReceiveOfferResult,
  CommitInput,
  CommitResult,
  WithdrawCommitmentResult,
  AdvanceOrderInput,
  AdvanceOrderResult,
} from "./domain/purchase-commands.js";

// --- adapters-layer durable store (JsonlInboxStore pattern) ------------------
import { JsonlSurfaceStateStore } from "./adapters/jsonl-state-store.js";
export { JsonlSurfaceStateStore } from "./adapters/jsonl-state-store.js";

/**
 * Compose the surfaces service over the durable JSONL state log. The clock
 * is REQUIRED and injected (no hidden ambient time); operator/developer
 * role lists are deployment configuration, not runtime state.
 */
export function createSurfacesService(options: {
  /** Path to the durable JSONL state log (adapters-layer store). */
  statePath: string;
  /** Injected clock (epoch ms). */
  now: () => number;
  /** Principals holding the operator role. */
  operatorPrincipals?: readonly string[];
  /** Principals holding the developer role. */
  developerPrincipals?: readonly string[];
}): SurfacesService {
  return new SurfacesService({
    persistence: new JsonlSurfaceStateStore(options.statePath),
    now: options.now,
    operatorPrincipals: options.operatorPrincipals,
    developerPrincipals: options.developerPrincipals,
  });
}
