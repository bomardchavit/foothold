import { getSettings, setSettings } from "./lib/storage";
import type { ToBackground } from "./lib/messages";

async function api(path: string, init: RequestInit = {}) {
  const s = await getSettings();
  const res = await fetch(`${s.apiBase.replace(/\/$/, "")}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(s.token ? { Authorization: `Bearer ${s.token}` } : {}), "Content-Type": "application/json" } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error ?? `HTTP ${res.status}`);
  return res;
}

chrome.runtime.onMessage.addListener((msg: ToBackground, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "pair") {
        await setSettings({ apiBase: msg.apiBase });
        const res = await api("/api/extension/pair", { method: "POST", body: JSON.stringify({ code: msg.code }) });
        const j = (await res.json()) as { token: string; email: string };
        await setSettings({ token: j.token, email: j.email });
        sendResponse({ ok: true, email: j.email });
      } else if (msg.type === "getProfile") {
        const res = await api(`/api/extension/profile${msg.jobId ? `?jobId=${encodeURIComponent(msg.jobId)}` : ""}`);
        sendResponse({ ok: true, ...(await res.json()) });
      } else if (msg.type === "fetchResume") {
        const s = await getSettings();
        const res = await fetch(msg.url, { headers: { Authorization: `Bearer ${s.token}` } });
        if (!res.ok) throw new Error(`Résumé download failed (${res.status})`);
        sendResponse({ ok: true, bytes: Array.from(new Uint8Array(await res.arrayBuffer())) });
      } else if (msg.type === "track") {
        const res = await api("/api/extension/track", { method: "POST", body: JSON.stringify({ url: msg.url, title: msg.title, company: msg.company ?? undefined, ats: msg.ats ?? undefined, status: "APPLIED", filled: msg.filled, resumeDocumentId: msg.resumeDocumentId }) });
        sendResponse({ ok: true, ...(await res.json()) });
      }
    } catch (e) { sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
  })();
  return true;
});
