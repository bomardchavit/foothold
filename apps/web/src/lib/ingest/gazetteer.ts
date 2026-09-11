/**
 * Place-name gazetteer for the job-country scope check: country names, aliases, regions and the non-US cities that show up
 * in ATS location strings, each mapped to an ISO 3166-1 alpha-2 code (regions map to pseudo-codes that never match an
 * allowed country). Pure data + matching; parseLocation (packages/shared) stays the structured parser.
 *
 * Deliberately absent because they collide with US places: Georgia (state), Jersey, Columbia, Holland, Ontario (CA city),
 * San José, Valencia, Victoria, Lebanon, Panama City. "New Mexico" and "New England" are excluded by lookbehind.
 */
const COUNTRY_NAMES: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", us: "US", "u.s.": "US", "u.s.a.": "US", america: "US", "puerto rico": "US",
  canada: "CA", mexico: "MX", "united kingdom": "GB", uk: "GB", "u.k.": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  ireland: "IE", germany: "DE", deutschland: "DE", france: "FR", spain: "ES", españa: "ES", portugal: "PT", italy: "IT", italia: "IT", netherlands: "NL", "the netherlands": "NL", belgium: "BE", luxembourg: "LU",
  switzerland: "CH", austria: "AT", denmark: "DK", sweden: "SE", norway: "NO", finland: "FI", iceland: "IS", poland: "PL", "czech republic": "CZ", czechia: "CZ", slovakia: "SK", hungary: "HU",
  romania: "RO", bulgaria: "BG", greece: "GR", cyprus: "CY", malta: "MT", croatia: "HR", serbia: "RS", slovenia: "SI", bosnia: "BA", "bosnia and herzegovina": "BA", montenegro: "ME", albania: "AL", "north macedonia": "MK",
  ukraine: "UA", belarus: "BY", russia: "RU", "russian federation": "RU", estonia: "EE", latvia: "LV", lithuania: "LT", moldova: "MD", turkey: "TR", türkiye: "TR", turkiye: "TR",
  israel: "IL", "united arab emirates": "AE", uae: "AE", "u.a.e.": "AE", "saudi arabia": "SA", ksa: "SA", qatar: "QA", kuwait: "KW", bahrain: "BH", oman: "OM", jordan: "JO", egypt: "EG",
  "south africa": "ZA", nigeria: "NG", kenya: "KE", ghana: "GH", morocco: "MA", tunisia: "TN", ethiopia: "ET", rwanda: "RW", uganda: "UG", tanzania: "TZ",
  india: "IN", pakistan: "PK", bangladesh: "BD", "sri lanka": "LK", nepal: "NP", china: "CN", "people's republic of china": "CN", prc: "CN", "hong kong": "HK", macau: "MO", macao: "MO", taiwan: "TW",
  japan: "JP", "south korea": "KR", korea: "KR", "republic of korea": "KR", "korea, republic of": "KR", singapore: "SG", malaysia: "MY", indonesia: "ID", thailand: "TH", vietnam: "VN", "viet nam": "VN",
  philippines: "PH", cambodia: "KH", laos: "LA", myanmar: "MM", mongolia: "MN", kazakhstan: "KZ", uzbekistan: "UZ", armenia: "AM", azerbaijan: "AZ",
  australia: "AU", "new zealand": "NZ", brazil: "BR", brasil: "BR", argentina: "AR", chile: "CL", colombia: "CO", peru: "PE", uruguay: "UY", paraguay: "PY", bolivia: "BO", ecuador: "EC", venezuela: "VE",
  "south america": "__LATAM", "central america": "__LATAM", "costa rica": "CR", guatemala: "GT", honduras: "HN", "el salvador": "SV", nicaragua: "NI", "dominican republic": "DO", cuba: "CU", jamaica: "JM", "trinidad and tobago": "TT", bahamas: "BS",
  emea: "__EMEA", europe: "__EU", "european union": "__EU", eu: "__EU", apac: "__APAC", asia: "__APAC", "asia pacific": "__APAC", "asia-pacific": "__APAC", anz: "__ANZ", latam: "__LATAM", "latin america": "__LATAM",
  "middle east": "__MEA", mea: "__MEA", africa: "__AFRICA", nordics: "__EU", benelux: "__EU", dach: "__EU", "uk&i": "GB", uki: "GB", "uk & ireland": "GB", "uk and ireland": "GB",
};

const CITY_NAMES: Record<string, string> = {
  // Canada
  toronto: "CA", vancouver: "CA", montreal: "CA", montréal: "CA", ottawa: "CA", calgary: "CA", edmonton: "CA", waterloo: "CA", kitchener: "CA", mississauga: "CA", quebec: "CA", québec: "CA", "quebec city": "CA", winnipeg: "CA", halifax: "CA", "british columbia": "CA", alberta: "CA", saskatchewan: "CA", manitoba: "CA", "nova scotia": "CA",
  // Mexico, Central & South America
  "mexico city": "MX", "ciudad de mexico": "MX", "ciudad de méxico": "MX", cdmx: "MX", guadalajara: "MX", monterrey: "MX", tijuana: "MX", querétaro: "MX", queretaro: "MX",
  "são paulo": "BR", "sao paulo": "BR", "rio de janeiro": "BR", "belo horizonte": "BR", curitiba: "BR", florianópolis: "BR", florianopolis: "BR", "porto alegre": "BR", campinas: "BR", recife: "BR", brasília: "BR", brasilia: "BR",
  "buenos aires": "AR", córdoba: "AR", santiago: "CL", bogotá: "CO", bogota: "CO", medellín: "CO", medellin: "CO", lima: "PE", montevideo: "UY", quito: "EC", caracas: "VE", "san salvador": "SV",
  // British Isles & Western Europe
  london: "GB", manchester: "GB", birmingham: "GB", edinburgh: "GB", glasgow: "GB", leeds: "GB", bristol: "GB", cambridge: "GB", oxford: "GB", belfast: "GB", cardiff: "GB", reading: "GB",
  dublin: "IE", cork: "IE", galway: "IE", paris: "FR", lyon: "FR", marseille: "FR", toulouse: "FR", nantes: "FR", bordeaux: "FR", lille: "FR", nice: "FR", grenoble: "FR", "sophia antipolis": "FR",
  berlin: "DE", munich: "DE", münchen: "DE", hamburg: "DE", frankfurt: "DE", cologne: "DE", köln: "DE", düsseldorf: "DE", dusseldorf: "DE", stuttgart: "DE", leipzig: "DE", karlsruhe: "DE", heidelberg: "DE", nuremberg: "DE", dresden: "DE",
  madrid: "ES", barcelona: "ES", málaga: "ES", malaga: "ES", seville: "ES", sevilla: "ES", bilbao: "ES", lisbon: "PT", lisboa: "PT", porto: "PT", braga: "PT",
  milan: "IT", milano: "IT", rome: "IT", roma: "IT", turin: "IT", torino: "IT", bologna: "IT", florence: "IT", naples: "IT", amsterdam: "NL", rotterdam: "NL", utrecht: "NL", eindhoven: "NL", "the hague": "NL",
  brussels: "BE", antwerp: "BE", ghent: "BE", zurich: "CH", zürich: "CH", geneva: "CH", basel: "CH", bern: "CH", lausanne: "CH", zug: "CH", vienna: "AT", wien: "AT", graz: "AT",
  // Nordics, Central & Eastern Europe
  copenhagen: "DK", aarhus: "DK", stockholm: "SE", gothenburg: "SE", göteborg: "SE", malmö: "SE", malmo: "SE", oslo: "NO", helsinki: "FI", espoo: "FI", tampere: "FI", reykjavik: "IS",
  warsaw: "PL", warszawa: "PL", krakow: "PL", kraków: "PL", cracow: "PL", wroclaw: "PL", wrocław: "PL", gdansk: "PL", gdańsk: "PL", poznan: "PL", poznań: "PL", lodz: "PL", łódź: "PL", katowice: "PL",
  prague: "CZ", praha: "CZ", brno: "CZ", bratislava: "SK", budapest: "HU", bucharest: "RO", bucuresti: "RO", "cluj-napoca": "RO", cluj: "RO", iasi: "RO", timisoara: "RO", sofia: "BG", athens: "GR", thessaloniki: "GR",
  nicosia: "CY", limassol: "CY", zagreb: "HR", belgrade: "RS", "novi sad": "RS", ljubljana: "SI", kyiv: "UA", kiev: "UA", lviv: "UA", kharkiv: "UA", minsk: "BY", tallinn: "EE", riga: "LV", vilnius: "LT", chisinau: "MD",
  istanbul: "TR", ankara: "TR", izmir: "TR", moscow: "RU", "st. petersburg": "RU", "saint petersburg": "RU", tbilisi: "GE", yerevan: "AM", baku: "AZ", almaty: "KZ", tashkent: "UZ",
  // Middle East & Africa
  "tel aviv": "IL", "tel-aviv": "IL", jerusalem: "IL", haifa: "IL", herzliya: "IL", dubai: "AE", "abu dhabi": "AE", riyadh: "SA", jeddah: "SA", doha: "QA", "kuwait city": "KW", manama: "BH", muscat: "OM", amman: "JO", cairo: "EG",
  "cape town": "ZA", johannesburg: "ZA", pretoria: "ZA", durban: "ZA", lagos: "NG", abuja: "NG", nairobi: "KE", accra: "GH", casablanca: "MA", tunis: "TN", "addis ababa": "ET", kigali: "RW", kampala: "UG",
  // South & East Asia
  bangalore: "IN", bengaluru: "IN", hyderabad: "IN", pune: "IN", mumbai: "IN", chennai: "IN", "new delhi": "IN", delhi: "IN", gurgaon: "IN", gurugram: "IN", noida: "IN", kolkata: "IN", ahmedabad: "IN", jaipur: "IN", kochi: "IN", chandigarh: "IN", indore: "IN", "navi mumbai": "IN", thiruvananthapuram: "IN", coimbatore: "IN",
  karachi: "PK", lahore: "PK", islamabad: "PK", dhaka: "BD", colombo: "LK", kathmandu: "NP",
  beijing: "CN", shanghai: "CN", shenzhen: "CN", hangzhou: "CN", guangzhou: "CN", chengdu: "CN", nanjing: "CN", wuhan: "CN", suzhou: "CN", "hong kong": "HK", taipei: "TW", "taipei city": "TW", hsinchu: "TW", taichung: "TW",
  tokyo: "JP", osaka: "JP", kyoto: "JP", fukuoka: "JP", nagoya: "JP", yokohama: "JP", seoul: "KR", busan: "KR", pangyo: "KR", "kuala lumpur": "MY", penang: "MY", jakarta: "ID", bali: "ID", bangkok: "TH", "ho chi minh": "VN", "ho chi minh city": "VN", hanoi: "VN", saigon: "VN",
  manila: "PH", "metro manila": "PH", makati: "PH", taguig: "PH", cebu: "PH", "phnom penh": "KH", ulaanbaatar: "MN",
  // Oceania
  sydney: "AU", melbourne: "AU", brisbane: "AU", perth: "AU", adelaide: "AU", canberra: "AU", "new south wales": "AU", queensland: "AU", auckland: "NZ", wellington: "NZ", christchurch: "NZ",
};

/** Fold diacritics and lower-case so "São Paulo" and "Sao Paulo" match the same entry. */
export function foldPlace(s: string): string { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

const NEGATIVE_LOOKBEHIND: Record<string, string> = { mexico: "(?<!new )", england: "(?<!new )", wales: "(?<!new south )" };
function alternation(names: string[]): string {
  return [...new Set(names.map(foldPlace))].sort((a, b) => b.length - a.length).map((n) => `${NEGATIVE_LOOKBEHIND[n] ?? ""}${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).join("|");
}
const boundary = (alt: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, "giu");
const COUNTRY_RX = boundary(alternation(Object.keys(COUNTRY_NAMES)));
const CITY_RX = boundary(alternation(Object.keys(CITY_NAMES)));
const FOLDED_COUNTRIES = new Map(Object.entries(COUNTRY_NAMES).map(([k, v]) => [foldPlace(k), v]));
const FOLDED_CITIES = new Map(Object.entries(CITY_NAMES).map(([k, v]) => [foldPlace(k), v]));

/** Countries named explicitly in a location string (ISO codes; regions as "__EMEA" etc.). */
export function countriesNamed(raw: string): string[] {
  const folded = foldPlace(raw);
  return [...new Set([...folded.matchAll(COUNTRY_RX)].map((m) => FOLDED_COUNTRIES.get(m[0])!).filter(Boolean))];
}
/** Countries implied by non-US city names in a location string. */
export function cityCountries(raw: string): string[] {
  const folded = foldPlace(raw);
  return [...new Set([...folded.matchAll(CITY_RX)].map((m) => FOLDED_CITIES.get(m[0])!).filter(Boolean))];
}

export const NON_US_PLACES: ReadonlyArray<string> = Object.freeze([...Object.keys(COUNTRY_NAMES).filter((k) => COUNTRY_NAMES[k] !== "US"), ...Object.keys(CITY_NAMES)]);
