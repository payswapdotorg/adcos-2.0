/**
 * coordination 模块公开契约：实例协调 —— 信封校验管线、持久收件箱/发件箱
 * 生命周期、作用域委托链校验、能力发现。消费方只允许从这里 import。
 * domain 层纯函数、注入时钟；未知/畸形一律 fail closed（可复核）。
 */
export { validateEnvelope, createEnvelopeReplayGuard } from "./domain/envelope-validation.js";
export type {
  ValidationContext,
  ValidationFailure,
  ValidationResult,
} from "./domain/envelope-validation.js";
export { beginProcessing, recordOutcome, isDeadLettered } from "./domain/inbox.js";
export type { LifecycleTransition } from "./domain/inbox.js";
export { checkDelegationChain } from "./domain/delegation.js";
export type { DelegationCheck } from "./domain/delegation.js";
export { discoverResources } from "./domain/discovery.js";
export type { DiscoveryQuery, DiscoveredResource } from "./domain/discovery.js";
