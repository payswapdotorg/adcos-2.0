/**
 * contracts 模块清单：ADCOS 2.0 canonical shared contracts（版本化共享契约与公共端口）。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 contract.ts（index.ts 再导出）。
 */
export const contractsModule = {
  id: "contracts",
  requires: ["shared"],
  provides: ["adcos-contracts"],
  publicEntrypoints: ["contract.ts", "index.ts"],
} as const;
