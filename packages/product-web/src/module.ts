/**
 * product-web 模块清单：ADCOS product web surface (customer/product UI).
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 contract.ts。
 * P5-W2 落地：Electron 桌面运行时承载（域运行时在主进程，经 preload
 * bridge 调用）；本包对 @adcos/surfaces 仅类型依赖。
 */
export const productWebModule = {
  id: "product-web",
  requires: ["surfaces", "contracts"],
  provides: ["product-web"],
  publicEntrypoints: ["contract.ts"],
} as const;
