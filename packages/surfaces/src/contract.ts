/**
 * surfaces 模块公开契约（骨架）。
 * P2 工作通道落地实现时在此声明对外类型与服务；消费方只允许从这里 import
 * （跨模块深导入被 architecture-policy 禁止）。当前为占位：模块已注册、
 * 边界已锁定，等待所属工作单交付。
 */
export const surfacesModuleStatus = "registered-awaiting-implementation" as const;
