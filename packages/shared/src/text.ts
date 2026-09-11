/** Text utilities shared by the web app and the extension. Runtime-agnostic (no Node APIs). */

export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const LEGAL_SUFFIXES = [
  "incorporated", "inc", "llc", "l.l.c", "ltd", "limited", "corporation", "corp", "co", "company",
  "plc", "gmbh", "s.a", "sa", "ag", "lp", "llp", "pllc", "pc", "pty", "bv", "nv", "srl", "sas", "kk",
];

/** Company-name key used for joins across sources and the USCIS H-1B file. */
export function normalizeCompanyName(name: string): string {
  let s = normalizeText(name).replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^the /, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      const clean = suf.replace(/\./g, "");
      if (s.endsWith(" " + clean)) { s = s.slice(0, -(clean.length + 1)).trim(); changed = true; }
    }
  }
  return s;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#x2F": "/", "#47": "/", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", mdash: "—", ndash: "–", hellip: "…", bull: "•", middot: "·" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (ENTITIES[code] !== undefined) return ENTITIES[code];
    if (code.startsWith("#x")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return m;
  });
}

/** HTML → readable plain text that keeps paragraph and list-item breaks. */
export function stripHtml(html: string): string {
  let s = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*li\s*>/gi, "")
    .replace(/<\s*\/\s*(p|div|h[1-6]|tr|section|article|ul|ol|blockquote)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}(?=• )/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeText(s).split(/[^a-z0-9+#.]+/).filter((t) => t.length > 1);
}

/** 32-bit FNV-1a, returned as unsigned int. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 64-bit simhash over word unigrams + bigrams (as 16 hex chars). Near-duplicate texts have a small Hamming distance. */
export function simhash(text: string): string {
  const words = tokenize(text);
  const v = new Array<number>(64).fill(0);
  const feats: string[] = [];
  for (let i = 0; i < words.length; i++) {
    feats.push("u:" + words[i]);
    if (i + 1 < words.length) feats.push("b:" + words[i] + " " + words[i + 1]);
  }
  for (const f of feats) {
    const h1 = fnv1a(f);
    const h2 = fnv1a(f + "|");
    for (let b = 0; b < 32; b++) {
      v[b] += (h1 >>> b) & 1 ? 1 : -1;
      v[32 + b] += (h2 >>> b) & 1 ? 1 : -1;
    }
  }
  let out = "";
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let j = 0; j < 4; j++) nib |= (v[i + j] > 0 ? 1 : 0) << j;
    out += nib.toString(16);
  }
  return out;
}

export function hammingDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

/** Split prose into sentences / bullet lines (used for line-numbered LLM context). */
export function splitLines(text: string, maxLines = 400): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const p = para.replace(/^[•\-*•●▪–—]\s*/, "").trim();
    if (!p) continue;
    if (p.length <= 150) { out.push(p); continue; }
    for (const sent of p.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
      const t = sent.trim();
      if (t) out.push(t);
    }
  }
  return out.slice(0, maxLines);
}

/** Every numeric token (with %, $, k, x, commas, decimals) in a string, normalized. */
export function numericTokens(s: string): string[] {
  const m = s.match(/\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:%|k|m|x|\+)(?![a-z]))?/gi) ?? [];
  return m.map((t) => t.replace(/[\s,$]/g, "").toLowerCase());
}
