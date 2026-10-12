/**
 * surfaces 模块公开契约：角色体验投影（客户/成员视图 + 共享同意状态机）。
 * 消费方只允许从这里 import。租户隔离：每个视图只暴露该 principal 拥有/
 * 参与/归属的行；UNKNOWN/STALE/DEGRADED 以本来的状态呈现（INVARIANTS #5）。
 * 当前为领域切片：浏览器 UI 与可访问性验收在后续工作单落地。
 */
export { buildCustomerView, resourceShareState } from "./domain/projections.js";
export type {
  DomainSnapshot,
  ResourceCard,
  ResourceShareState,
  GroupPurchaseCard,
  CustomerView,
} from "./domain/projections.js";
export { advanceConsent } from "./domain/journeys.js";
export type { ConsentEvent, ConsentTransition } from "./domain/journeys.js";
