import type { LeadSourceAdapter, SourcedLead } from "../types";

const FIRST = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Drew", "Priya", "Omar", "Lena", "Noah", "Maya"];
const LAST = ["Patel", "Nguyen", "Garcia", "Smith", "Müller", "Rossi", "Khan", "Okafor", "Tanaka", "Silva", "Brown", "Kowalski", "Haddad", "Ivanova", "Dubois"];
const COMPANIES = ["Northwind Logistics", "Bluepeak Software", "Harbor Health", "Vertex Manufacturing", "Lumen Retail", "Quill Analytics", "Atlas Fintech", "Cedar Legal", "Nimbus Cloud", "Orchid Media", "Granite Construction Co", "Pioneer Energy", "Summit Education", "Meridian Travel", "Birch Foods"];
const COUNTRIES = ["US", "GB", "DE", "NL", "AU", "CA", "FR", "ES"];

const rnd = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Random but plausible leads; emails are made unique with a numeric suffix on collision. */
export const mockLeadSource: LeadSourceAdapter = {
  key: "mock",
  async search({ icp, limit, exclude }) {
    const titles = icp.titles.length ? icp.titles : ["Head of Sales", "VP Marketing", "CEO", "Operations Director"];
    const geos = icp.geographies.length ? icp.geographies : COUNTRIES;
    const out: SourcedLead[] = [];
    const seen = new Set(exclude);
    let attempts = 0;
    while (out.length < limit && attempts < limit * 20) {
      attempts++;
      const first = rnd(FIRST);
      const last = rnd(LAST);
      const company = rnd(COMPANIES);
      const domain = `${slug(company)}.example.com`;
      let email = `${first}.${last}@${domain}`.toLowerCase();
      if (seen.has(email)) email = `${first}.${last}${attempts}@${domain}`.toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({
        email,
        firstName: first,
        lastName: last,
        title: rnd(titles),
        company,
        domain,
        country: rnd(geos),
        linkedinUrl: `https://www.linkedin.com/in/${slug(first + last)}${attempts}`,
        sourceRef: `mock-${Date.now()}-${attempts}`,
      });
    }
    return out;
  },
};
