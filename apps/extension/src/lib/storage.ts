export interface Settings { apiBase: string; token: string | null; email: string | null }
const DEFAULTS: Settings = { apiBase: "http://localhost:3000", token: null, email: null };
export async function getSettings(): Promise<Settings> {
  const s = (await chrome.storage.local.get("settings")).settings as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...(s ?? {}) };
}
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
