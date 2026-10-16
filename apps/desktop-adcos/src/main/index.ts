/**
 * main/index.ts — the ADCOS Desktop main process (P5-W2).
 *
 * Composition law: the ONLY domain composition is `createSurfacesService`
 * from the surfaces public contract — the real SurfacesService over the
 * durable JSONL store in the user-data directory, with an injected clock.
 * The window loads ONLY the built ADCOS product surface (local files);
 * the inherited ZCode substrate is neither bundled nor reachable.
 */
import { join } from "node:path";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { app, BrowserWindow, ipcMain } from "electron";
import { createSurfacesService } from "@adcos/surfaces";
import { ADCOS_IPC_CHANNEL } from "../contract.js";
import { DesktopSession } from "./session.js";
import { routeAdcosRequest } from "./router.js";

/** Single-instance lock: one ADCOS desktop per user session. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function statePath(): string {
  return join(app.getPath("userData"), "state", "adcos-state.jsonl");
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "ADCOS",
    backgroundColor: "#0b0f0e",
    show: false,
    webPreferences: {
      preload: join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  // Product lock: local product surface only. No remote URLs, ever.
  const indexUrl = new URL(`file://${join(__dirname, "..", "renderer", "index.html")}`);
  await window.loadURL(indexUrl.href);
  // Restrict navigation to the bundled product surface only.
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
    }
  });
  // Deny new windows entirely (no zcode surface, no external content).
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow = window;
}

function registerIpc(): void {
  const service = createSurfacesService({
    statePath: statePath(),
    now: () => Date.now(),
    operatorPrincipals: ["ops@local"],
    developerPrincipals: ["dev@local"],
  });
  const session = new DesktopSession();

  ipcMain.handle(ADCOS_IPC_CHANNEL, (_event, request: unknown) => {
    try {
      return { ok: true, data: routeAdcosRequest(service, session, request as never) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  void createWindow();

  app.on("second-instance", () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// --- crash-pad hygiene: keep a small append-only main log under userData ---
export async function logMain(line: string): Promise<void> {
  const dir = app.getPath("userData");
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, "main.log"), `${new Date().toISOString()} ${line}\n`, "utf8");
}

// Touch fs imports for side-effect-free tree-shaking friendliness.
export const __fsProbe = { readFile, writeFile };
