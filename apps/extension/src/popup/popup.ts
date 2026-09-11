import type { AutofillProfile } from "@foothold/shared";
import { getSettings, setSettings } from "../lib/storage";
import type { ScanResult, FillResult, ToContent, ToBackground } from "../lib/messages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const bg = <T>(msg: ToBackground) => new Promise<T>((resolve) => chrome.runtime.sendMessage(msg, resolve));
async function tabMsg<T>(msg: ToContent): Promise<T | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try { return await chrome.tabs.sendMessage(tab.id, msg) as T; } catch { return null; }
}

let scan: ScanResult | null = null;
let filledCount = 0;
let profile: AutofillProfile | null = null;

async function refresh() {
  const s = await getSettings();
  $("setup").hidden = Boolean(s.token);
  $("main").hidden = !s.token;
  ($("apiBase") as HTMLInputElement).value = s.apiBase;
  if (!s.token) return;
  $("email").textContent = s.email ?? "";
  scan = await tabMsg<ScanResult>({ type: "scan" });
  const det = $("detected");
  if (!scan) { det.textContent = "Open a Greenhouse or Lever application page to fill it."; return; }
  if (!scan.ats) { det.textContent = "This site is not a supported ATS yet (Greenhouse and Lever are)."; return; }
  det.innerHTML = `<b>${scan.ats[0].toUpperCase() + scan.ats.slice(1)}</b> form · ${scan.fields.length} recognised field${scan.fields.length === 1 ? "" : "s"}<br><span class="muted">${scan.title}${scan.company ? ` · ${scan.company}` : ""}</span>`;
  ($("fill") as HTMLButtonElement).disabled = scan.fields.length === 0;
  ($("track") as HTMLButtonElement).disabled = false;
}

$("pair").addEventListener("click", async () => {
  const code = ($("code") as HTMLInputElement).value.trim();
  const apiBase = ($("apiBase") as HTMLInputElement).value.trim();
  const r = await bg<{ ok: boolean; error?: string }>({ type: "pair", code, apiBase });
  const err = $("pairError");
  if (!r.ok) { err.hidden = false; err.textContent = r.error ?? "Pairing failed"; return; }
  err.hidden = true;
  await refresh();
});
$("unpair").addEventListener("click", async (e) => { e.preventDefault(); await setSettings({ token: null, email: null }); await refresh(); });

$("fill").addEventListener("click", async () => {
  const status = $("status");
  status.textContent = "Loading your profile…";
  const r = await bg<{ ok: boolean; error?: string; profile?: AutofillProfile }>({ type: "getProfile" });
  if (!r.ok || !r.profile) { status.textContent = r.error ?? "Could not load profile"; return; }
  profile = r.profile;
  let resumeBytes: number[] | null = null;
  if (profile.resume && scan?.fields.some((f) => f.kind === "file")) {
    status.textContent = "Fetching your résumé PDF…";
    const rr = await bg<{ ok: boolean; bytes?: number[]; error?: string }>({ type: "fetchResume", url: profile.resume.url });
    if (rr.ok && rr.bytes) resumeBytes = rr.bytes;
  }
  status.textContent = "Filling…";
  const res = await tabMsg<FillResult>({ type: "fill", profile, resumeBytes });
  if (!res) { status.textContent = "The page did not respond. Reload it and try again."; return; }
  filledCount = res.filled.length;
  status.textContent = `Filled ${res.filled.length} field${res.filled.length === 1 ? "" : "s"}${res.skipped.length ? `, skipped ${res.skipped.length}` : ""}. Review everything before you submit.`;
  const ul = $("results");
  ul.innerHTML = "";
  for (const f of res.filled) { const li = document.createElement("li"); li.innerHTML = `<span>${esc(f.label)}</span><span>${esc(f.value)}</span>`; ul.appendChild(li); }
  for (const f of res.skipped) { const li = document.createElement("li"); li.className = "skip"; li.innerHTML = `<span>${esc(f.label)}</span><span>${esc(f.reason)}</span>`; ul.appendChild(li); }
});

$("track").addEventListener("click", async () => {
  if (!scan) return;
  const r = await bg<{ ok: boolean; error?: string; status?: string }>({ type: "track", url: scan.url, title: scan.title, company: scan.company, ats: scan.ats, filled: filledCount, resumeDocumentId: profile?.resume?.documentId ?? null });
  $("status").textContent = r.ok ? "Tracked in Foothold as Applied. Remember to submit on this page." : (r.error ?? "Could not track");
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
refresh();
