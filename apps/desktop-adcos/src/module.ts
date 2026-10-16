/**
 * desktop-adcos 模块清单：ADCOS Desktop (Electron, product-locked).
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 contract.ts。
 * P5-W2 落地：主进程组合真实 SurfacesService（durable JSONL），
 * preload 暴露类型化 bridge；渲染层是 @adcos/product-web。
 */
export const desktopAdcosModule = {
  id: "desktop-adcos",
  requires: ["surfaces", "product-web"],
  provides: ["desktop-adcos"],
  publicEntrypoints: ["contract.ts"],
} as const;
