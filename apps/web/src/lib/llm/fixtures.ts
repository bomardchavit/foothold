import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, unknown>();
/** Fixture outputs for LLM_MODE=fixture live in src/lib/llm/fixtures/<task>.json ({ "default": ..., "<key>": ... }). */
export function loadFixture(task: string, key?: string): unknown {
  const file = path.join(process.cwd(), "src/lib/llm/fixtures", `${task}.json`);
  if (!cache.has(file)) {
    if (!existsSync(file)) return undefined;
    cache.set(file, JSON.parse(readFileSync(file, "utf8")));
  }
  const data = cache.get(file) as Record<string, unknown>;
  return data[key ?? "default"] ?? data.default;
}
