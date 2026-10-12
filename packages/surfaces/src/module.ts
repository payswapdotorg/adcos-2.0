/**
 * surfaces 模块清单：Product surfaces: customer/provider/member/admin journeys and role experience projections。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 contract.ts。
 * 骨架由 TL 在 P1-W1 合并时创建（managed 模块需要 module.ts/contract.ts 工件）；
 * 实现由对应 P2 工作通道按其工作单落地，分层遵循 domain → app → adapters。
 */
export const surfacesModule = {
  id: "surfaces",
  requires: ["contracts", "shared", "ui", "web", "economics", "lab", "organizations", "group-purchasing"],
  provides: ["surfaces"],
  publicEntrypoints: ["contract.ts"],
} as const;
