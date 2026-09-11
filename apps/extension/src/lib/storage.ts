export interface Settings { apiBase: string; token: string | null; email: string | null }
/** Injected by vite from FOOTHOLD_APP_URL at build time; the popup can override it per install. */
declare const __FOOTHOLD_APP_URL__: string;
const DEFAULTS: Settings = { apiBase: __FOOTHOLD_APP_URL__, token: null, email: null };
export async function getSettings(): Promise<Settings> {
  const s = (await chrome.storage.local.get("settings")).settings as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...(s ?? {}) };
}
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
