import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
type AnyZod<T> = z.ZodType<T, unknown>;
import { env } from "../env";
import { prisma } from "../db";
import { loadFixture } from "./fixtures";

export type LlmMode = "anthropic" | "heuristic" | "fixture";

/** auto → anthropic when ANTHROPIC_API_KEY is set, otherwise the built-in heuristic engines. */
export function llmMode(): LlmMode {
  if (env.llmMode === "auto") return env.anthropicKey ? "anthropic" : "heuristic";
  return env.llmMode;
}
export const hasLlm = () => llmMode() === "anthropic";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey ?? undefined, maxRetries: 2, timeout: 120_000 });
  return client;
}

// USD per million tokens
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};
export interface Usage { input: number; output: number; cacheRead: number }
export function estimateCostUsd(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5"];
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead) / 1_000_000;
}
function usageOf(m: Anthropic.Message | null | undefined): Usage {
  return { input: m?.usage?.input_tokens ?? 0, output: m?.usage?.output_tokens ?? 0, cacheRead: m?.usage?.cache_read_input_tokens ?? 0 };
}

export async function logCall(args: { userId?: string | null; task: string; model: string; mode: LlmMode; usage?: Usage; ok: boolean; error?: string; durationMs: number }) {
  const usage = args.usage ?? { input: 0, output: 0, cacheRead: 0 };
  try {
    await prisma.llmCall.create({
      data: {
        userId: args.userId ?? null, task: args.task, model: args.model, mode: args.mode,
        inputTokens: usage.input, outputTokens: usage.output, cacheReadTokens: usage.cacheRead,
        costUsd: args.mode === "anthropic" ? estimateCostUsd(args.model, usage) : 0,
        ok: args.ok, error: args.error?.slice(0, 500), durationMs: args.durationMs,
      },
    });
  } catch (e) { console.warn("[llm] could not log call", e); }
}

export interface StructuredArgs<T> {
  task: string;
  schema: AnyZod<T>;
  system: string;
  /** Large, stable context (profile, job) placed in a cached system block. */
  cachedContext?: string;
  user: string;
  userId?: string | null;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  fixtureKey?: string;
}

/** Structured generation through the Anthropic SDK (`messages.parse`). Throws in heuristic mode — callers branch on `llmMode()` first. */
export async function structured<T>(args: StructuredArgs<T>): Promise<T> {
  const mode = llmMode();
  const model = args.model ?? env.modelMain;
  const started = Date.now();
  if (mode === "fixture") {
    const fx = loadFixture(args.task, args.fixtureKey);
    if (fx === undefined) throw new Error(`No fixture for task "${args.task}"${args.fixtureKey ? ` key "${args.fixtureKey}"` : ""}`);
    await logCall({ userId: args.userId, task: args.task, model: "fixture", mode, ok: true, durationMs: Date.now() - started });
    return args.schema.parse(fx);
  }
  if (mode === "heuristic") throw new Error(`structured(${args.task}) called in heuristic mode`);

  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: args.system }];
  if (args.cachedContext) system.push({ type: "text", text: args.cachedContext, cache_control: { type: "ephemeral" } });
  const isOpus = model.startsWith("claude-opus");
  try {
    const res = await anthropic().messages.parse({
      model,
      max_tokens: args.maxTokens ?? 16000,
      system,
      messages: [{ role: "user", content: args.user }],
      output_config: { format: zodOutputFormat(args.schema as unknown as Parameters<typeof zodOutputFormat>[0]), ...(isOpus && args.effort ? { effort: args.effort } : {}) },
    });
    const usage = usageOf(res);
    if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (!res.parsed_output) throw new Error("Structured output could not be parsed.");
    await logCall({ userId: args.userId, task: args.task, model, mode, usage, ok: true, durationMs: Date.now() - started });
    return res.parsed_output as T;
  } catch (e) {
    await logCall({ userId: args.userId, task: args.task, model, mode, ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started });
    throw e;
  }
}

export interface StreamArgs {
  task: string;
  system: string;
  cachedContext?: string;
  messages: Anthropic.MessageParam[];
  userId?: string | null;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  onDelta?: (text: string) => void;
}

/** Streaming text generation. Returns the full text once the stream completes. */
export async function streamText(args: StreamArgs): Promise<{ text: string; usage: Usage; stopReason: string | null }> {
  const model = args.model ?? env.modelMain;
  const started = Date.now();
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: args.system }];
  if (args.cachedContext) system.push({ type: "text", text: args.cachedContext, cache_control: { type: "ephemeral" } });
  const isOpus = model.startsWith("claude-opus");
  try {
    const stream = anthropic().messages.stream({
      model,
      max_tokens: args.maxTokens ?? 8000,
      system,
      messages: args.messages,
      ...(isOpus && args.effort ? { output_config: { effort: args.effort } } : {}),
    });
    if (args.onDelta) stream.on("text", (t) => args.onDelta!(t));
    const final = await stream.finalMessage();
    const text = final.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const usage = usageOf(final);
    await logCall({ userId: args.userId, task: args.task, model, mode: "anthropic", usage, ok: true, durationMs: Date.now() - started });
    return { text, usage, stopReason: final.stop_reason };
  } catch (e) {
    await logCall({ userId: args.userId, task: args.task, model, mode: "anthropic", ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started });
    throw e;
  }
}
