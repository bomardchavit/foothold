import { canonicalizeSkill, extractSkills, skillCategory, isKnownSkill, type ParsedResume, type ParsedExperience } from "@foothold/shared";

/** Categories a bullet may contribute to the skill list: concrete tools, not domain words ("operations", "dashboards"). */
const BULLET_SKILL_CATEGORIES = new Set(["LANGUAGE", "FRAMEWORK", "TOOL", "CLOUD", "DATA", "DESIGN"]);

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_TOKEN = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const PRESENT = "(?:present|current|now|ongoing|today)";
const RANGE_RX = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to|through|until|—)\\s*(${DATE_TOKEN}|${PRESENT})`, "i");
const YEAR_RX = /\b(19|20)\d{2}\b/;
const BULLET_RX = /^[•\-*–—▪●‣◦o►]\s+/;
const EMAIL_RX = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RX = /(\+?\d{1,2}[\s.-])?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const URL_RX = /(?:https?:\/\/)?(?:www\.)?(linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+|[\w-]+\.(?:dev|io|me|com|app|xyz|site|tech)\/?[\w/-]*)/gi;
const TITLE_RX = /\b(engineer|engineering|developer|manager|analyst|intern|internship|designer|lead|director|scientist|consultant|associate|specialist|coordinator|architect|administrator|officer|president|founder|co-founder|head|researcher|research assistant|assistant|fellow|teaching|tutor|instructor|technician|representative|recruiter|accountant|marketer|strategist|writer|editor|producer|advisor|partner|programmer|sde|swe|pm|vp|cto|ceo|principal|staff|junior|senior|sr\.|jr\.|freelance|contractor|volunteer)\b/i;
const LOCATION_RX = /^(?:[A-Z][A-Za-z.' -]+,\s*(?:[A-Z]{2}|[A-Z][a-z]+)|remote|hybrid)$/;
const DEGREE_RX = /\b(ph\.?d\.?|doctor(?:ate)?|m\.?s\.?c?\.?|master(?:'s|s)?|m\.?b\.?a\.?|m\.?eng\.?|m\.?ed\.?|b\.?s\.?c?\.?|bachelor(?:'s|s)?|b\.?a\.?|b\.?eng\.?|b\.?tech\.?|m\.?tech\.?|b\.?b\.?a\.?|associate(?:'s|s)?|a\.?a\.?s?\.?|diploma|certificate|bs|ba|ms|ma)\b/i;

type Kind = "experience" | "education" | "skills" | "projects" | "summary" | "other";
const HEADERS: Array<[Kind, RegExp]> = [
  ["experience", /^(?:work|professional|relevant|employment|industry|career)?\s*(?:experience|history|employment)\b/i],
  ["education", /^(?:education|academic)/i],
  ["skills", /^(?:technical\s+|core\s+|key\s+)?(?:skills|technologies|tools|competencies|expertise|tech stack|technical proficiencies)\b/i],
  ["projects", /^(?:personal|selected|academic|side|notable|key|technical)?\s*projects?\b/i],
  ["summary", /^(?:professional\s+|career\s+)?(?:summary|objective|profile|about(?: me)?|overview)\b/i],
  ["other", /^(?:certifications?|licenses?|awards?|honors?|publications?|languages?|interests|hobbies|activities|volunteer(?:ing)?|leadership|extracurriculars?|references|involvement|coursework|relevant coursework|affiliations|patents|presentations|additional)\b/i],
];

function headerKind(line: string): Kind | null {
  const t = line.replace(/[:\-–—_]+$/, "").trim();
  if (!t || t.length > 42 || BULLET_RX.test(line) || /[.]$/.test(t)) return null;
  for (const [kind, rx] of HEADERS) if (rx.test(t)) {
    const words = t.split(/\s+/).length;
    if (words <= 5) return kind;
  }
  return null;
}

export function toYM(token: string | undefined): string | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  if (/^(present|current|now|ongoing|today)$/.test(t)) return null;
  let m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = new RegExp(`^(${MONTH})\\s+(\\d{4})$`).exec(t);
  if (m) {
    const idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].findIndex((mm) => m![1].startsWith(mm));
    return idx >= 0 ? `${m[2]}-${String(idx + 1).padStart(2, "0")}` : m[2];
  }
  m = /^(\d{4})$/.exec(t);
  if (m) return m[1];
  return null;
}

function splitParts(s: string): string[] {
  return s.split(/\s*(?:\||•|·|—|–|\t|\s{3,})\s*/).map((p) => p.trim()).filter(Boolean);
}

function classifyHeader(headerLines: string[]): { title: string; company: string; location: string | null } {
  let title = "", company = "", location: string | null = null;
  const parts: string[] = [];
  for (const l of headerLines) parts.push(...splitParts(l.replace(RANGE_RX, "").replace(/\(\s*\)/g, "").trim()));
  const rest: string[] = [];
  for (const p of parts) {
    const at = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(p);
    if (at && TITLE_RX.test(at[1])) { title ||= at[1].trim(); company ||= at[2].trim(); continue; }
    if (LOCATION_RX.test(p) && !TITLE_RX.test(p)) { location ??= p; continue; }
    rest.push(p);
  }
  for (const p of rest) {
    const pieces = p.split(/,\s*/);
    if (!title && TITLE_RX.test(p)) {
      if (rest.length === 1 && pieces.length >= 2 && !company) {
        // "Title, Company, City, ST" or "Title, Company"
        title = pieces[0];
        const stateIdx = pieces.findIndex((x, i) => i >= 2 && /^[A-Z]{2}(?:\s|\(|$)/.test(x));
        if (stateIdx >= 2) { company = pieces.slice(1, stateIdx - 1).join(", "); location ??= pieces.slice(stateIdx - 1).join(", "); }
        else { company = pieces[1]; if (pieces.length > 2) location ??= pieces.slice(2).join(", "); }
      } else title = p;
    } else if (!company) {
      if (pieces.length === 2 && LOCATION_RX.test(pieces.join(", ")) && rest.length > 1) { location ??= p; }
      else company = p;
    } else if (!location && LOCATION_RX.test(p)) location = p;
  }
  if (!title && rest.length >= 2) { company = rest[0]; title = rest[1]; }
  if (!title && rest.length === 1 && !company) title = rest[0];
  if (!company && rest.length >= 2) company = rest.find((p) => p !== title) ?? "";
  return { title: title.replace(/[,:]$/, "").trim(), company: company.replace(/[,:]$/, "").trim(), location };
}

function collectBullets(body: string[]): string[] {
  const bullets: string[] = [];
  const hasBulletChars = body.some((l) => BULLET_RX.test(l));
  for (const raw of body) {
    const l = raw.trim();
    if (!l) continue;
    if (BULLET_RX.test(l)) bullets.push(l.replace(BULLET_RX, "").trim());
    else if (hasBulletChars && bullets.length && (/^[a-z(]/.test(l) || !/[.!?]$/.test(bullets[bullets.length - 1]))) bullets[bullets.length - 1] += " " + l;
    else if (hasBulletChars && bullets.length === 0) continue;
    else if (!hasBulletChars && l.length >= 25) bullets.push(l);
  }
  return bullets.map((b) => b.replace(/\s+/g, " ").trim()).filter((b) => b.length > 3);
}

function parseExperience(lines: string[]): ParsedExperience[] {
  const anchors: number[] = [];
  lines.forEach((l, i) => { if (RANGE_RX.test(l) || (YEAR_RX.test(l) && !BULLET_RX.test(l) && l.length < 90 && /present|current/i.test(l))) anchors.push(i); });
  const entries: ParsedExperience[] = [];
  for (let k = 0; k < anchors.length; k++) {
    const a = anchors[k];
    const headerStart = Math.max(0, a - 2, k > 0 ? anchors[k - 1] + 1 : 0);
    const header: string[] = [];
    for (let i = a; i >= headerStart; i--) {
      const l = lines[i];
      if (i !== a && (BULLET_RX.test(l) || l.length > 95 || !l.trim() || /[.]$/.test(l))) break;
      header.unshift(l);
    }
    const nextHeaderStart = k + 1 < anchors.length ? Math.max(anchors[k + 1] - 2, a + 1) : lines.length;
    let bodyEnd = nextHeaderStart;
    if (k + 1 < anchors.length) {
      // don't swallow the next entry's header lines
      for (let i = anchors[k + 1] - 1; i > a; i--) { if (BULLET_RX.test(lines[i]) || lines[i].length > 95 || !lines[i].trim()) { bodyEnd = i + 1; break; } bodyEnd = i; }
    }
    const body = lines.slice(a + 1, bodyEnd);
    const range = header.map((h) => RANGE_RX.exec(h)).find(Boolean);
    const { title, company, location } = classifyHeader(header);
    if (!title && !company) continue;
    entries.push({
      company: company || "Unknown company", title: title || "Role", location,
      startDate: toYM(range?.[1]), endDate: toYM(range?.[2]), isCurrent: !!range && /present|current|now|ongoing|today/i.test(range[2]),
      bullets: collectBullets(body),
    });
  }
  return entries;
}

function parseEducation(lines: string[]) {
  const out: ParsedResume["education"] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/\b(university|college|institute|school|academy|polytechnic|universit)/i.test(l) || BULLET_RX.test(l)) continue;
    const block = [l, lines[i + 1] ?? "", lines[i + 2] ?? ""].filter((x) => x && !BULLET_RX.test(x));
    const text = block.join(" | ");
    const school = splitParts(l.replace(RANGE_RX, "")).find((p) => /university|college|institute|school|academy|polytechnic/i.test(p)) ?? l.replace(RANGE_RX, "").trim();
    const deg = DEGREE_RX.exec(text);
    let degree: string | null = null, field: string | null = null;
    if (deg) {
      degree = deg[0];
      const after = text.slice(deg.index + deg[0].length);
      const f = /^(?:\.)?\s*(?:of|in|,|:)?\s*([A-Z][A-Za-z&/ ]{2,60}?)(?=\s*(?:\||,|–|—|-|\d|$|GPA|Minor|\()|$)/i.exec(after);
      if (f) { const cand = f[1].trim(); if (!/^(?:in|of|and|the)$/i.test(cand) && !/university|college|institute|school/i.test(cand)) field = cand; }
      degree = degree.replace(/\.$/, "");
    }
    const range = RANGE_RX.exec(text);
    const years = (text.match(/\b(?:19|20)\d{2}\b/g) ?? []).sort();
    const gpa = /gpa[:\s]*([0-4]\.\d{1,2})(?:\s*\/\s*4(?:\.0+)?)?/i.exec(text)?.[1] ?? null;
    out.push({ school: school.replace(/[,|]$/, "").trim(), degree, field, startDate: toYM(range?.[1]) ?? (years.length > 1 ? years[0] : null), endDate: toYM(range?.[2]) ?? (years.length ? years[years.length - 1] : null), gpa });
    i += block.length - 1;
  }
  return out;
}

function parseSkills(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    let l = raw.replace(BULLET_RX, "").trim();
    if (!l) continue;
    const colon = l.indexOf(":");
    if (colon > 0 && colon < 40) l = l.slice(colon + 1);
    for (const p of l.split(/[,;•|]|(?<=[a-z]{3})\/(?=[a-z]{3})|\s{2,}|\band\b/i)) {
      const t = p.trim().replace(/\.$/, "");
      if (t.length >= 1 && t.length <= 40 && !/^\d+$/.test(t)) out.push(t);
    }
  }
  return out;
}

function parseProjects(lines: string[]): ParsedResume["projects"] {
  const out: ParsedResume["projects"] = [];
  let cur: ParsedResume["projects"][number] | null = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    const isTitle = !BULLET_RX.test(l) && l.length <= 90 && (/\||—|–|\bhttps?:|github\.com|^[A-Z]/.test(l)) && !/[.]$/.test(l);
    if (isTitle) {
      const url = /(https?:\/\/\S+|github\.com\/\S+)/i.exec(l)?.[1] ?? null;
      const name = splitParts(l.replace(RANGE_RX, "").replace(url ?? "", ""))[0]?.replace(/[,:|-]+$/, "").trim() || l;
      const tech = splitParts(l).slice(1).join(", ") || null;
      cur = { name, url, description: tech && tech !== name ? tech : null, bullets: [] };
      out.push(cur);
    } else if (cur) {
      const b = l.replace(BULLET_RX, "").trim();
      if (BULLET_RX.test(l) || !cur.bullets.length) cur.bullets.push(b); else cur.bullets[cur.bullets.length - 1] += " " + b;
    }
  }
  return out.filter((p) => p.name.length > 1);
}

export function parseResumeHeuristic(text: string): ParsedResume {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\t/g, "   ").replace(/\s+$/, "").replace(/^\s{0,3}/, ""));
  const sections: Array<{ kind: Kind; lines: string[] }> = [];
  const preamble: string[] = [];
  let current: { kind: Kind; lines: string[] } | null = null;
  for (const l of lines) {
    const k = headerKind(l);
    if (k) { current = { kind: k, lines: [] }; sections.push(current); continue; }
    (current ? current.lines : preamble).push(l);
  }
  const all = lines.join("\n");
  const email = EMAIL_RX.exec(all)?.[0] ?? null;
  const phone = PHONE_RX.exec(preamble.join("\n"))?.[0]?.trim() ?? null;
  const urls = [...all.matchAll(URL_RX)].map((m) => m[0]);
  const linkedinUrl = urls.find((u) => /linkedin\.com/i.test(u)) ?? null;
  const githubUrl = urls.find((u) => /github\.com/i.test(u)) ?? null;
  const websiteUrl = urls.find((u) => !/linkedin\.com|github\.com/i.test(u) && !u.includes("@")) ?? null;
  const contactLike = (l: string) => EMAIL_RX.test(l) || PHONE_RX.test(l) || /linkedin|github|http|www\./i.test(l);
  const pre = preamble.map((l) => l.trim()).filter(Boolean);
  const fullName = pre.find((l) => !contactLike(l) && /^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3}$/.test(l.replace(/\s*\(.*?\)\s*/g, ""))) ?? null;
  const location = pre.map((l) => splitParts(l).find((p) => LOCATION_RX.test(p) && !/remote|hybrid/i.test(p))).find(Boolean) ?? null;
  const headline = pre.find((l) => l !== fullName && !contactLike(l) && !LOCATION_RX.test(l) && l.length <= 70 && !/,/.test(l) && TITLE_RX.test(l)) ?? null;
  const get = (k: Kind) => sections.filter((s) => s.kind === k).flatMap((s) => s.lines);
  const summaryLines = get("summary").map((l) => l.replace(BULLET_RX, "").trim()).filter(Boolean);
  const summary = summaryLines.length ? summaryLines.join(" ").slice(0, 1200) : (pre.filter((l) => l.length > 80).join(" ").slice(0, 800) || null);

  const experience = parseExperience(get("experience"));
  const education = parseEducation(get("education"));
  const projects = parseProjects(get("projects"));
  const skillSection = parseSkills(get("skills"));
  const fromBullets = extractSkills([...experience.flatMap((e) => e.bullets), ...projects.flatMap((p) => p.bullets), ...projects.map((p) => p.description ?? "")].join("\n"))
    .filter((s) => BULLET_SKILL_CATEGORIES.has(skillCategory(s))); // PRODUCT/DOMAIN only from an explicit Skills section
  const skills = [...new Set([...skillSection.map(canonicalizeSkill), ...fromBullets])].filter((s) => s.length > 1 || isKnownSkill(s)).slice(0, 120);

  return {
    contact: { fullName, email, phone, location, linkedinUrl, githubUrl, websiteUrl },
    headline, summary, experience, education, projects, skills,
    confidence: { contact: fullName && email ? 0.8 : 0.5, experience: experience.length ? 0.6 : 0.2, education: education.length ? 0.6 : 0.2, skills: skills.length ? 0.7 : 0.3 },
  };
}
