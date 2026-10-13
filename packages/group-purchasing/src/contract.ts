/**
 * group-purchasing 模块公开契约：请求/报价/承诺流与门槛判定。
 * 消费方只允许从这里 import。纯函数、注入时钟；短缺=THRESHOLD_NOT_MET、
 * 过期=EXPIRED、无报价=COMMITMENT_OPEN —— 状态语义显式且可测。
 * 成员分配：比例分配（显式舍入策略）、成员级分配记录（含 offer/承诺
 * 溯源）、履约前退出的再分配、短缺/过期显式处理；金额为整数最小单位
 * 的证据投影（ADR-0004 —— 绝不在此执行支付）。
 */
export { evaluateCommitments, allocationTotal } from "./domain/threshold.js";
export type { CommitmentEvaluation } from "./domain/threshold.js";
export { advanceOrder, refundAdmissible } from "./domain/order-lifecycle.js";
export type { OrderEvent, OrderGuards, OrderTransition } from "./domain/order-lifecycle.js";
export { computeMemberAllocations, reallocateOnWithdrawal } from "./domain/allocation.js";
export type { AllocationInput, WithdrawalInput } from "./domain/allocation.js";
export { DEFAULT_ROUNDING_POLICY, ALLOCATION_RULE_VERSION } from "./domain/allocation-core.js";
export type {
  RoundingPolicy,
  MemberAllocation,
  MemberAllocationStatus,
  AllocationState,
  AllocationResult,
} from "./domain/allocation-core.js";
