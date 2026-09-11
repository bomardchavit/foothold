import { prisma } from "../db";
import { env } from "../env";
import { sendEmail } from "../email";
import { track } from "../analytics/server";
import { EVENTS } from "../analytics/events";

export async function buildDigestForUser(userId: string) {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
  if (!profile?.onboardingCompletedAt) return null;
  const last = await prisma.digestSend.findFirst({ where: { userId }, orderBy: { sentAt: "desc" } });
  const since = last?.sentAt ?? new Date(Date.now() - 7 * 86400_000);
  const matches = await prisma.matchScore.findMany({
    where: { profileId: profile.id, total: { gte: 50 }, job: { firstSeenAt: { gt: since }, isLowQuality: false, closedAt: null } },
    orderBy: { total: "desc" }, take: 10, include: { job: { include: { company: true } } },
  });
  return { profile, since, matches };
}

export async function sendDigestToUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return false;
  const d = await buildDigestForUser(userId);
  if (!d || d.matches.length === 0) return false;
  const rows = d.matches.map((m) => `<li><a href="${env.appUrl}/jobs/${m.jobId}?utm=digest"><strong>${esc(m.job.title)}</strong></a> at ${esc(m.job.company.name)} — fit ${m.total}/100${m.job.location ? `, ${esc(m.job.location)}` : ""}</li>`).join("");
  const textRows = d.matches.map((m) => `- ${m.job.title} at ${m.job.company.name} — fit ${m.total}/100  ${env.appUrl}/jobs/${m.jobId}`).join("\n");
  const html = `<p>${d.matches.length} new matches since ${d.since.toDateString()}:</p><ol>${rows}</ol><p><a href="${env.appUrl}/feed?utm=digest">Open your feed</a> · <a href="${env.appUrl}/settings">Digest settings</a></p>`;
  const text = `${d.matches.length} new matches since ${d.since.toDateString()}:\n${textRows}\n\nOpen your feed: ${env.appUrl}/feed`;
  await sendEmail(user.email, `${d.matches.length} new job matches on Foothold`, html, text);
  await prisma.digestSend.create({ data: { userId, jobIds: d.matches.map((m) => m.jobId) } });
  track(userId, EVENTS.digest_sent, { count: d.matches.length });
  return true;
}

export async function dailyDigestJob() {
  const users = await prisma.user.findMany({ where: { profile: { onboardingCompletedAt: { not: null } }, email: { not: null } }, select: { id: true } });
  let sent = 0;
  for (const u of users) { try { if (await sendDigestToUser(u.id)) sent++; } catch (e) { console.warn("[digest] failed for", u.id, e); } }
  console.log(`[digest] sent ${sent}/${users.length}`);
  return sent;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
