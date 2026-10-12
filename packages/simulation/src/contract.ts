/**
 * simulation 模块公开契约：影子/模拟 harness —— 在固定场景快照上驱动
 * lab/economics/organizations/group-purchasing 产出可复现报告。仅建议：
 * 不产生任何外部副作用（真实下单/支付绝不由此发起）。
 */
export { runScenario } from "./domain/harness.js";
export type { Scenario, ScenarioReport } from "./domain/harness.js";
