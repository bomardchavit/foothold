import { app, BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";

export type UpdateState = { status: "idle" | "checking" | "available" | "downloading" | "ready" | "error"; version?: string; percent?: number; message?: string };

let state: UpdateState = { status: "idle" };
let promptedFor: string | null = null;
const SIX_HOURS = 6 * 60 * 60 * 1000;

export function currentUpdateState(): UpdateState { return state; }

function broadcast(next: UpdateState) {
  state = next;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("update:state", next);
}

/**
 * Auto-update against the GitHub release the app was published to. The shell updates itself; the app's own screens come
 * from the server, so a server deploy reaches every user without a new installer.
 */
export function initUpdates(getWindow: () => BrowserWindow | null) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: console.log, warn: console.warn, error: console.error, debug: () => undefined } as never;

  autoUpdater.on("checking-for-update", () => broadcast({ status: "checking" }));
  autoUpdater.on("update-not-available", () => broadcast({ status: "idle" }));
  autoUpdater.on("update-available", (i) => broadcast({ status: "downloading", version: i.version, percent: 0 }));
  autoUpdater.on("download-progress", (p) => broadcast({ status: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("error", (e) => broadcast({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  autoUpdater.on("update-downloaded", async (i) => {
    broadcast({ status: "ready", version: i.version });
    if (promptedFor === i.version) return;
    promptedFor = i.version;
    const win = getWindow();
    const { response } = await dialog.showMessageBox(win ?? undefined!, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Foothold ${i.version} is ready`,
      detail: "The update installs when you restart. Nothing you are working on is stored in the app itself.",
    });
    if (response === 0) { setImmediate(() => autoUpdater.quitAndInstall()); }
  });

  if (!app.isPackaged) { console.log("[updates] dev build: auto-update disabled"); return; }
  setTimeout(() => void check(), 5_000);
  setInterval(() => void check(), SIX_HOURS);
}

export async function check(explicit = false): Promise<void> {
  if (!app.isPackaged) {
    if (explicit) await dialog.showMessageBox({ type: "info", message: "Development build", detail: "Auto-update only runs in an installed build." });
    return;
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    if (explicit && !r?.updateInfo) await dialog.showMessageBox({ type: "info", message: "Foothold is up to date", detail: `Version ${app.getVersion()}.` });
    else if (explicit && r && r.updateInfo.version === app.getVersion()) await dialog.showMessageBox({ type: "info", message: "Foothold is up to date", detail: `Version ${app.getVersion()}.` });
  } catch (e) {
    broadcast({ status: "error", message: e instanceof Error ? e.message : String(e) });
    if (explicit) await dialog.showMessageBox({ type: "warning", message: "Could not check for updates", detail: e instanceof Error ? e.message : String(e) });
  }
}

export function installNow() { autoUpdater.quitAndInstall(); }
