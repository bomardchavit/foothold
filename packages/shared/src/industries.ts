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

const KEYWORDS: Array<[Industry, RegExp]> = [
  ["Fintech", /\b(fintech|payments?|lending|neobank|brokerage|trading platform|wealth|credit card)\b/i],
  ["Finance / Banking", /\b(bank|banking|investment|capital markets|asset management|hedge fund|private equity)\b/i],
  ["Healthcare", /\b(healthcare|health care|patients?|clinical|hospital|telehealth|medical|ehr|provider network)\b/i],
  ["Biotech / Pharma", /\b(biotech|pharma|drug discovery|genomics|life sciences|therapeutics)\b/i],
  ["E-commerce", /\b(e-?commerce|marketplace|online store|shoppers|checkout|merchants)\b/i],
  ["AI / Machine Learning", /\b(ai company|machine learning company|ai-native|llm|foundation models|ai platform|artificial intelligence)\b/i],
  ["Cybersecurity", /\b(cybersecurity|security company|threat|zero trust|identity security|endpoint)\b/i],
  ["Gaming", /\b(game studio|gaming|video games?|players|esports)\b/i],
  ["Media / Entertainment", /\b(streaming|entertainment|media company|creators|music|podcast|publishing)\b/i],
  ["Education", /\b(edtech|education|students|learners|school districts|universities)\b/i],
  ["Government", /\b(government|federal|public sector|civic|agency)\b/i],
  ["Nonprofit", /\b(nonprofit|non-profit|ngo|mission-driven|philanthropy)\b/i],
  ["Insurance", /\b(insurance|insurtech|underwriting|claims)\b/i],
  ["Real Estate", /\b(real estate|proptech|mortgage|housing|rentals?)\b/i],
  ["Logistics / Supply Chain", /\b(logistics|supply chain|freight|shipping|warehouse|delivery network|fleet)\b/i],
  ["Automotive", /\b(automotive|vehicles?|autonomous driving|ev charging|mobility)\b/i],
  ["Energy / Climate", /\b(climate|clean energy|solar|renewable|carbon|sustainability|grid)\b/i],
  ["Hardware / Semiconductors", /\b(semiconductor|chips?|silicon|hardware company|devices)\b/i],
  ["Telecommunications", /\b(telecom|telecommunications|wireless carrier|5g)\b/i],
  ["Retail", /\b(retail|retailer|stores|grocery|consumer goods|cpg)\b/i],
  ["Travel / Hospitality", /\b(travel|hospitality|hotels?|airlines?|booking|vacation)\b/i],
  ["Consulting", /\b(consulting|consultancy|advisory|professional services)\b/i],
  ["Legal", /\b(legal|law firm|legaltech|contracts platform)\b/i],
  ["Marketing / Advertising", /\b(advertising|adtech|martech|ad platform|marketing platform|agency)\b/i],
  ["Manufacturing", /\b(manufacturing|factory|industrial|plant)\b/i],
  ["Aerospace / Defense", /\b(aerospace|defense|space|satellite|clearance)\b/i],
  ["Crypto / Web3", /\b(crypto|web3|blockchain|defi|nft|digital assets)\b/i],
  ["Enterprise", /\b(enterprise software|enterprise customers|fortune 500|b2b)\b/i],
  ["Consumer", /\b(consumer app|consumers|b2c|mobile app for)\b/i],
  ["Software / SaaS", /\b(saas|software company|developer tools|devtools|platform)\b/i],
];

export function inferIndustry(text: string): Industry | null {
  let best: { ind: Industry; count: number } | null = null;
  for (const [ind, rx] of KEYWORDS) {
    const m = text.match(new RegExp(rx.source, "gi"));
    const count = m?.length ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { ind, count };
  }
  return best?.ind ?? null;
}

export function normalizeIndustry(s: string | null | undefined): string | null {
  if (!s) return null;
  const low = s.toLowerCase();
  for (const ind of INDUSTRIES) if (ind.toLowerCase() === low) return ind;
  for (const ind of INDUSTRIES) if (ind.toLowerCase().split(/\s*\/\s*/).some((p) => low.includes(p))) return ind;
  return inferIndustry(s) ?? s;
}
