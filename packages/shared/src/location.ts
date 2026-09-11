export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};
const STATE_BY_NAME = new Map(Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr]));

const COUNTRIES: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", us: "US", "u.s.": "US", "u.s.a.": "US", america: "US",
  canada: "CA", "united kingdom": "GB", uk: "GB", england: "GB", scotland: "GB", london: "GB", germany: "DE", france: "FR", india: "IN", ireland: "IE",
  netherlands: "NL", spain: "ES", australia: "AU", singapore: "SG", japan: "JP", brazil: "BR", mexico: "MX", israel: "IL", poland: "PL",
  sweden: "SE", switzerland: "CH", portugal: "PT", italy: "IT", "new zealand": "NZ", "south korea": "KR", korea: "KR", "hong kong": "HK",
  "united arab emirates": "AE", uae: "AE", dubai: "AE", "abu dhabi": "AE", philippines: "PH", romania: "RO", china: "CN", luxembourg: "LU",
  "saudi arabia": "SA", indonesia: "ID", thailand: "TH", vietnam: "VN", chile: "CL", colombia: "CO", argentina: "AR", peru: "PE", taiwan: "TW",
  denmark: "DK", norway: "NO", finland: "FI", belgium: "BE", austria: "AT", "czech republic": "CZ", czechia: "CZ", hungary: "HU", greece: "GR",
  turkey: "TR", cyprus: "CY", malaysia: "MY", egypt: "EG", nigeria: "NG", kenya: "KE", "south africa": "ZA", pakistan: "PK", bangladesh: "BD",
  "sri lanka": "LK", ukraine: "UA", estonia: "EE", latvia: "LV", lithuania: "LT", serbia: "RS", croatia: "HR", bulgaria: "BG", slovakia: "SK",
  slovenia: "SI", "costa rica": "CR", uruguay: "UY", "puerto rico": "PR", qatar: "QA",
};
/** Country-code prefixes used by ATS boards: "US-Chicago", "CA-Toronto", "IN-Bengaluru". */
const COUNTRY_PREFIX: Record<string, string> = { US: "US", USA: "US", CA: "CA", IN: "IN", UK: "GB", GB: "GB", DE: "DE", FR: "FR", AU: "AU", SG: "SG", MX: "MX", BR: "BR", JP: "JP", IE: "IE", NL: "NL", ES: "ES", PT: "PT" };

const CITY_HINTS: Record<string, [string, string]> = {
  "san francisco": ["CA", "US"], sf: ["CA", "US"], "sf bay area": ["CA", "US"], "bay area": ["CA", "US"], "san francisco bay area": ["CA", "US"], "silicon valley": ["CA", "US"], "palo alto": ["CA", "US"],
  "mountain view": ["CA", "US"], "menlo park": ["CA", "US"], "san jose": ["CA", "US"], sunnyvale: ["CA", "US"], oakland: ["CA", "US"], berkeley: ["CA", "US"],
  "south san francisco": ["CA", "US"], "redwood city": ["CA", "US"], "san mateo": ["CA", "US"], "santa clara": ["CA", "US"], cupertino: ["CA", "US"],
  "los angeles": ["CA", "US"], "san diego": ["CA", "US"], "santa monica": ["CA", "US"], irvine: ["CA", "US"], sacramento: ["CA", "US"],
  "new york": ["NY", "US"], nyc: ["NY", "US"], "new york city": ["NY", "US"], brooklyn: ["NY", "US"], manhattan: ["NY", "US"],
  seattle: ["WA", "US"], sea: ["WA", "US"], bellevue: ["WA", "US"], redmond: ["WA", "US"], austin: ["TX", "US"], dallas: ["TX", "US"], houston: ["TX", "US"],
  boston: ["MA", "US"], cambridge: ["MA", "US"], chicago: ["IL", "US"], chi: ["IL", "US"], champaign: ["IL", "US"], denver: ["CO", "US"], boulder: ["CO", "US"], atlanta: ["GA", "US"], atl: ["GA", "US"],
  miami: ["FL", "US"], "washington, dc": ["DC", "US"], "washington dc": ["DC", "US"], "washington d.c.": ["DC", "US"], "washington d.c": ["DC", "US"], arlington: ["VA", "US"],
  philadelphia: ["PA", "US"], pittsburgh: ["PA", "US"], phoenix: ["AZ", "US"], portland: ["OR", "US"], "salt lake city": ["UT", "US"],
  minneapolis: ["MN", "US"], detroit: ["MI", "US"], "st. louis": ["MO", "US"], "st louis": ["MO", "US"], "kansas city": ["MO", "US"], nashville: ["TN", "US"],
  raleigh: ["NC", "US"], durham: ["NC", "US"], charlotte: ["NC", "US"], columbus: ["OH", "US"], cleveland: ["OH", "US"], "las vegas": ["NV", "US"],
  "new orleans": ["LA", "US"], "baton rouge": ["LA", "US"], toronto: ["ON", "CA"], vancouver: ["BC", "CA"], montreal: ["QC", "CA"], ottawa: ["ON", "CA"],
  london: ["", "GB"], berlin: ["", "DE"], munich: ["", "DE"], paris: ["", "FR"], dublin: ["", "IE"], dub: ["", "IE"], amsterdam: ["", "NL"], madrid: ["", "ES"], barcelona: ["", "ES"],
  lisbon: ["", "PT"], milan: ["", "IT"], zurich: ["", "CH"], stockholm: ["", "SE"], copenhagen: ["", "DK"], warsaw: ["", "PL"], bucharest: ["", "RO"],
  bangalore: ["", "IN"], bengaluru: ["", "IN"], hyderabad: ["", "IN"], pune: ["", "IN"], mumbai: ["", "IN"], delhi: ["", "IN"], "new delhi": ["", "IN"], gurgaon: ["", "IN"], gurugram: ["", "IN"], chennai: ["", "IN"],
  singapore: ["", "SG"], sydney: ["", "AU"], melbourne: ["", "AU"], auckland: ["", "NZ"], "tel aviv": ["", "IL"], tokyo: ["", "JP"], seoul: ["", "KR"],
  manila: ["", "PH"], jakarta: ["", "ID"], bangkok: ["", "TH"], "kuala lumpur": ["", "MY"], taipei: ["", "TW"], "taipei city": ["", "TW"], beijing: ["", "CN"], shanghai: ["", "CN"],
  "sao paulo": ["", "BR"], "são paulo": ["", "BR"], "mexico city": ["", "MX"], cdmx: ["", "MX"], bogota: ["", "CO"], bogotá: ["", "CO"], santiago: ["", "CL"], "buenos aires": ["", "AR"], riyadh: ["", "SA"],
};

/** Board shorthand → the city name we store, so "SF" and "San Francisco" compare equal. */
const CITY_ALIAS: Record<string, string> = {
  sf: "San Francisco", "sf bay area": "San Francisco", "bay area": "San Francisco", "san francisco bay area": "San Francisco", nyc: "New York", "new york city": "New York", sea: "Seattle", chi: "Chicago",
  atl: "Atlanta", dub: "Dublin", cdmx: "Mexico City", "st louis": "St. Louis", "washington dc": "Washington", "washington, dc": "Washington", "washington d.c.": "Washington", "washington d.c": "Washington",
};

/** Tokens that look like a city but are workplace words or placeholders. */
const PSEUDO = new Set([
  "in-office", "in office", "office", "onsite", "on-site", "on site", "distributed", "remote", "hybrid", "flexible", "anywhere", "worldwide", "global",
  "location", "locations", "n/a", "na", "tbd", "tba", "various", "multiple", "multiple locations", "headquarters", "hq", "home", "work from home", "wfh",
  "rem", "us remote", "remote us", "national", "north america", "amer", "emea", "apac", "latam", "europe", "asia", "west coast", "east coast", "other", "any",
  "friendly", "remote friendly", "remote-friendly", "select locations", "all locations", "us: select locations", "open", "open to remote", "not specified", "unspecified", "no location", "none",
]);
const REMOTE_RX = /\b(remote|anywhere|distributed|work from home|wfh|rem)\b/i;
const WORKPLACE_WORD = /^(?:remote|hybrid|on-?site|in-?office|anywhere|distributed|wfh|rem|flexible|friendly|remote-?friendly)$/i;

export interface ParsedLocation { raw: string; city: string | null; region: string | null; country: string | null; isRemote: boolean; }

function cleanToken(p: string): string {
  return p.replace(/\s*\bHQ\b\s*/gi, " ").replace(/\.$/, "").replace(/\s+/g, " ").replace(/^[\s-]+|[\s-]+$/g, "").trim();
}

function splitParts(s: string): string[] {
  const out: string[] = [];
  for (const chunk of s.split(/\s*(?:[,;|/·•:]|\s-\s|\s+[–—]\s*|\bor\b|\band\b|&)\s*/i)) {
    let p = chunk.trim();
    if (!p) continue;
    // "Remote-USA", "US-Remote", "Hybrid-New York": a hyphen next to a workplace word separates two tokens
    const dash = /^([^-]+)-(.+)$/.exec(p);
    if (dash && (WORKPLACE_WORD.test(dash[1].trim()) || WORKPLACE_WORD.test(dash[2].trim()))) { out.push(dash[1].trim(), dash[2].trim()); continue; }
    // "US-Chicago", "CA-Toronto": a country-code prefix
    const pref = /^([A-Z]{2,3})\s*-\s*(.+)$/.exec(p);
    if (pref && COUNTRY_PREFIX[pref[1]]) { out.push(pref[1], pref[2].trim()); continue; }
    // "Remote in the US", "Remote from the US", "Remote Switzerland", "US Remote National"
    p = p.replace(/^(?:remote|hybrid)\s+(?:in|from)\s+(?:the\s+)?/i, "").replace(/^(?:remote|hybrid)\s+(?=[a-z])/i, "").replace(/\s+(?:remote|hybrid|national)$/i, "");
    out.push(p);
  }
  return out;
}

export function parseLocation(raw: string | null | undefined): ParsedLocation {
  const out: ParsedLocation = { raw: raw ?? "", city: null, region: null, country: null, isRemote: false };
  if (!raw) return out;
  // "(Hybrid)", "(Remote)", "(On-site)" are workplace notes, not places; "(US)" and "(Colombia)" are places
  const s = raw.trim().replace(/\s*\((?:hybrid|remote|on-?site|onsite|flexible|in-?office)\)\s*/gi, " ").replace(/^\(\s*|\s*\)$/g, "").replace(/\s+/g, " ").trim();
  const low = s.toLowerCase();
  if (REMOTE_RX.test(low)) out.isRemote = true;
  const parts = splitParts(s).map(cleanToken).filter(Boolean).filter((p) => !WORKPLACE_WORD.test(p));
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const pl = p.toLowerCase().replace(/-/g, " ");
    const next = (parts[i + 1] ?? "").toLowerCase().replace(/\.$/, "");
    if (PSEUDO.has(pl)) continue;
    if (COUNTRY_PREFIX[p] && /^[A-Z]{2,3}$/.test(p) && (i + 1 < parts.length || p === "US" || p === "USA")) {
      if (!US_STATES[p] || p === "US" || (i + 1 < parts.length && !US_STATES[parts[i + 1].toUpperCase()])) { out.country ??= COUNTRY_PREFIX[p]; continue; }
    }
    if (COUNTRIES[pl]) { out.country ??= COUNTRIES[pl]; if (!out.city && CITY_HINTS[pl]) { out.city = CITY_ALIAS[pl] ?? p; out.region ??= CITY_HINTS[pl][0] || null; } continue; }
    if (US_STATES[p.toUpperCase()] && p.length === 2) { if (!out.country || out.country === "US") { out.region ??= p.toUpperCase(); out.country ??= "US"; } continue; }
    if (STATE_BY_NAME.has(pl)) {
      // "Washington, DC" / "Washington, District of Columbia" is the city, not the state
      const nextIsDc = next === "dc" || next === "d.c" || next === "district of columbia";
      if (pl === "washington" && nextIsDc) { out.city ??= "Washington"; out.region ??= "DC"; out.country ??= "US"; continue; }
      if (!out.country || out.country === "US") { out.region ??= STATE_BY_NAME.get(pl)!; out.country ??= "US"; }
      if (!out.city && CITY_HINTS[pl]) out.city = CITY_ALIAS[pl] ?? p;
      continue;
    }
    const hint = CITY_HINTS[pl];
    if (hint) { out.city ??= CITY_ALIAS[pl] ?? p; out.region ??= hint[0] || null; out.country ??= hint[1]; continue; }
    if (!out.city && /^[a-z .'À-ſ-]+$/i.test(p) && p.length > 2 && !/^(?:remote|hybrid)\b/i.test(p)) out.city = p;
  }
  if (!out.city && !out.region && !out.country) {
    for (const [name, hint] of Object.entries(CITY_HINTS)) {
      if (name.length < 4) continue;
      if (new RegExp(`(?<![a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "i").test(low)) {
        out.city = CITY_ALIAS[name] ?? name.replace(/\b\w/g, (c) => c.toUpperCase()); out.region = hint[0] || null; out.country = hint[1]; break;
      }
    }
  }
  if (out.city && !out.region) {
    const hint = CITY_HINTS[out.city.toLowerCase()];
    if (hint) { out.region = hint[0] || null; out.country ??= hint[1]; }
  }
  if (/\b(us|usa|united states|u\.s\.)\b/.test(low)) out.country ??= "US";
  return out;
}

export function sameCity(a: ParsedLocation, b: ParsedLocation): boolean {
  if (!a.city || !b.city) return false;
  const x = a.city.toLowerCase(), y = b.city.toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}
