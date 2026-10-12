/**
 * lab 模块公开契约：Reality Lab 基线/无变化对比、机会证据与建议。
 * 消费方只允许从这里 import。Lab 是建议域：绝不外发副作用；所有对比对
 * 固定快照 + 注入时钟可复现（同输入 → 同输出，测试锁定）。
 */
export {
  runComparison,
  asOpportunityEvidence,
  MISSING_METRIC_CONFIDENCE_PENALTY,
} from "./domain/comparison.js";
export type { StrategyArm, ComparisonOptions } from "./domain/comparison.js";
