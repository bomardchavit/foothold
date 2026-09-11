/** Canonical autofill keys and the label/name/autocomplete patterns that identify them on ATS forms. */
export type AutofillKey =
  | "firstName" | "lastName" | "fullName" | "email" | "phone" | "location" | "city" | "linkedinUrl" | "githubUrl" | "websiteUrl"
  | "currentCompany" | "currentTitle" | "school" | "degree" | "fieldOfStudy" | "graduationYear" | "workAuthorization" | "sponsorship"
  | "yearsExperience" | "salaryExpectation" | "resume" | "coverLetter" | "summary";

export interface FieldPattern { key: AutofillKey; labels: RegExp[]; names?: RegExp[]; autocomplete?: string[] }

export const ATS_FIELD_PATTERNS: FieldPattern[] = [
  { key: "firstName", labels: [/^first\s*name/i, /given\s*name/i, /^first$/i], names: [/first[_-]?name/i, /fname/i], autocomplete: ["given-name"] },
  { key: "lastName", labels: [/^last\s*name/i, /family\s*name/i, /surname/i, /^last$/i], names: [/last[_-]?name/i, /lname/i], autocomplete: ["family-name"] },
  { key: "fullName", labels: [/^(full\s*)?name\s*\*?$/i, /^your\s*name/i, /legal\s*name/i], names: [/^name$/i, /full[_-]?name/i], autocomplete: ["name"] },
  { key: "email", labels: [/e-?mail/i], names: [/e-?mail/i], autocomplete: ["email"] },
  { key: "phone", labels: [/phone/i, /mobile/i, /telephone/i], names: [/phone/i, /mobile/i, /tel/i], autocomplete: ["tel"] },
  { key: "linkedinUrl", labels: [/linkedin/i], names: [/linkedin/i] },
  { key: "githubUrl", labels: [/github/i, /git\s*hub/i], names: [/github/i] },
  { key: "websiteUrl", labels: [/website/i, /portfolio/i, /personal\s*site/i, /^url$/i, /other\s*website/i], names: [/website|portfolio|url/i], autocomplete: ["url"] },
  { key: "city", labels: [/^city/i], names: [/city/i], autocomplete: ["address-level2"] },
  { key: "location", labels: [/location/i, /where.*(located|based)/i, /current\s*(city|address)/i, /^address/i], names: [/location|address/i] },
  { key: "currentCompany", labels: [/current\s*(company|employer)/i, /^company/i, /^employer/i, /organization/i], names: [/company|employer|org/i], autocomplete: ["organization"] },
  { key: "currentTitle", labels: [/current\s*(title|role|position)/i, /job\s*title/i, /^title$/i], names: [/title|position|role/i], autocomplete: ["organization-title"] },
  { key: "school", labels: [/school/i, /university/i, /college/i, /institution/i, /education/i], names: [/school|university|college|institution/i] },
  { key: "degree", labels: [/degree/i], names: [/degree/i] },
  { key: "fieldOfStudy", labels: [/field\s*of\s*study/i, /major/i, /discipline/i], names: [/major|field|discipline/i] },
  { key: "graduationYear", labels: [/graduation/i, /grad\s*year/i, /end\s*date.*(school|education)/i], names: [/grad/i] },
  { key: "workAuthorization", labels: [/authori[sz]ed\s*to\s*work/i, /work\s*authori[sz]ation/i, /legally\s*(authori[sz]ed|eligible)/i, /eligible\s*to\s*work/i, /right\s*to\s*work/i], names: [/work[_-]?auth/i] },
  { key: "sponsorship", labels: [/sponsorship/i, /visa\s*(sponsor|status)/i, /require.*sponsor/i, /immigration/i], names: [/sponsor|visa/i] },
  { key: "yearsExperience", labels: [/years?\s*of\s*(relevant\s*|professional\s*)?experience/i, /how\s*many\s*years/i], names: [/years|experience/i] },
  { key: "salaryExpectation", labels: [/salary/i, /compensation/i, /pay\s*expectation/i, /desired\s*(pay|comp)/i], names: [/salary|compensation/i] },
  { key: "resume", labels: [/resume/i, /cv/i, /résumé/i], names: [/resume|cv/i] },
  { key: "coverLetter", labels: [/cover\s*letter/i], names: [/cover/i] },
  { key: "summary", labels: [/summary/i, /about\s*you/i, /tell\s*us\s*about/i], names: [/summary|about/i] },
];

export const KNOWN_ATS_HOSTS: Array<{ ats: "greenhouse" | "lever" | "ashby" | "workday"; test: RegExp }> = [
  { ats: "greenhouse", test: /(^|\.)greenhouse\.io$/i },
  { ats: "lever", test: /(^|\.)lever\.co$/i },
  { ats: "ashby", test: /(^|\.)ashbyhq\.com$/i },
  { ats: "workday", test: /myworkdayjobs\.com$/i },
];

export function detectAts(hostname: string): "greenhouse" | "lever" | "ashby" | "workday" | null {
  for (const k of KNOWN_ATS_HOSTS) if (k.test.test(hostname)) return k.ats;
  return null;
}
