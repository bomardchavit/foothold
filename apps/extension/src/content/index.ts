import { detectAts } from "@foothold/shared";
import { detectFields, fillField } from "./fields";
import type { ToContent, ScanResult, FillResult } from "../lib/messages";

function pageMeta() {
  const ats = detectAts(location.hostname);
  const h1 = document.querySelector("h1, .app-title, [data-qa='posting-name'], .posting-headline h2")?.textContent?.trim() ?? document.title;
  let company: string | null = null;
  if (ats === "greenhouse") company = document.querySelector("#header .company-name, .company-name, [data-qa='company-name']")?.textContent?.trim().replace(/^at\s+/i, "") ?? null;
  if (ats === "lever") company = document.querySelector(".main-header-logo img")?.getAttribute("alt") ?? location.pathname.split("/")[1] ?? null;
  if (ats === "ashby") company = document.querySelector("[class*='companyName'], header img")?.getAttribute("alt") ?? null;
  return { ats, title: h1.slice(0, 200), company };
}

chrome.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
  if (msg.type === "scan") {
    const fields = detectFields();
    const meta = pageMeta();
    const result: ScanResult = { ats: meta.ats, url: location.href, title: meta.title, company: meta.company, fields: fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, current: f.kind === "file" ? "" : (f.el as HTMLInputElement).value ?? "", fillable: true })) };
    sendResponse(result);
    return;
  }
  if (msg.type === "fill") {
    const resume = msg.resumeBytes && msg.profile.resume ? { name: msg.profile.resume.fileName, bytes: Uint8Array.from(msg.resumeBytes) } : null;
    const result: FillResult = { filled: [], skipped: [] };
    for (const f of detectFields()) {
      const r = fillField(f, msg.profile, resume);
      if (r.ok) { result.filled.push({ key: f.key, label: f.label, value: r.value }); f.el.style.outline = "2px solid #C4562F"; f.el.style.outlineOffset = "1px"; }
      else result.skipped.push({ key: f.key, label: f.label, reason: r.reason });
    }
    sendResponse(result);
  }
});
