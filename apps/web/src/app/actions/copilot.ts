"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { GroundingReport } from "@/lib/copilot/grounding";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface StoredMessage { id: string; role: "user" | "assistant"; content: string; grounding: GroundingReport | null; citations: Array<{ id: string; text: string | null }> }
export interface StoredConversation { id: string; messages: StoredMessage[] }

/** Latest Belay conversation for one job, so a prep session can be continued instead of restarted. */
export async function loadConversationAction(jobId: string): Promise<Result<StoredConversation | null>> {
  const user = await requireUser();
  const conv = await prisma.copilotConversation.findFirst({
    where: { userId: user.id, jobId },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
  });
  if (!conv || conv.messages.length === 0) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      id: conv.id,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
        grounding: (m.groundingJson as GroundingReport | null) ?? null,
        citations: Array.isArray(m.citationsJson) ? (m.citationsJson as Array<{ id: string; text: string | null }>) : [],
      })),
    },
  };
}
