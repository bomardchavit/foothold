import { z } from "zod";

const ym = z.string().regex(/^\d{4}(-\d{2})?$/, "YYYY or YYYY-MM").nullable().optional();

export const ParsedExperienceSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().nullable().optional(),
  startDate: ym,
  endDate: ym,
  isCurrent: z.boolean().default(false),
  bullets: z.array(z.string()).default([]),
});
export const ParsedEducationSchema = z.object({
  school: z.string().min(1),
  degree: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  startDate: ym,
  endDate: ym,
  gpa: z.string().nullable().optional(),
});
export const ParsedProjectSchema = z.object({
  name: z.string().min(1),
  url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  bullets: z.array(z.string()).default([]),
});
export const ParsedContactSchema = z.object({
  fullName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  githubUrl: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
});
export const ParsedResumeSchema = z.object({
  contact: ParsedContactSchema.default({}),
  headline: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  experience: z.array(ParsedExperienceSchema).default([]),
  education: z.array(ParsedEducationSchema).default([]),
  projects: z.array(ParsedProjectSchema).default([]),
  skills: z.array(z.string()).default([]),
  confidence: z.record(z.string(), z.number()).optional(),
});
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;
export type ParsedExperience = z.infer<typeof ParsedExperienceSchema>;

export const SENIORITY_VALUES = ["INTERN", "ENTRY", "MID", "SENIOR", "STAFF", "PRINCIPAL", "MANAGER", "DIRECTOR", "EXECUTIVE", "UNKNOWN"] as const;
export const REMOTE_PREF_VALUES = ["REMOTE", "HYBRID", "ONSITE", "ANY"] as const;
export const WORK_AUTH_VALUES = ["US_CITIZEN", "PERMANENT_RESIDENT", "H1B", "F1_OPT", "F1_CPT", "TN", "OTHER_VISA", "NONE", "UNKNOWN"] as const;
export const COMPANY_SIZE_VALUES = ["STARTUP", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE"] as const;

export const WORK_AUTH_LABELS: Record<(typeof WORK_AUTH_VALUES)[number], string> = {
  US_CITIZEN: "U.S. citizen", PERMANENT_RESIDENT: "Permanent resident (green card)", H1B: "H-1B", F1_OPT: "F-1 OPT / STEM OPT", F1_CPT: "F-1 CPT",
  TN: "TN", OTHER_VISA: "Other visa", NONE: "No U.S. work authorization yet", UNKNOWN: "Prefer not to say",
};
export const COMPANY_SIZE_LABELS: Record<(typeof COMPANY_SIZE_VALUES)[number], string> = {
  STARTUP: "Startup (1–50)", SMALL: "Small (51–200)", MEDIUM: "Mid-size (201–1,000)", LARGE: "Large (1,001–10,000)", ENTERPRISE: "Enterprise (10,000+)",
};

export const PreferencesSchema = z.object({
  targetRoles: z.array(z.string().min(1)).min(1, "Pick at least one target role").max(10),
  locations: z.array(z.string().min(1)).max(10).default([]),
  remotePref: z.enum(REMOTE_PREF_VALUES).default("ANY"),
  seniority: z.enum(SENIORITY_VALUES).default("UNKNOWN"),
  workAuth: z.enum(WORK_AUTH_VALUES).default("UNKNOWN"),
  needsSponsorship: z.boolean().default(false),
  salaryFloor: z.number().int().min(0).max(5_000_000).nullable().default(null),
  industries: z.array(z.string()).max(10).default([]),
  companySizes: z.array(z.enum(COMPANY_SIZE_VALUES)).default([]),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const ProfileEditSchema = z.object({
  fullName: z.string().max(120).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  linkedinUrl: z.string().max(300).nullable().optional(),
  githubUrl: z.string().max(300).nullable().optional(),
  websiteUrl: z.string().max(300).nullable().optional(),
  headline: z.string().max(200).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  experiences: z.array(z.object({
    id: z.string().optional(),
    company: z.string().min(1).max(160),
    title: z.string().min(1).max(160),
    location: z.string().max(120).nullable().optional(),
    startDate: ym,
    endDate: ym,
    isCurrent: z.boolean().default(false),
    bullets: z.array(z.object({ id: z.string().optional(), text: z.string().min(1).max(600) })).default([]),
  })).default([]),
  educations: z.array(z.object({
    id: z.string().optional(),
    school: z.string().min(1).max(160),
    degree: z.string().max(120).nullable().optional(),
    field: z.string().max(120).nullable().optional(),
    startDate: ym,
    endDate: ym,
    gpa: z.string().max(20).nullable().optional(),
  })).default([]),
  projects: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(160),
    url: z.string().max(300).nullable().optional(),
    description: z.string().max(600).nullable().optional(),
    bullets: z.array(z.object({ id: z.string().optional(), text: z.string().min(1).max(600) })).default([]),
  })).default([]),
  skills: z.array(z.string().min(1).max(80)).max(150).default([]),
});
export type ProfileEdit = z.infer<typeof ProfileEditSchema>;

// ---- Jobs
export const EMPLOYMENT_TYPE_VALUES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY", "UNKNOWN"] as const;
export const WORKPLACE_TYPE_VALUES = ["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"] as const;
export const EMPLOYMENT_TYPE_LABELS: Record<(typeof EMPLOYMENT_TYPE_VALUES)[number], string> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", INTERNSHIP: "Internship", TEMPORARY: "Temporary", UNKNOWN: "Not specified" };
export const WORKPLACE_TYPE_LABELS: Record<(typeof WORKPLACE_TYPE_VALUES)[number], string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "Onsite", UNKNOWN: "Not specified" };

export const JobParsedSchema = z.object({
  employmentType: z.enum(EMPLOYMENT_TYPE_VALUES).default("UNKNOWN"),
  workplaceType: z.enum(WORKPLACE_TYPE_VALUES).default("UNKNOWN"),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  yearsMin: z.number().int().min(0).max(40).nullable().default(null),
  yearsMax: z.number().int().min(0).max(50).nullable().default(null),
  seniority: z.enum(SENIORITY_VALUES).default("UNKNOWN"),
  isRemote: z.boolean().default(false),
  salaryMin: z.number().int().nullable().default(null),
  salaryMax: z.number().int().nullable().default(null),
  salaryCurrency: z.string().nullable().default(null),
  salaryPeriod: z.enum(["year", "month", "hour"]).nullable().default(null),
  industry: z.string().nullable().default(null),
});
export type JobParsed = z.infer<typeof JobParsedSchema>;

export const NormalizedJobSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  company: z.string(),
  companyDomain: z.string().nullable().optional(),
  companyIndustry: z.string().nullable().optional(),
  companySize: z.enum(COMPANY_SIZE_VALUES).nullable().optional(),
  description: z.string(),
  location: z.string().nullable().optional(),
  isRemote: z.boolean().optional(),
  workplaceType: z.enum(WORKPLACE_TYPE_VALUES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPE_VALUES).optional(),
  applyUrl: z.string(),
  postedAt: z.string().nullable().optional(),
  salaryMin: z.number().nullable().optional(),
  salaryMax: z.number().nullable().optional(),
  salaryCurrency: z.string().nullable().optional(),
  salaryPeriod: z.enum(["year", "month", "hour"]).nullable().optional(),
  /** The board's own version marker for this posting (Greenhouse updated_at). Lets a poll skip unchanged rows. */
  version: z.string().nullable().optional(),
  raw: z.unknown().optional(),
});
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;

// ---- Extension autofill payload (shared contract)
export const AutofillProfileSchema = z.object({
  fullName: z.string().default(""),
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  city: z.string().default(""),
  linkedinUrl: z.string().default(""),
  githubUrl: z.string().default(""),
  websiteUrl: z.string().default(""),
  currentCompany: z.string().default(""),
  currentTitle: z.string().default(""),
  school: z.string().default(""),
  degree: z.string().default(""),
  fieldOfStudy: z.string().default(""),
  graduationYear: z.string().default(""),
  workAuthorization: z.string().default(""),
  authorizedToWorkUS: z.boolean().nullable().default(null),
  needsSponsorship: z.boolean().nullable().default(null),
  yearsExperience: z.number().default(0),
  salaryExpectation: z.string().default(""),
  resume: z.object({ fileName: z.string(), url: z.string(), documentId: z.string() }).nullable().default(null),
  summary: z.string().default(""),
});
export type AutofillProfile = z.infer<typeof AutofillProfileSchema>;

// ---- Resume documents (generated)
export const ResumeContentSchema = z.object({
  header: z.object({ fullName: z.string(), email: z.string().nullable(), phone: z.string().nullable(), location: z.string().nullable(), links: z.array(z.string()) }),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  experience: z.array(z.object({
    experienceId: z.string(), company: z.string(), title: z.string(), location: z.string().nullable(), dateRange: z.string(),
    bullets: z.array(z.object({ bulletId: z.string(), text: z.string(), sourceText: z.string(), changeKind: z.enum(["unchanged", "reworded", "expanded", "added"]).default("unchanged"), reason: z.string().nullable().default(null), keywords: z.array(z.string()).default([]), grounded: z.boolean().default(true) })),
  })),
  education: z.array(z.object({ school: z.string(), degree: z.string().nullable(), field: z.string().nullable(), dateRange: z.string(), gpa: z.string().nullable() })),
  projects: z.array(z.object({ projectId: z.string(), name: z.string(), url: z.string().nullable(), description: z.string().nullable(), bullets: z.array(z.object({ bulletId: z.string(), text: z.string(), sourceText: z.string(), changeKind: z.enum(["unchanged", "reworded", "expanded", "added"]).default("unchanged"), reason: z.string().nullable().default(null), keywords: z.array(z.string()).default([]), grounded: z.boolean().default(true) })) })),
  skills: z.array(z.object({ name: z.string(), grounded: z.boolean().default(true), changeKind: z.enum(["unchanged", "added"]).default("unchanged"), reason: z.string().nullable().default(null) })),
});
export type ResumeContent = z.infer<typeof ResumeContentSchema>;
export type ResumeBullet = ResumeContent["experience"][number]["bullets"][number];
