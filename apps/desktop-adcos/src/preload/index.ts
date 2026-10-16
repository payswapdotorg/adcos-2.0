/**
 * preload/index.ts — the typed bridge between the ADCOS product renderer
 * and the main process. Implements `AdcosBridge` from @adcos/product-web
 * over the single IPC channel; nothing else is exposed to the renderer.
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  ADCOS_BRIDGE_GLOBAL,
  ADCOS_IPC_CHANNEL,
  type AdcosBridge,
  type AdcosOutcome,
  type AdcosRequest,
  type AdcosResponses,
} from "../contract.js";

const bridge: AdcosBridge = {
  async call(
    request: AdcosRequest,
  ): Promise<AdcosOutcome<AdcosResponses[AdcosRequest["method"]]>> {
    const outcome = (await ipcRenderer.invoke(ADCOS_IPC_CHANNEL, request)) as
      | { ok: true; data: AdcosResponses[AdcosRequest["method"]] }
      | { ok: false; error: string };
    return outcome;
  },
};

contextBridge.exposeInMainWorld(ADCOS_BRIDGE_GLOBAL, bridge);
