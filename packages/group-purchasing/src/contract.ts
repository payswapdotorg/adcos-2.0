/**
 * group-purchasing 模块公开契约：请求/报价/承诺流与门槛判定。
 * 消费方只允许从这里 import。纯函数、注入时钟；短缺=THRESHOLD_NOT_MET、
 * 过期=EXPIRED、无报价=COMMITMENT_OPEN —— 状态语义显式且可测。
 */
export { evaluateCommitments, allocationTotal } from "./domain/threshold.js";
export type { CommitmentEvaluation } from "./domain/threshold.js";
