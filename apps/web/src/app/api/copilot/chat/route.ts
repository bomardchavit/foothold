import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/session";
import { getFullProfile } from "@/lib/profile/service";
import { breakdownFromRow, computeBreakdown, upsertMatches, type JobWithCompany } from "@/lib/matching/service";
import { cosineForJobs } from "@/lib/vectors";
import { buildJobLines, buildMatchLines, buildProfileLines, linesMap, renderLines, type CtxLine } from "@/lib/copilot/context";
import { allowedFromProfile, checkGrounding, type GroundingReport } from "@/lib/copilot/grounding";
import { answerHeuristic, detectIntent } from "@/lib/copilot/heuristic";
import { llmMode, streamText } from "@/lib/llm/client";
import { env } from "@/lib/env";
import type { MatchBreakdown } from "@foothold/shared";

export const runtime = "nodejs";
export const maxDuration = 120;
const Body = z.object({ message: z.string().min(1).max(4000), jobId: z.string().nullable().optional(), conversationId: z.string().nullable().optional() });
const DAILY_LIMIT = 80;

const SYSTEM = `You are Belay, the job-search copilot inside Foothold. You help one candidate evaluate one job at a time.
Hard rules:
1. Every statement about the candidate must be followed by a citation to a profile line, like [P12]. Every statement about the job must cite a posting line, like [J4]. Statements about the fit score cite [M2]. Put the citation at the end of the sentence.
2. Never say the candidate has a skill, tool, employer, title, degree, or metric unless a P line states it. If you cannot ground a claim, write "I can't ground this from your profile" instead of guessing.
3. Do not invent numbers. Only reuse numbers that appear in P lines (cite them).
4. General knowledge about the company or interviewing is allowed when marked with the prefix "(general)" and it must never assert facts about the candidate.
5. Answer the question asked. Be concrete and brief: short paragraphs or bullets, no preamble. For "why do I match", walk through the fit components. For "gaps", list missing required skills with what the candidate does have that is closest. For a cover letter, output only the letter, ~250 words, with citations. For interview prep, give likely questions grounded in the posting and which profile line to draw on. For "should I apply", give a verdict and the reasons.
Citations are how the candidate verifies you. Keep them.`;

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const profile = await getFullProfile(user.id);
  if (!profile?.onboardingCompletedAt) return Response.json({ error: "Finish onboarding first" }, { status: 400 });
  const since = new Date(Date.now() - 86400_000);
  if ((await prisma.llmCall.count({ where: { userId: user.id, task: "copilot", createdAt: { gt: since } } })) >= DAILY_LIMIT) return Response.json({ error: "Daily copilot limit reached. Try again tomorrow." }, { status: 429 });

  let job: JobWithCompany | null = null;
  let breakdown: MatchBreakdown | null = null;
  if (body.data.jobId) {
    job = await prisma.job.findUnique({ where: { id: body.data.jobId }, include: { company: true } });
    if (job) {
      let m = await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId: job.id } } });
      if (!m) { const cos = (await cosineForJobs(profile.id, [job.id])).get(job.id) ?? null; await upsertMatches(profile, [{ jobId: job.id, breakdown: computeBreakdown(profile, job, cos) }]); m = await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId: job.id } } }); }
      breakdown = m ? breakdownFromRow(m) : null;
    }
  }
  const pLines = buildProfileLines(profile);
  const jLines = job ? buildJobLines(job) : [];
  const mLines = breakdown ? buildMatchLines(breakdown) : [];
  const all = [...pLines, ...jLines, ...mLines];
  const lmap = linesMap(all);

  const conversation = body.data.conversationId
    ? await prisma.copilotConversation.findFirst({ where: { id: body.data.conversationId, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } } })
    : null;
  const conv = conversation ?? await prisma.copilotConversation.create({ data: { userId: user.id, jobId: job?.id ?? null, title: body.data.message.slice(0, 80) }, include: { messages: true } });
  await prisma.copilotMessage.create({ data: { conversationId: conv.id, role: "USER", content: body.data.message } });
  const history: Anthropic.MessageParam[] = conv.messages.filter((m) => m.content.trim()).map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (ev: object) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      emit({ type: "context", conversationId: conv.id, lines: Object.fromEntries(all.map((l) => [l.id, { id: l.id, kind: l.kind, label: l.label, text: l.text }])) });
      const allowed = allowedFromProfile(profile);
      const mode = llmMode();
      let text = "";
      let report: GroundingReport;
      try {
        if (mode !== "anthropic") {
          const intent = detectIntent(body.data.message);
          text = answerHeuristic(intent, { profile: pLines, job: jLines, match: mLines, breakdown, candidateName: profile.fullName ?? "the candidate", jobTitle: job?.title ?? null, company: job?.company.name ?? null });
          for (const chunk of text.match(/[\s\S]{1,120}/g) ?? []) { emit({ type: "delta", text: chunk }); await new Promise((r) => setTimeout(r, 12)); }
          const g = checkGrounding(text, lmap, allowed, { requireCitations: true });
          report = { status: g.status, flagged: g.flags.map((f) => ({ sentence: f.sentence, reason: f.reason })), retried: false, mode: "heuristic" };
          await prisma.llmCall.create({ data: { userId: user.id, task: "copilot", model: "heuristic", mode: "heuristic", ok: true, durationMs: 0 } }).catch(() => {});
        } else {
          const context = `CANDIDATE PROFILE (cite as [P#]):\n${renderLines(pLines)}\n\n${job ? `JOB POSTING (cite as [J#]):\n${renderLines(jLines)}\n\nFIT BREAKDOWN (cite as [M#]):\n${renderLines(mLines)}` : "No job selected: talk about the candidate's profile and search strategy."}`;
          const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: body.data.message }];
          const r1 = await streamText({ task: "copilot", system: SYSTEM, cachedContext: context, messages, userId: user.id, model: env.modelMain, effort: "medium", maxTokens: 3000, onDelta: (t) => emit({ type: "delta", text: t }) });
          text = r1.text;
          let g = checkGrounding(text, lmap, allowed, { requireCitations: true });
          let retried = false;
          if (g.flags.length) {
            retried = true;
            const fix = `Your previous answer had grounding problems:\n${g.flags.map((f) => `- ${f.reason}: "${f.sentence.slice(0, 120)}"`).join("\n")}\nRewrite the whole answer so every claim about the candidate cites a P line that actually supports it, remove any claim you cannot ground (say so explicitly), and keep the same structure.`;
            const r2 = await streamText({ task: "copilot", system: SYSTEM, cachedContext: context, messages: [...messages, { role: "assistant", content: text }, { role: "user", content: fix }], userId: user.id, model: env.modelMain, effort: "medium", maxTokens: 3000 });
            text = r2.text;
            emit({ type: "replace", text });
            g = checkGrounding(text, lmap, allowed, { requireCitations: true });
          }
          if (g.status === "REJECTED") {
            const bad = new Set(g.flags.filter((f) => f.severity === "reject").map((f) => f.sentence));
            text = text.split(/(?<=[.!?])\s+/).map((s) => ([...bad].some((b) => b && s.includes(b.slice(0, 40))) ? "I can't ground this from your profile." : s)).join(" ");
            emit({ type: "replace", text });
          }
          report = { status: g.status, flagged: g.flags.map((f) => ({ sentence: f.sentence, reason: f.reason })), retried, mode: "anthropic" };
        }
        const citations = [...text.matchAll(/\[((?:P|J|M)\d+)/g)].map((m) => m[1]).filter((id, i, a) => a.indexOf(id) === i).map((id) => ({ id, text: lmap.get(id)?.text ?? null }));
        await prisma.copilotMessage.create({ data: { conversationId: conv.id, role: "ASSISTANT", content: text, citationsJson: citations, groundingStatus: report.status, groundingJson: report as object } });
        emit({ type: "grounding", report });
        emit({ type: "done" });
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : "Copilot failed" });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}

export type { CtxLine };
