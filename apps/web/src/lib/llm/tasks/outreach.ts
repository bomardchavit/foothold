import { z } from "zod";
import type { Contact, OutreachKind } from "@prisma/client";
import { prisma } from "../../db";
import { getFullProfile } from "../../profile/service";
import { findInsiders } from "../../network/insiders";
import { llmMode, structured } from "../client";
import { env } from "../../env";

const Out = z.object({ subject: z.string().nullable(), body: z.string() });

function shared(contact: Contact, reasons: string[]): string {
  const r = reasons.find((x) => x.startsWith("Same school")) ?? reasons.find((x) => x.startsWith("Both worked")) ?? null;
  return r ? r.replace("Same school: ", "we both went to ").replace("Both worked at ", "we both spent time at ") : "";
}

/** Templates are always available; the LLM personalizes them when a key is set. Nothing is ever sent by Foothold. */
export async function draftOutreach(userId: string, contact: Contact, kind: OutreachKind, jobId: string | null): Promise<{ subject: string | null; body: string }> {
  const profile = await getFullProfile(userId);
  const job = jobId ? await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } }) : null;
  const company = job?.company.name ?? contact.currentCompany ?? "your company";
  const companyRow = job?.company ?? (contact.normalizedCompany ? await prisma.company.findUnique({ where: { normalizedName: contact.normalizedCompany } }) : null);
  const reasons = companyRow ? (await findInsiders(userId, companyRow.id)).find((c) => c.id === contact.id)?.reasons ?? [] : [];
  const me = profile?.fullName ?? "Me";
  const role = job?.title ?? (profile?.targetRoles[0] ?? "a role");
  const link = shared(contact, reasons);
  const recent = profile?.experiences[0];
  const intro = recent ? `I'm ${me}, currently ${recent.title} at ${recent.company}.` : `I'm ${me}.`;
  const templates: Record<OutreachKind, { subject: string; body: string }> = {
    REFERRAL: {
      subject: `Quick question about the ${role} opening at ${company}`,
      body: `Hi ${contact.firstName},\n\n${intro}${link ? ` I noticed ${link}.` : ""} I'm applying for the ${role} role at ${company} and it lines up closely with my recent work${recent?.bullets[0] ? ` (${recent.bullets[0].text.replace(/\.$/, "").slice(0, 110)})` : ""}.\n\nWould you be open to referring me, or pointing me to the hiring manager? I can send the posting link and a short summary of why I'm a fit. Totally understand if not.\n\nThanks,\n${me}`,
    },
    COFFEE_CHAT: {
      subject: `Coffee chat about ${company}?`,
      body: `Hi ${contact.firstName},\n\n${intro}${link ? ` ${link[0].toUpperCase() + link.slice(1)}, and` : ""} I'm exploring ${role} roles and ${company} keeps coming up. Would you have 20 minutes in the next couple of weeks for a quick call? I'd love to hear what the team is working on and what makes people successful there.\n\nHappy to work around your schedule.\n\nThanks,\n${me}`,
    },
    ALUMNI_INTRO: {
      subject: `Fellow ${reasons.find((x) => x.startsWith("Same school"))?.replace("Same school: ", "") ?? "alum"} reaching out`,
      body: `Hi ${contact.firstName},\n\n${intro} ${link ? `Since ${link}, ` : ""}I hoped you wouldn't mind a note from a fellow alum. I'm interested in the ${role} role at ${company} and would value 15 minutes of your perspective on the team and the interview process.\n\nIf it's easier, I can send two or three specific questions by email.\n\nThanks so much,\n${me}`,
    },
  };
  const t = templates[kind];
  if (llmMode() !== "anthropic") return t;
  try {
    const out = await structured({
      task: "outreach", schema: Out, userId, model: env.modelMain, effort: "low", maxTokens: 2000,
      system: `You write short, warm, specific outreach messages for a job seeker. Keep under 140 words, one ask, no flattery, no fabricated facts about the sender or recipient. Only use the facts provided.`,
      user: `Kind: ${kind}\nRecipient: ${contact.firstName} ${contact.lastName}, ${contact.title ?? "unknown title"} at ${contact.currentCompany ?? company}\nShared connection: ${reasons.join("; ") || "none"}\nSender: ${me}; ${recent ? `${recent.title} at ${recent.company}` : ""}; top bullets: ${(recent?.bullets ?? []).slice(0, 2).map((b) => b.text).join(" | ")}\nTarget: ${role} at ${company}${job ? `; posting summary: ${job.description.slice(0, 600)}` : ""}\nTemplate to improve (keep its facts):\n${t.body}`,
    });
    return { subject: out.subject ?? t.subject, body: out.body };
  } catch { return t; }
}
