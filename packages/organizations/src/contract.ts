/**
 * organizations 模块公开契约：成员生命周期状态机与授权范围检查。
 * 消费方只允许从这里 import。纯函数、注入时钟；非法迁移一律拒绝（fail
 * closed），REVOKED 终态不可逆。
 * 成立/治理流（超出成员状态机）：从 Lab PURSUE 裁决成立组织（候选聚集 →
 * 创始人同意 → 附初始授权成立）、授权修订（显式成员同意规则：收窄需
 * 本人同意、放宽需全体活跃成员一致同意）、解散/终止（未平仓承诺一律
 * EXPIRED/MARKED_UNUSABLE 显式处置，绝不静默转移）。全部 fail-closed。
 */
export { advanceMembership, mandateCovers } from "./domain/lifecycle.js";
export type { MembershipEvent, MembershipTransition } from "./domain/lifecycle.js";
export { foundOrganization, scopeCovers } from "./domain/formation.js";
export type {
  FoundingState,
  FounderCandidate,
  InitialMandateInput,
  FoundingInput,
  FoundingResult,
} from "./domain/formation.js";
export { amendMandate } from "./domain/amendment.js";
export type {
  MandateAmendmentClassification,
  MandateAmendment,
  AmendMandateOptions,
  MandateAmendmentResult,
} from "./domain/amendment.js";
export { dissolveOrganization } from "./domain/dissolution.js";
export type {
  CommitmentDispositionKind,
  CommitmentDisposition,
  DissolutionInput,
  DissolutionResult,
} from "./domain/dissolution.js";
export { evaluateConsents } from "./domain/consent.js";
export type { ConsentRecord, ConsentEvaluation } from "./domain/consent.js";
