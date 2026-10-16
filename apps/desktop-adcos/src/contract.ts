/**
 * desktop-adcos 公开契约 — P5-W2 desktop product distribution。
 *
 * The desktop app's public surface: the session/runtime configuration the
 * main process composes (local demo identities, role configuration) and the
 * bridge the preload implements (`AdcosBridge` from @adcos/product-web).
 * The domain runtime stays behind the surfaces public contract — this app
 * only composes `createSurfacesService` and routes typed requests.
 */
export {
  ADCOS_BRIDGE_GLOBAL,
  ADCOS_PAYMENT_NOTICE,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  PRODUCT_WEB_VERSION,
} from "@adcos/product-web";
export type {
  AdcosBridge,
  AdcosOutcome,
  AdcosPrincipal,
  AdcosRequest,
  AdcosResponses,
  AdcosResult,
  AdcosSession,
} from "@adcos/product-web";

/** Desktop app version (kept in lockstep with the product-web version). */
export const ADCOS_DESKTOP_VERSION = "1.0.0";

/** The IPC channel the preload and main share. */
export const ADCOS_IPC_CHANNEL = "adcos:request";

/**
 * Local demo identities — honestly labeled local principals, NOT
 * authenticated accounts. Role configuration is deployment config, not
 * runtime state (mirrors SurfacesServiceOptions).
 */
export const ADCOS_LOCAL_PRINCIPALS: readonly {
  principal: string;
  note: string;
  role: "customer" | "operator" | "developer";
}[] = [
  { principal: "ada@local", note: "customer — local demo identity", role: "customer" },
  { principal: "grace@local", note: "customer — local demo identity", role: "customer" },
  { principal: "ops@local", note: "operator — local demo identity (role-gated views)", role: "operator" },
  { principal: "dev@local", note: "developer — local demo identity (role-gated views)", role: "developer" },
];

/** The principal the app boots with. */
export const ADCOS_DEFAULT_PRINCIPAL = "ada@local";
