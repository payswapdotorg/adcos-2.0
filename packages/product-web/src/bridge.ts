/**
 * bridge.ts — resolve the desktop-injected AdcosBridge and wrap it with
 * typed helpers. The renderer never imports the domain runtime; every
 * command goes through the preload bridge (Electron main process owns
 * the real SurfacesService over the durable JSONL store).
 */
import {
  ADCOS_BRIDGE_GLOBAL,
  AdcosBridgeUnavailableError,
  type AdcosBridge,
  type AdcosOutcome,
  type AdcosRequest,
  type AdcosResponses,
} from "./contract.js";

type BridgeGlobal = { [ADCOS_BRIDGE_GLOBAL]?: AdcosBridge };

function rawBridge(): AdcosBridge {
  const holder = globalThis as unknown as BridgeGlobal;
  const bridge = holder[ADCOS_BRIDGE_GLOBAL];
  if (bridge === undefined) {
    throw new AdcosBridgeUnavailableError();
  }
  return bridge;
}

/** True when the desktop runtime bridge is present. */
export function hasAdcosBridge(): boolean {
  const holder = globalThis as unknown as BridgeGlobal;
  return holder[ADCOS_BRIDGE_GLOBAL] !== undefined;
}

/** Typed request helper — the one entry the app uses. */
export async function adcos<M extends AdcosRequest["method"]>(
  request: Extract<AdcosRequest, { method: M }>,
): Promise<AdcosOutcome<AdcosResponses[M]>> {
  return rawBridge().call(request) as Promise<AdcosOutcome<AdcosResponses[M]>>;
}

/** Call that throws on transport-level errors (keeps `data` access honest). */
export async function adcosOr<M extends AdcosRequest["method"]>(
  request: Extract<AdcosRequest, { method: M }>,
): Promise<AdcosResponses[M]> {
  const outcome = await adcos(request);
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  return outcome.data;
}
