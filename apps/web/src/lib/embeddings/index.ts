import { fnv1a, tokenize, extractSkills } from "@foothold/shared";
import { env } from "../env";

export type EmbeddingProvider = "voyage" | "openai" | "local";
export const EMBED_DIM = 1024;

export function embeddingProvider(): EmbeddingProvider {
  if (env.embeddingsProvider !== "auto") return env.embeddingsProvider;
  if (env.voyageKey) return "voyage";
  if (env.openaiKey) return "openai";
  return "local";
}

/** Deterministic feature-hashed embedding (unigrams + bigrams + taxonomy skills). Dev/CI fallback only. */
export function localEmbedding(text: string): number[] {
  const v = new Float64Array(EMBED_DIM);
  const toks = tokenize(text).filter((t) => t.length > 2 && !STOP.has(t));
  const add = (feat: string, weight: number) => {
    const h = fnv1a(feat);
    const idx = h % EMBED_DIM;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    v[idx] += sign * weight;
  };
  for (let i = 0; i < toks.length; i++) {
    add("u:" + toks[i], 1);
    if (i + 1 < toks.length) add("b:" + toks[i] + "_" + toks[i + 1], 0.7);
  }
  for (const s of extractSkills(text)) add("s:" + s.toLowerCase(), 4);
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}
const STOP = new Set(["the", "and", "for", "with", "you", "our", "are", "will", "that", "this", "have", "from", "your", "their", "who", "what", "we're", "we", "they", "about", "into", "across", "including", "other", "more", "than", "such", "all", "any", "can", "not", "but", "has", "was", "its", "per", "via", "etc"]);

async function voyageEmbed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.voyageKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: texts.slice(i, i + 64).map((t) => t.slice(0, 24000)), model: "voyage-3.5-lite", input_type: inputType, output_dimension: EMBED_DIM }),
    });
    if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    for (const d of json.data.sort((a, b) => a.index - b.index)) out.push(d.embedding);
  }
  return out;
}
async function openaiEmbed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: texts.slice(i, i + 64).map((t) => t.slice(0, 24000)), model: "text-embedding-3-small", dimensions: EMBED_DIM }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    for (const d of json.data.sort((a, b) => a.index - b.index)) out.push(d.embedding);
  }
  return out;
}

export async function embedTexts(texts: string[], inputType: "document" | "query" = "document"): Promise<{ vectors: number[][]; provider: EmbeddingProvider }> {
  const provider = embeddingProvider();
  if (!texts.length) return { vectors: [], provider };
  if (provider === "voyage") return { vectors: await voyageEmbed(texts, inputType), provider };
  if (provider === "openai") return { vectors: await openaiEmbed(texts), provider };
  return { vectors: texts.map(localEmbedding), provider };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
