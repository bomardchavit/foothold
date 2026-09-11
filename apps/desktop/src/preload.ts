import { contextBridge, ipcRenderer } from "electron";

type UpdateState = { status: "idle" | "checking" | "available" | "downloading" | "ready" | "error"; version?: string; percent?: number; message?: string };

/**
 * The only bridge between the renderer (our own web app, or the bundled connect/error pages) and the main process.
 * Everything here is safe to expose to a remote page: no filesystem, no shell, no arbitrary IPC.
 */
contextBridge.exposeInMainWorld("foothold", {
  desktop: true,
  appVersion: process.env.FOOTHOLD_VERSION ?? "",
  platform: process.platform,
  getServerUrl: (): Promise<string | null> => ipcRenderer.invoke("settings:serverUrl"),
  /** Validate and store the server URL, then load it. Only accepted from the bundled pages. */
  connect: (url: string): Promise<{ ok: true } | { ok: false; error: string }> => ipcRenderer.invoke("app:connect", url),
  /** Load a pasted sign-in link (must be on the configured server). */
  openSignInLink: (url: string): Promise<{ ok: true } | { ok: false; error: string }> => ipcRenderer.invoke("app:signInLink", url),
  retry: (): Promise<void> => ipcRenderer.invoke("app:retry"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("app:openExternal", url),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke("update:check"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  onUpdateState: (cb: (s: UpdateState) => void) => {
    const handler = (_e: unknown, s: UpdateState) => cb(s);
    ipcRenderer.on("update:state", handler);
    return () => ipcRenderer.off("update:state", handler);
  },
});
