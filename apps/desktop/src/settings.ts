import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface Settings {
  /** Base URL of the Foothold server this app talks to (no trailing slash). */
  serverUrl: string | null;
  bounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean };
}

const FILE = () => path.join(app.getPath("userData"), "settings.json");
let cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  try {
    cache = { ...(JSON.parse(await fs.readFile(FILE(), "utf8")) as Settings) };
  } catch {
    cache = { serverUrl: null };
  }
  return cache;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  cache = next;
  await fs.mkdir(path.dirname(FILE()), { recursive: true }).catch(() => undefined);
  await fs.writeFile(FILE(), JSON.stringify(next, null, 2));
  return next;
}

/** Trim, add https:// when the scheme is missing, drop a trailing slash. Returns null when it is not a usable http(s) URL. */
export function normalizeServerUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}
