/**
 * organizations 模块公开契约：成员生命周期状态机与授权范围检查。
 * 消费方只允许从这里 import。纯函数、注入时钟；非法迁移一律拒绝（fail
 * closed），REVOKED 终态不可逆。
 */
export { advanceMembership, mandateCovers } from "./domain/lifecycle.js";
export type { MembershipEvent, MembershipTransition } from "./domain/lifecycle.js";
