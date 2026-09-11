import { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme, session } from "electron";
import path from "node:path";
import { loadSettings, saveSettings, normalizeServerUrl } from "./settings";
import { initUpdates, check as checkForUpdates, installNow, currentUpdateState } from "./updates";

/** Baked in at build time (FOOTHOLD_APP_URL); empty means the app asks on first run. */
const BUILT_IN_URL: string = process.env.FOOTHOLD_APP_URL ?? "";
const PAGES = path.join(__dirname, "pages");
const BG_LIGHT = "#faf6ee";
const BG_DARK = "#26221e";

let win: BrowserWindow | null = null;
let serverUrl: string | null = null;

const pageUrl = (mode: "connect" | "error" | "signin", params: Record<string, string> = {}) =>
  `file://${path.join(PAGES, "shell.html")}?${new URLSearchParams({ mode, ...params }).toString()}`;

const isAppOrigin = (url: string) => {
  if (!serverUrl) return false;
  try { return new URL(url).origin === new URL(serverUrl).origin; } catch { return false; }
};

function createWindow(bounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean }) {
  win = new BrowserWindow({
    width: bounds?.width ?? 1360,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? BG_DARK : BG_LIGHT,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 18 } : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });
  if (bounds?.maximized) win.maximize();
  win.once("ready-to-show", () => win?.show());

  // Employer apply pages, docs and OAuth consent screens that are not ours open in the real browser, where the
  // extension and the user's logins live.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppOrigin(url)) return { action: "allow" };
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file://") || isAppOrigin(url) || isOAuthUrl(url)) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = aborted (a normal in-app navigation)
    void win?.loadURL(pageUrl("error", { url: failedUrl, message: desc || `Network error ${code}` }));
  });

  const save = () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getNormalBounds();
    void saveSettings({ bounds: { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() } });
  };
  win.on("resized", save);
  win.on("moved", save);
  win.on("close", save);
  win.on("closed", () => { win = null; });
  return win;
}

/** Sign-in providers render their own pages; keep them in-window so the session cookie lands in the app. */
function isOAuthUrl(url: string): boolean {
  return /^https:\/\/(accounts\.google\.com|[a-z0-9-]+\.okta\.com|login\.microsoftonline\.com|github\.com\/login)/i.test(url);
}

async function loadServerOrConnect() {
  if (!win) return;
  if (!serverUrl) { await win.loadURL(pageUrl("connect")); return; }
  await win.loadURL(serverUrl).catch(() => undefined);
}

/** A server is usable when /api/version answers as a Foothold server. */
async function probe(url: string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${url}/api/version`, { headers: { accept: "application/json" }, redirect: "follow" });
    if (!res.ok) return { ok: false, error: `The server answered ${res.status} at ${url}/api/version.` };
    const body = (await res.json()) as { app?: string; version?: string };
    if (body.app !== "foothold") return { ok: false, error: "That URL answered, but it is not a Foothold server." };
    return { ok: true, version: body.version ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" as const },
        { label: "Check for Updates…", click: () => void checkForUpdates(true) },
        { type: "separator" as const },
        { label: "Server…", accelerator: "CmdOrCtrl+,", click: () => void win?.loadURL(pageUrl("connect", { current: serverUrl ?? "" })) },
        { type: "separator" as const },
        { role: "services" as const }, { type: "separator" as const },
        { role: "hide" as const }, { role: "hideOthers" as const }, { role: "unhide" as const },
        { type: "separator" as const }, { role: "quit" as const },
      ],
    }] : []),
    {
      label: "File",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => void loadServerOrConnect() },
        { label: "Open in Browser", click: () => { if (serverUrl) void shell.openExternal(win?.webContents.getURL().startsWith("http") ? win.webContents.getURL() : serverUrl); } },
        { type: "separator" },
        { label: "Paste Sign-in Link…", click: () => void win?.loadURL(pageUrl("signin", { server: serverUrl ?? "" })) },
        ...(isMac ? [] : [{ label: "Server…", accelerator: "CmdOrCtrl+,", click: () => void win?.loadURL(pageUrl("connect", { current: serverUrl ?? "" })) } as Electron.MenuItemConstructorOptions,
          { label: "Check for Updates…", click: () => void checkForUpdates(true) } as Electron.MenuItemConstructorOptions,
          { type: "separator" } as Electron.MenuItemConstructorOptions, { role: "quit" } as Electron.MenuItemConstructorOptions]),
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }] },
    { label: "Window", submenu: isMac ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] : [{ role: "minimize" }, { role: "close" }] },
    {
      role: "help",
      submenu: [
        { label: "Foothold Help", click: () => void shell.openExternal("https://github.com/bomardchavit/foothold#readme") },
        { label: "Report an Issue", click: () => void shell.openExternal("https://github.com/bomardchavit/foothold/issues/new") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  const fromBundledPage = (e: Electron.IpcMainInvokeEvent) => e.senderFrame?.url.startsWith("file://") ?? false;

  ipcMain.handle("settings:serverUrl", () => serverUrl);
  ipcMain.handle("app:connect", async (e, raw: string) => {
    if (!fromBundledPage(e)) return { ok: false, error: "Not allowed" };
    const url = normalizeServerUrl(String(raw ?? ""));
    if (!url) return { ok: false, error: "Enter a URL like https://foothold.example.com or http://localhost:3000" };
    const p = await probe(url);
    if (!p.ok) return p;
    serverUrl = url;
    await saveSettings({ serverUrl: url });
    setImmediate(() => void win?.loadURL(url)); // reply first: loading the app destroys the page that called this
    return { ok: true as const };
  });
  ipcMain.handle("app:signInLink", async (e, raw: string) => {
    if (!fromBundledPage(e)) return { ok: false, error: "Not allowed" };
    const link = String(raw ?? "").trim();
    if (!isAppOrigin(link)) return { ok: false, error: `Paste the link from your email. It must start with ${serverUrl ?? "your server URL"}.` };
    setImmediate(() => void win?.loadURL(link));
    return { ok: true as const };
  });
  ipcMain.handle("app:retry", async () => { await loadServerOrConnect(); });
  ipcMain.handle("app:openExternal", async (_e, url: string) => { if (/^https?:\/\//i.test(url)) await shell.openExternal(url); });
  ipcMain.handle("update:check", () => checkForUpdates(true));
  ipcMain.handle("update:install", () => installNow());
  ipcMain.handle("update:state", () => currentUpdateState());
}

/** foothold://open?url=… opens a link (a sign-in link, a job) in the app window. */
function handleDeepLink(url: string) {
  try {
    const u = new URL(url);
    const target = u.searchParams.get("url");
    if (target && isAppOrigin(target)) void win?.loadURL(target);
  } catch { /* ignore malformed links */ }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const link = argv.find((a) => a.startsWith("foothold://"));
    if (link) handleDeepLink(link);
  });
  app.on("open-url", (e, url) => { e.preventDefault(); handleDeepLink(url); });

  void app.whenReady().then(async () => {
    app.setAsDefaultProtocolClient("foothold");
    const settings = await loadSettings();
    serverUrl = settings.serverUrl ?? (BUILT_IN_URL ? normalizeServerUrl(BUILT_IN_URL) : null);

    // Identify the shell to the server (the web app hides the download CTA and can adapt links).
    const ua = `${session.defaultSession.getUserAgent()} FootholdDesktop/${app.getVersion()}`;
    session.defaultSession.setUserAgent(ua);

    registerIpc();
    buildMenu();
    createWindow(settings.bounds);
    initUpdates(() => win);
    await loadServerOrConnect();

    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); void loadServerOrConnect(); } });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
