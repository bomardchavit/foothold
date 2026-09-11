import Link from "next/link";
import { Apple, Monitor, Terminal, Puzzle, Check, ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/layout/wordmark";
import { latestRelease, detectPlatform, findAsset, mb, RELEASE_REPO, type Platform, type ReleaseAsset } from "@/lib/releases";

export const metadata = { title: "Download Foothold" };
export const revalidate = 900;

interface Option { key: Platform | "extension"; icon: typeof Apple; title: string; note: string; asset: ReleaseAsset | null; hint?: string }

export default async function DownloadPage() {
  const [release, { platform, inDesktopApp }] = await Promise.all([latestRelease(), detectPlatform()]);
  const a = release?.assets ?? [];
  const options: Option[] = [
    { key: "mac-arm", icon: Apple, title: "macOS · Apple Silicon", note: "M1 and later", asset: findAsset(a, /arm64\.dmg$/) },
    { key: "mac-intel", icon: Apple, title: "macOS · Intel", note: "x64", asset: findAsset(a, /x64\.dmg$/) },
    { key: "windows", icon: Monitor, title: "Windows", note: "10 and 11", asset: findAsset(a, /Setup.*\.exe$/) },
    { key: "linux", icon: Terminal, title: "Linux", note: "AppImage", asset: findAsset(a, /\.AppImage$/) },
  ];
  const ordered = [...options].sort((x, y) => Number(y.key === platform) - Number(x.key === platform));
  const extension = findAsset(a, /^foothold-extension.*\.zip$/);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/" className="focus-ring inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted-strong hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Back</Link>
      </header>

      <h1 className="mt-10 text-4xl">Get Foothold on your desktop</h1>
      <p className="mt-3 max-w-2xl text-[17px] text-muted-foreground">
        The desktop app is the same Foothold in its own window, with a Dock icon and no browser tabs. It updates itself in the background, and everything the team ships to the server shows up without a download.
      </p>

      {inDesktopApp && (
        <p className="mt-6 flex items-center gap-2 rounded-xl border border-primary/40 bg-accent px-4 py-3 text-sm" data-testid="in-desktop">
          <Check className="h-4 w-4 text-primary" />You are using the desktop app. It checks for updates on its own, and you can force a check from the Foothold menu.
        </p>
      )}

      {release ? (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {ordered.map((o) => (
              <a key={o.key} href={o.asset?.url ?? release.url} className="focus-ring group flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-4 transition hover:border-primary/50 hover:shadow-[0_8px_28px_-14px_rgba(0,0,0,0.25)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"><o.icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{o.title}{o.key === platform && <span className="ml-2 rounded-md bg-primary/12 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-strong">Your computer</span>}</span>
                  <span className="block text-[13px] text-muted-foreground">{o.note}{o.asset ? ` · ${mb(o.asset.size)}` : " · not in this release"}</span>
                </span>
              </a>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Version {release.version}{release.publishedAt ? ` · released ${new Date(release.publishedAt).toLocaleDateString()}` : ""} · <a className="underline" href={release.url}>release notes and checksums</a>
          </p>
        </>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed p-6">
          <p className="text-[15px] font-semibold">No build has been published yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Once a <code className="rounded bg-muted px-1">v*</code> tag is pushed to {RELEASE_REPO}, installers for macOS, Windows and Linux appear here automatically. You can build one locally in the meantime:</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-[12px] leading-5"><code>npm run desktop:dist</code></pre>
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-2xl">Chrome extension</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Fills Greenhouse, Lever, Ashby and Workday application forms from your profile. It never submits anything: you review every field and press submit yourself.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {extension ? (
            <a href={extension.url} className="focus-ring inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background transition hover:opacity-90"><Puzzle className="h-4 w-4" />Download the extension ({mb(extension.size)})</a>
          ) : (
            <span className="text-sm text-muted-foreground">Build it with <code className="rounded bg-muted px-1">npm run build:extension</code>, then load <code className="rounded bg-muted px-1">apps/extension/dist</code>.</span>
          )}
          <Link href="/settings/extension" className="focus-ring inline-flex h-11 items-center rounded-full border border-border px-5 text-[14px] font-semibold transition hover:bg-accent">Pairing instructions</Link>
        </div>
        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-[14px] text-muted-foreground">
          <li>Unzip the download.</li>
          <li>Open <code className="rounded bg-muted px-1">chrome://extensions</code> and turn on Developer mode.</li>
          <li>Choose “Load unpacked” and pick the unzipped folder.</li>
          <li>Open the extension, paste the pairing code from Settings → Chrome extension.</li>
        </ol>
      </section>

      <p className="mt-12 text-[13px] text-muted-foreground">Foothold never submits an application for you, and job data comes from public APIs and your own uploads only.</p>
    </main>
  );
}
