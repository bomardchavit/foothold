export const INDUSTRIES = [
  "Software / SaaS", "Fintech", "Healthcare", "E-commerce", "AI / Machine Learning", "Cybersecurity", "Consumer", "Enterprise",
  "Media / Entertainment", "Gaming", "Education", "Government", "Nonprofit", "Finance / Banking", "Insurance", "Real Estate",
  "Logistics / Supply Chain", "Automotive", "Energy / Climate", "Biotech / Pharma", "Hardware / Semiconductors", "Telecommunications",
  "Retail", "Travel / Hospitality", "Consulting", "Legal", "Marketing / Advertising", "Manufacturing", "Aerospace / Defense", "Crypto / Web3",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

const ADJACENT: Record<string, string[]> = {
  "Software / SaaS": ["Enterprise", "AI / Machine Learning", "Consumer", "Cybersecurity"],
  Fintech: ["Finance / Banking", "Insurance", "Crypto / Web3", "E-commerce"],
  Healthcare: ["Biotech / Pharma", "Insurance"],
  "E-commerce": ["Retail", "Consumer", "Logistics / Supply Chain", "Fintech"],
  "AI / Machine Learning": ["Software / SaaS", "Enterprise"],
  Cybersecurity: ["Software / SaaS", "Enterprise", "Government"],
  Consumer: ["E-commerce", "Media / Entertainment", "Gaming", "Software / SaaS"],
  Enterprise: ["Software / SaaS", "Consulting", "AI / Machine Learning"],
  "Media / Entertainment": ["Gaming", "Consumer", "Marketing / Advertising"],
  Gaming: ["Media / Entertainment", "Consumer"],
  Education: ["Nonprofit", "Government"],
  Government: ["Aerospace / Defense", "Nonprofit", "Cybersecurity"],
  Nonprofit: ["Education", "Government"],
  "Finance / Banking": ["Fintech", "Insurance", "Consulting"],
  Insurance: ["Finance / Banking", "Fintech", "Healthcare"],
  "Real Estate": ["Fintech", "Consumer"],
  "Logistics / Supply Chain": ["E-commerce", "Manufacturing", "Automotive"],
  Automotive: ["Manufacturing", "Hardware / Semiconductors", "Energy / Climate"],
  "Energy / Climate": ["Automotive", "Manufacturing", "Hardware / Semiconductors"],
  "Biotech / Pharma": ["Healthcare"],
  "Hardware / Semiconductors": ["Automotive", "Telecommunications", "Aerospace / Defense"],
  Telecommunications: ["Hardware / Semiconductors", "Enterprise"],
  Retail: ["E-commerce", "Consumer"],
  "Travel / Hospitality": ["Consumer", "E-commerce"],
  Consulting: ["Enterprise", "Finance / Banking"],
  Legal: ["Enterprise", "Government"],
  "Marketing / Advertising": ["Media / Entertainment", "Consumer", "Software / SaaS"],
  Manufacturing: ["Automotive", "Logistics / Supply Chain", "Hardware / Semiconductors"],
  "Aerospace / Defense": ["Government", "Hardware / Semiconductors"],
  "Crypto / Web3": ["Fintech", "Finance / Banking"],
};

export function industriesAdjacent(a: string, b: string): boolean {
  return (ADJACENT[a] ?? []).includes(b) || (ADJACENT[b] ?? []).includes(a);
}

/**
 * Industry keywords. Only words that describe what a company *does* belong here; words that also show up in
 * benefits/EEO text or generic prose ("agency", "claims", "legal", "students", "space", "platform") were removed
 * because a single stray mention used to relabel a whole company.
 */
const KEYWORDS: Array<[Industry, RegExp]> = [
  ["Fintech", /\b(fintech|payments?|payment processing|financial infrastructure|financial services|lending|neobank|brokerage|trading platform|credit cards?|money movement|banking as a service)\b/i],
  ["Finance / Banking", /\b(bank|banking|capital markets|asset management|hedge fund|private equity|investment bank(?:ing)?|wealth management)\b/i],
  ["Healthcare", /\b(healthcare|health care|healthtech|health tech|patients?|clinical|hospitals?|telehealth|ehr|provider network|health system)\b/i],
  ["Biotech / Pharma", /\b(biotech|pharma|pharmaceutical|drug discovery|genomics|life sciences|therapeutics)\b/i],
  ["E-commerce", /\b(e-?commerce|marketplace|online store|shoppers|checkout|merchants|storefronts?)\b/i],
  ["AI / Machine Learning", /\b(ai company|ai lab|machine learning company|ai-native|frontier models?|foundation models|ai platform|artificial intelligence|ai research)\b/i],
  ["Cybersecurity", /\b(cybersecurity|cyber security|security company|security platform|zero trust|identity security|threat detection|threat intelligence)\b/i],
  ["Gaming", /\b(game studio|gaming|video games?|esports|game developer)\b/i],
  ["Media / Entertainment", /\b(entertainment|media company|creators?|creator economy|music|podcasts?|film|television)\b/i],
  ["Education", /\b(edtech|education company|education platform|learners|school districts|universities|online learning|language learning)\b/i],
  ["Government", /\b(government|public sector|civic|federal agenc(?:y|ies)|state and local government)\b/i],
  ["Nonprofit", /\b(nonprofit|non-profit|ngo|philanthropy|foundation grants?)\b/i],
  ["Insurance", /\b(insurance|insurtech|underwriting|reinsurance|policyholders?)\b/i],
  ["Real Estate", /\b(real estate|proptech|mortgages?|rental platform|home buying|homeowners)\b/i],
  ["Logistics / Supply Chain", /\b(logistics|supply chain|freight|warehouses?|delivery network|last[- ]mile|fleet management)\b/i],
  ["Automotive", /\b(automotive|vehicles?|autonomous driving|self-driving|ev charging|automaker)\b/i],
  ["Energy / Climate", /\b(climate|clean energy|solar|renewable|decarboni[sz]ation|carbon|sustainability|utilities|energy company)\b/i],
  ["Hardware / Semiconductors", /\b(semiconductors?|chips?|silicon|hardware company|consumer electronics|gpus?)\b/i],
  ["Telecommunications", /\b(telecom|telecommunications|wireless carrier|5g|broadband)\b/i],
  ["Retail", /\b(retail|retailer|grocery|consumer goods|cpg|brick[- ]and[- ]mortar)\b/i],
  ["Travel / Hospitality", /\b(hospitality|hotels?|airlines?|vacation rentals?|travel company|travel platform|stays and experiences|hosts and guests)\b/i],
  ["Consulting", /\b(consulting firm|consultancy|advisory firm|professional services firm|management consulting)\b/i],
  ["Legal", /\b(law firm|legaltech|legal tech|legal services|contracts platform|contract management)\b/i],
  ["Marketing / Advertising", /\b(advertising|adtech|martech|ad platform|marketing platform|advertisers)\b/i],
  ["Manufacturing", /\b(manufacturing|factory|factories|industrial automation|manufacturer)\b/i],
  ["Aerospace / Defense", /\b(aerospace|defense|defence|satellites?|spacecraft|launch vehicles?|warfighters?)\b/i],
  ["Crypto / Web3", /\b(crypto|cryptocurrency|web3|blockchain|defi|nft|digital assets|cryptoeconomy|stablecoins?)\b/i],
  ["Enterprise", /\b(enterprise software|enterprise customers|fortune 500|b2b)\b/i],
  ["Consumer", /\b(consumer app|consumer product|b2c|consumer company|millions of users)\b/i],
  ["Software / SaaS", /\b(saas|software company|developer tools?|devtools|developer platform|observability|infrastructure software|cloud platform|design tool|collaboration tool)\b/i],
];

/** The part of a posting that describes the employer: the opening paragraphs plus an "About <company>" section. */
export function aboutCompanyText(text: string, chars = 1500): string {
  const head = text.slice(0, chars);
  const about = /^\s*about\s+(?!the\s+(?:role|team|job|position))\S[^\n]{0,60}$/im.exec(text);
  if (!about || about.index < chars) return head;
  return `${head}\n${text.slice(about.index, about.index + chars)}`;
}

export interface InferIndustryOptions {
  /** Hits required before an industry is accepted (default 2: one stray word should not relabel a company). */
  minHits?: number;
  /** Only look at the company-description part of the text (default true). */
  aboutOnly?: boolean;
}

export function inferIndustry(text: string, opts: InferIndustryOptions = {}): Industry | null {
  const minHits = opts.minHits ?? 2;
  const scope = opts.aboutOnly === false ? text : aboutCompanyText(text);
  let best: { ind: Industry; count: number } | null = null;
  for (const [ind, rx] of KEYWORDS) {
    const m = scope.match(new RegExp(rx.source, "gi"));
    const count = m?.length ?? 0;
    if (count >= minHits && (!best || count > best.count)) best = { ind, count };
  }
  return best?.ind ?? null;
}

export function normalizeIndustry(s: string | null | undefined): string | null {
  if (!s) return null;
  const low = s.toLowerCase();
  for (const ind of INDUSTRIES) if (ind.toLowerCase() === low) return ind;
  for (const ind of INDUSTRIES) if (ind.toLowerCase().split(/\s*\/\s*/).some((p) => low.includes(p))) return ind;
  return inferIndustry(s, { minHits: 1, aboutOnly: false }) ?? s;
}

/** Employers whose industry we know for sure; keyword guesses never override these. */
const KNOWN_COMPANY_INDUSTRIES: Record<string, Industry> = {
  "stripe.com": "Fintech", "coinbase.com": "Crypto / Web3", "cloudflare.com": "Software / SaaS", "datadoghq.com": "Software / SaaS",
  "airbnb.com": "Travel / Hospitality", "figma.com": "Software / SaaS", "doordash.com": "Consumer", "robinhood.com": "Fintech", "brex.com": "Fintech",
  "anduril.com": "Aerospace / Defense", "scale.com": "AI / Machine Learning", "vercel.com": "Software / SaaS", "discord.com": "Consumer",
  "mongodb.com": "Software / SaaS", "duolingo.com": "Education", "gitlab.com": "Software / SaaS", "plaid.com": "Fintech", "rippling.com": "Software / SaaS",
  "mistral.ai": "AI / Machine Learning", "netlify.com": "Software / SaaS", "notion.so": "Software / SaaS", "linear.app": "Software / SaaS", "ramp.com": "Fintech",
  "openai.com": "AI / Machine Learning", "anthropic.com": "AI / Machine Learning", "supabase.com": "Software / SaaS", "lyft.com": "Consumer",
  "pinterest.com": "Consumer", "redditinc.com": "Consumer", "reddit.com": "Consumer", "asana.com": "Software / SaaS", "dropbox.com": "Software / SaaS",
  "instacart.com": "E-commerce", "flexport.com": "Logistics / Supply Chain", "samsara.com": "Software / SaaS", "gusto.com": "Software / SaaS",
  "affirm.com": "Fintech", "chime.com": "Fintech", "databricks.com": "AI / Machine Learning", "roblox.com": "Gaming", "hashicorp.com": "Software / SaaS",
  "elastic.co": "Software / SaaS", "snowflake.com": "Software / SaaS", "twilio.com": "Software / SaaS", "shopify.com": "E-commerce", "square.com": "Fintech",
  "block.xyz": "Fintech", "uber.com": "Consumer", "netflix.com": "Media / Entertainment", "spotify.com": "Media / Entertainment", "salesforce.com": "Software / SaaS",
  "atlassian.com": "Software / SaaS", "okta.com": "Cybersecurity", "crowdstrike.com": "Cybersecurity", "palantir.com": "Software / SaaS", "nvidia.com": "Hardware / Semiconductors",
  "tesla.com": "Automotive", "rivian.com": "Automotive", "spacex.com": "Aerospace / Defense", "airtable.com": "Software / SaaS", "zapier.com": "Software / SaaS",
};

/** Industry for a well-known employer, keyed by website domain ("www." and subdomains ignored). */
export function industryForDomain(domain: string | null | undefined): Industry | null {
  if (!domain) return null;
  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (KNOWN_COMPANY_INDUSTRIES[d]) return KNOWN_COMPANY_INDUSTRIES[d];
  const parts = d.split(".");
  for (let i = 1; i < parts.length - 1; i++) { const k = parts.slice(i).join("."); if (KNOWN_COMPANY_INDUSTRIES[k]) return KNOWN_COMPANY_INDUSTRIES[k]; }
  return null;
}
