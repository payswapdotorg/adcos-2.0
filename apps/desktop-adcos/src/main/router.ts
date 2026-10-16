/**
 * router.ts — the pure request router over the REAL SurfacesService. This
 * module is Electron-free on purpose: the node test battery drives the
 * same wiring the ipcMain handlers delegate to, against the same durable
 * JSONL store the app ships.
 */
import type { SurfacesService } from "@adcos/surfaces";
import { ADCOS_LOCAL_PRINCIPALS, type AdcosRequest, type AdcosResponses, type AdcosSession } from "../contract.js";
import type { DesktopSession } from "./session.js";

function rolesFor(principal: string): string[] {
  const roles = ["customer"];
  if (principal === "ops@local") roles.push("operator");
  if (principal === "dev@local") roles.push("developer");
  return roles;
}

/** Per-method handlers: request discriminant and response stay correlated. */
const handlers: {
  [K in AdcosRequest["method"]]: (
    service: SurfacesService,
    session: DesktopSession,
    request: Extract<AdcosRequest, { method: K }>,
  ) => AdcosResponses[K];
} = {
  session: (service, session) => ({
    principal: session.principal,
    roles: rolesFor(session.principal),
    productVersion: "1.0.0",
    persistence: service.durability(),
  }),
  listPrincipals: () => ({
    principals: ADCOS_LOCAL_PRINCIPALS.map(({ principal, note }) => ({ principal, note })),
  }),
  switchPrincipal: (_service, session, request) => session.switch(request.principal),
  durability: (service) => service.durability(),
  customerView: (service, session) => service.getCustomerView(session.principal),
  operatorView: (service, session) => service.getOperatorView(session.principal),
  developerView: (service, session) => service.getDeveloperView(session.principal),
  enrollResource: (service, session, request) =>
    service.enrollResource(session.principal, request.input),
  consent: (service, session, request) =>
    service.applyConsentEvent(session.principal, request.resourceId, request.event),
  revokeResource: (service, session, request) =>
    service.revokeResource(session.principal, request.resourceId),
  observe: (service, session, request) =>
    service.recordObservation(session.principal, request.resourceId, request.input),
  runLabEvaluation: (service, _session, request) => service.runLabEvaluation(request.input),
  formOrganization: (service, session, request) =>
    service.formOrganization(session.principal, request.input),
  applyMembershipEvent: (service, session, request) =>
    service.applyMembershipEvent(session.principal, request.input),
  inviteMember: (service, session, request) =>
    service.inviteMember(session.principal, request.input),
  openGroupPurchase: (service, session, request) =>
    service.openGroupPurchase(session.principal, request.input),
  receiveOffer: (service, session, request) =>
    service.receiveOffer(session.principal, request.offer),
  commitToPurchase: (service, session, request) =>
    service.commitToPurchase(session.principal, request.input),
  withdrawCommitment: (service, session, request) =>
    service.withdrawCommitment(session.principal, request.commitmentId),
  advancePurchaseOrder: (service, session, request) =>
    service.advancePurchaseOrder(session.principal, request.input),
};

/**
 * Route one typed request. Returns the public JSON payload (the same shape
 * the preload hands the renderer) or throws on an unknown method — the
 * IPC boundary converts that into an `AdcosBridgeError`.
 */
export function routeAdcosRequest<M extends AdcosRequest["method"]>(
  service: SurfacesService,
  session: DesktopSession,
  request: Extract<AdcosRequest, { method: M }>,
): AdcosResponses[M] {
  const handler = handlers[request.method] as (
    service: SurfacesService,
    session: DesktopSession,
    request: Extract<AdcosRequest, { method: M }>,
  ) => AdcosResponses[M];
  return handler(service, session, request);
}

export type { AdcosSession };
