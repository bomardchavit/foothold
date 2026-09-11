import { ATS_FIELD_PATTERNS, type AutofillKey, type AutofillProfile } from "@foothold/shared";

export type El = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export interface Found { key: AutofillKey; el: El; label: string; kind: "text" | "select" | "checkbox" | "radio" | "file" | "textarea" }

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  const cs = getComputedStyle(el as HTMLElement);
  return cs.display !== "none" && cs.visibility !== "hidden" && (r.width > 0 || r.height > 0 || (el as HTMLInputElement).type === "file");
}

export function labelFor(el: El): string {
  const parts: string[] = [];
  if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) parts.push(l.textContent ?? ""); }
  const wrap = el.closest("label"); if (wrap) parts.push(wrap.textContent ?? "");
  const aria = el.getAttribute("aria-label"); if (aria) parts.push(aria);
  const labelledBy = el.getAttribute("aria-labelledby"); if (labelledBy) for (const id of labelledBy.split(/\s+/)) parts.push(document.getElementById(id)?.textContent ?? "");
  const group = el.closest(".field, .application-question, [class*='field'], [class*='question'], fieldset, li, div");
  if (!parts.join("").trim() && group) { const l = group.querySelector("label, legend, .application-label, .text, h3, h4"); if (l && l !== el) parts.push(l.textContent ?? ""); }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) parts.push(el.placeholder ?? "");
  return parts.join(" ").replace(/\s+/g, " ").replace(/\*/g, "").trim();
}

export function detectFields(): Found[] {
  const out: Found[] = [];
  const seen = new Set<Element>();
  const els = [...document.querySelectorAll<El>("input, select, textarea")].filter((el) => !seen.has(el) && visible(el) && !["hidden", "submit", "button", "image", "reset"].includes((el as HTMLInputElement).type ?? ""));
  for (const el of els) {
    const label = labelFor(el);
    const name = el.getAttribute("name") ?? el.id ?? "";
    const auto = el.getAttribute("autocomplete") ?? "";
    const type = (el as HTMLInputElement).type ?? "";
    let key: AutofillKey | null = null;
    if (type === "file") key = /cover/i.test(label + name) ? "coverLetter" : "resume";
    else if (type === "email" || auto === "email") key = "email";
    else if (type === "tel" || auto === "tel") key = "phone";
    else {
      for (const p of ATS_FIELD_PATTERNS) {
        if (p.autocomplete?.includes(auto) || p.labels.some((rx) => rx.test(label)) || (name && p.names?.some((rx) => rx.test(name)))) { key = p.key; break; }
      }
    }
    if (!key) continue;
    if (key === "fullName" && out.some((f) => f.key === "firstName")) continue;
    seen.add(el);
    const kind = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : type === "file" ? "file" : "text";
    out.push({ key, el, label: label || name || key, kind });
  }
  return out;
}

function setNative(el: El, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter ? setter.call(el, value) : ((el as HTMLInputElement).value = value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function pickOption(el: HTMLSelectElement, wanted: string[]): string | null {
  const opts = [...el.options];
  for (const w of wanted) {
    const hit = opts.find((o) => o.text.trim().toLowerCase() === w.toLowerCase()) ?? opts.find((o) => o.text.toLowerCase().includes(w.toLowerCase()));
    if (hit) { setNative(el, hit.value); return hit.text; }
  }
  return null;
}

function yesNo(v: boolean | null): string[] | null { return v == null ? null : v ? ["yes", "true", "i am", "authorized"] : ["no", "false", "not"]; }

export function valueFor(key: AutofillKey, p: AutofillProfile): { text?: string; choices?: string[] } | null {
  switch (key) {
    case "firstName": return { text: p.firstName };
    case "lastName": return { text: p.lastName };
    case "fullName": return { text: p.fullName };
    case "email": return { text: p.email };
    case "phone": return { text: p.phone };
    case "location": return { text: p.location };
    case "city": return { text: p.city || p.location };
    case "linkedinUrl": return { text: p.linkedinUrl };
    case "githubUrl": return { text: p.githubUrl };
    case "websiteUrl": return { text: p.websiteUrl };
    case "currentCompany": return { text: p.currentCompany };
    case "currentTitle": return { text: p.currentTitle };
    case "school": return { text: p.school };
    case "degree": return { text: p.degree, choices: p.degree ? [p.degree] : [] };
    case "fieldOfStudy": return { text: p.fieldOfStudy };
    case "graduationYear": return { text: p.graduationYear };
    case "workAuthorization": { const c = yesNo(p.authorizedToWorkUS); return c ? { text: c[0] === "yes" ? "Yes" : "No", choices: c } : null; }
    case "sponsorship": { const c = yesNo(p.needsSponsorship); return c ? { text: c[0] === "yes" ? "Yes" : "No", choices: c } : null; }
    case "yearsExperience": return { text: String(Math.round(p.yearsExperience)) };
    case "salaryExpectation": return p.salaryExpectation ? { text: p.salaryExpectation } : null;
    case "summary": return p.summary ? { text: p.summary } : null;
    default: return null;
  }
}

export function fillField(f: Found, p: AutofillProfile, resume: { name: string; bytes: Uint8Array<ArrayBuffer> } | null): { ok: true; value: string } | { ok: false; reason: string } {
  if (f.kind === "file") {
    if (f.key === "coverLetter") return { ok: false, reason: "cover letter not attached automatically" };
    if (!resume) return { ok: false, reason: "no résumé exported yet" };
    try {
      const dt = new DataTransfer();
      dt.items.add(new File([resume.bytes], resume.name, { type: "application/pdf" }));
      (f.el as HTMLInputElement).files = dt.files;
      f.el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, value: resume.name };
    } catch (e) { return { ok: false, reason: `could not attach file: ${e instanceof Error ? e.message : e}` }; }
  }
  const v = valueFor(f.key, p);
  if (!v || (!v.text && !v.choices?.length)) return { ok: false, reason: "not in your profile" };
  if (f.kind === "select") { const t = pickOption(f.el as HTMLSelectElement, [...(v.choices ?? []), v.text ?? ""]); return t ? { ok: true, value: t } : { ok: false, reason: "no matching option" }; }
  if (f.kind === "radio" || f.kind === "checkbox") {
    const group = f.el.getAttribute("name") ? [...document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(f.el.getAttribute("name")!)}"]`)] : [f.el as HTMLInputElement];
    const wanted = (v.choices ?? [v.text ?? ""]).map((s) => s.toLowerCase());
    const hit = group.find((r) => wanted.some((w) => labelFor(r).toLowerCase().includes(w) || r.value.toLowerCase() === w));
    if (!hit) return { ok: false, reason: "no matching option" };
    hit.click();
    return { ok: true, value: labelFor(hit) };
  }
  if ((f.el as HTMLInputElement).value && (f.el as HTMLInputElement).value.trim() === (v.text ?? "").trim()) return { ok: true, value: v.text ?? "" };
  setNative(f.el, v.text ?? "");
  return { ok: true, value: v.text ?? "" };
}
