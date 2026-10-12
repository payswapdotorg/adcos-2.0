/**
 * economics 模块公开契约：集体经济的显式成本/置信度计算与机会评估。
 * 消费方只允许从这里 import（跨模块深导入被 architecture-policy 禁止）。
 * 实现位于 src/domain（纯函数、注入时钟，可对固定证据快照复现决策）。
 */
export {
  evaluateOpportunity,
  summarizeOfferCosts,
  DEFAULT_EVALUATION_POLICY,
} from "./domain/evaluation.js";
export type {
  EvaluationPolicy,
  EvaluationVerdict,
  OpportunityEvaluation,
  OfferCostSummary,
} from "./domain/evaluation.js";
