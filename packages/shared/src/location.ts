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
  "united states": "US", usa: "US", us: "US", "u.s.": "US", "u.s.a.": "US", america: "US",
  canada: "CA", "united kingdom": "GB", uk: "GB", england: "GB", london: "GB", germany: "DE", france: "FR", india: "IN", ireland: "IE",
  netherlands: "NL", spain: "ES", australia: "AU", singapore: "SG", japan: "JP", brazil: "BR", mexico: "MX", israel: "IL", poland: "PL",
  sweden: "SE", switzerland: "CH", portugal: "PT", italy: "IT", "new zealand": "NZ", "south korea": "KR", "hong kong": "HK", "united arab emirates": "AE", dubai: "AE",
};
const CITY_HINTS: Record<string, [string, string]> = {
  "san francisco": ["CA", "US"], sf: ["CA", "US"], "bay area": ["CA", "US"], "sf bay area": ["CA", "US"], "silicon valley": ["CA", "US"], "palo alto": ["CA", "US"],
  "mountain view": ["CA", "US"], "menlo park": ["CA", "US"], "san jose": ["CA", "US"], sunnyvale: ["CA", "US"], oakland: ["CA", "US"], berkeley: ["CA", "US"],
  "los angeles": ["CA", "US"], la: ["CA", "US"], "san diego": ["CA", "US"], "santa monica": ["CA", "US"], irvine: ["CA", "US"], sacramento: ["CA", "US"],
  "new york": ["NY", "US"], nyc: ["NY", "US"], "new york city": ["NY", "US"], brooklyn: ["NY", "US"], manhattan: ["NY", "US"],
  seattle: ["WA", "US"], bellevue: ["WA", "US"], redmond: ["WA", "US"], austin: ["TX", "US"], dallas: ["TX", "US"], houston: ["TX", "US"],
  boston: ["MA", "US"], cambridge: ["MA", "US"], chicago: ["IL", "US"], denver: ["CO", "US"], boulder: ["CO", "US"], atlanta: ["GA", "US"],
  miami: ["FL", "US"], "washington, dc": ["DC", "US"], "washington dc": ["DC", "US"], "washington d.c.": ["DC", "US"], arlington: ["VA", "US"],
  philadelphia: ["PA", "US"], pittsburgh: ["PA", "US"], phoenix: ["AZ", "US"], portland: ["OR", "US"], "salt lake city": ["UT", "US"],
  minneapolis: ["MN", "US"], detroit: ["MI", "US"], "st. louis": ["MO", "US"], "kansas city": ["MO", "US"], nashville: ["TN", "US"],
  raleigh: ["NC", "US"], durham: ["NC", "US"], charlotte: ["NC", "US"], columbus: ["OH", "US"], "las vegas": ["NV", "US"], toronto: ["ON", "CA"],
  vancouver: ["BC", "CA"], montreal: ["QC", "CA"], london: ["", "GB"], berlin: ["", "DE"], paris: ["", "FR"], dublin: ["", "IE"], amsterdam: ["", "NL"],
  bangalore: ["", "IN"], bengaluru: ["", "IN"], hyderabad: ["", "IN"], pune: ["", "IN"], mumbai: ["", "IN"], singapore: ["", "SG"], sydney: ["", "AU"], "tel aviv": ["", "IL"],
};

export interface ParsedLocation { raw: string; city: string | null; region: string | null; country: string | null; isRemote: boolean; }

export function parseLocation(raw: string | null | undefined): ParsedLocation {
  const out: ParsedLocation = { raw: raw ?? "", city: null, region: null, country: null, isRemote: false };
  if (!raw) return out;
  const s = raw.trim();
  const low = s.toLowerCase();
  if (/\b(remote|anywhere|distributed|work from home|wfh)\b/.test(low)) out.isRemote = true;
  const parts = s.split(/[,;|\/·•–-]|\s-\s/).map((p) => p.trim()).filter(Boolean).filter((p) => !/^(remote|hybrid|on-?site|anywhere)$/i.test(p));
  for (const p of parts) {
    const pl = p.toLowerCase().replace(/\.$/, "");
    if (COUNTRIES[pl]) { out.country = COUNTRIES[pl]; continue; }
    if (US_STATES[p.toUpperCase()] && p.length === 2) { out.region = p.toUpperCase(); out.country ??= "US"; continue; }
    if (STATE_BY_NAME.has(pl)) { out.region = STATE_BY_NAME.get(pl)!; out.country ??= "US"; if (!out.city && CITY_HINTS[pl]) out.city = p; continue; }
    const hint = CITY_HINTS[pl];
    if (hint) { out.city ??= p; out.region ??= hint[0] || null; out.country ??= hint[1]; continue; }
    if (!out.city && /^[a-z .'-]+$/i.test(p) && p.length > 2) out.city = p;
  }
  if (!out.city && !out.region && !out.country) {
    for (const [name, hint] of Object.entries(CITY_HINTS)) {
      if (low.includes(name)) { out.city = name.replace(/\b\w/g, (c) => c.toUpperCase()); out.region = hint[0] || null; out.country = hint[1]; break; }
    }
  }
  if (out.city && !out.region) {
    const hint = CITY_HINTS[out.city.toLowerCase()];
    if (hint) { out.region = hint[0] || null; out.country ??= hint[1]; }
  }
  if (/\b(us|usa|united states)\b/.test(low)) out.country ??= "US";
  return out;
}

export function sameCity(a: ParsedLocation, b: ParsedLocation): boolean {
  if (!a.city || !b.city) return false;
  const x = a.city.toLowerCase(), y = b.city.toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}
