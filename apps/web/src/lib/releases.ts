import { headers } from "next/headers";

export interface ReleaseAsset { name: string; url: string; size: number }
export interface LatestRelease { version: string; publishedAt: string | null; url: string; assets: ReleaseAsset[] }

export const RELEASE_REPO = process.env.RELEASE_REPO ?? "bomardchavit/foothold";

/**
 * Latest published desktop/extension build, read from the GitHub Releases API and cached for 15 minutes.
 * Returns null when nothing is published yet (or GitHub is unreachable), so the page can say so honestly.
 */
export async function latestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "foothold-download-page", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const r = (await res.json()) as { tag_name: string; published_at: string | null; html_url: string; assets: Array<{ name: string; browser_download_url: string; size: number }> };
    return {
      version: r.tag_name.replace(/^v/, ""),
      publishedAt: r.published_at,
      url: r.html_url,
      assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
    };
  } catch {
    return null;
  }
}

export type Platform = "mac-arm" | "mac-intel" | "windows" | "linux" | "unknown";

/** Best guess at the visitor's platform, used only to put the right button first. */
export async function detectPlatform(): Promise<{ platform: Platform; inDesktopApp: boolean }> {
  const ua = (await headers()).get("user-agent") ?? "";
  const inDesktopApp = /FootholdDesktop/i.test(ua);
  if (/Windows/i.test(ua)) return { platform: "windows", inDesktopApp };
  if (/Mac OS X|Macintosh/i.test(ua)) return { platform: /ARM|Apple Silicon/i.test(ua) ? "mac-arm" : "mac-intel", inDesktopApp };
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return { platform: "linux", inDesktopApp };
  return { platform: "unknown", inDesktopApp };
}

export const findAsset = (assets: ReleaseAsset[], test: RegExp) => assets.find((a) => test.test(a.name)) ?? null;
export const mb = (bytes: number) => `${Math.round(bytes / 1_048_576)} MB`;
