import { describe, it, expect } from "vitest";
import { parseLocation } from "@foothold/shared";
import { inScope, countryFromPlaces, mergeLocations } from "@/lib/ingest/normalize";
import { countriesNamed, cityCountries, foldPlace } from "@/lib/ingest/gazetteer";

const ok = (loc: string | null, remote = false) => inScope(parseLocation(loc), remote);

describe("place gazetteer", () => {
  it("names countries, regions and non-US cities with diacritics folded", () => {
    expect(countriesNamed("Lisbon, Portugal (Hybrid)")).toEqual(["PT"]);
    expect(countriesNamed("Remote - EMEA")).toEqual(["__EMEA"]);
    expect(countriesNamed("New York, USA; London, UK")).toEqual(["US", "GB"]);
    expect(cityCountries("São Paulo")).toEqual(["BR"]);
    expect(cityCountries("Zürich or Genève")).toEqual(["CH"]);
    expect(foldPlace("Kraków")).toBe("krakow");
  });
  it("does not mistake US places that contain a country or city word", () => {
    expect(countriesNamed("Albuquerque, New Mexico")).toEqual([]);
    expect(countriesNamed("Boston, New England")).toEqual([]);
    expect(countriesNamed("Jersey City, NJ")).toEqual([]);
    expect(countriesNamed("Columbia, SC")).toEqual([]);
    expect(cityCountries("Londonderry, NH")).toEqual([]);
    expect(countriesNamed("Americas")).toEqual([]);
  });
});

describe("job country scope: the strings that leaked (JOBS_COUNTRIES default US)", () => {
  it.each([
    "Lisbon, Portugal (Hybrid)", "Manila, Philippines", "China", "Seoul, South Korea (Hybrid)", "Remote India (Hybrid)", "Jakarta, Indonesia",
    "Hybrid - Luxembourg", "Beijing, China (Hybrid)", "Remote Australia (Hybrid)", "Remote Spain (Hybrid)", "Bucharest", "Remote Sweden (Hybrid)",
    "Sao Paulo", "Remote India", "Chile (Hybrid)", "Riyadh, Saudi Arabia", "Bangkok, Thailand", "Taipei,Taiwan", "Barcelona", "Remote - Luxembourg",
    "Remote - Cyprus", "Kuala Lumpur, Malaysia (Hybrid)", "Chile, Remote", "Colombia (Hybrid)", "Colombia, Remote", "Madrid", "Remote Mexico (Hybrid)",
    "Bucharest, Romania", "Remote - Abu Dhabi", "Vietnam", "Seoul, Korea", "Remote France", "Auckland", "Taipei, Taiwan", "Copenhagen, Denmark",
    "Luxembourg", "Remote - EMEA", "Taipei City", "Milan", "Remote - UAE", "Bangkok", "Korea", "London, United Kingdom (Hybrid)", "Toronto", "Bengaluru", "Dublin, Ireland",
    "Remote Netherlands (Hybrid)", "London, ON", "Berlin, DE", "Toronto, CA", "Bangalore, IN",
  ])("drops %s", (loc) => { expect(ok(loc)).toBe(false); expect(ok(loc, true)).toBe(false); });

  it.each([
    "San Francisco, CA", "US-ATL, US-CHI", "Remote", "Remote - USA", "Remote (US)", "United States", "Headquarters", "Hybrid", "Distributed", "N/A",
    "Remote - Remote", "San Francisco or Seattle", "Chicago or NYC", "NY or SF", "AMER", "Americas", "New York, NY 10001", "Austin, TX (Hybrid)",
    "Paris, TX", "Cambridge, MA", "Dublin, OH", "London, KY", "Vienna, VA", "Albuquerque, New Mexico", "Jersey City, NJ", "Melbourne, FL",
    "New York, USA; London, UK", "Remote - US or Canada", "Boston, Massachusetts, USA; New York, New York, USA", "San Juan, Puerto Rico",
  ])("keeps %s", (loc) => { expect(ok(loc)).toBe(true); });

  it("keeps remote and unplaceable postings but not remote postings that name a foreign place", () => {
    expect(ok(null)).toBe(true);
    expect(ok("", true)).toBe(true);
    expect(ok("Remote India (Hybrid)", true)).toBe(false);
    expect(countryFromPlaces("Hybrid")).toBeNull();
    expect(countryFromPlaces("Paris, TX")).toEqual(["US"]);
    expect(countryFromPlaces("Toronto, CA")).toEqual(["CA"]);
  });
});

describe("location merge for per-office duplicates", () => {
  it("appends new offices once, ignores restatements of the same city, caps the list", () => {
    expect(mergeLocations("New York, NY", "Denver, CO")).toBe("New York, NY; Denver, CO");
    expect(mergeLocations("New York, NY; Denver, CO", "Denver, CO")).toBe("New York, NY; Denver, CO");
    expect(mergeLocations("New York, NY", "New York, New York, USA")).toBe("New York, NY");
    expect(mergeLocations(null, "Remote - USA")).toBe("Remote - USA");
    expect(mergeLocations("Austin, TX", null)).toBe("Austin, TX");
    const six = ["A1, TX", "B2, TX", "C3, TX", "D4, TX", "E5, TX", "F6, TX"].join("; ");
    expect(mergeLocations(six, "G7, TX")).toBe(six);
  });
});
