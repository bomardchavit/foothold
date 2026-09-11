// Deterministic synthetic job dataset for development. Companies and postings are fictional (apply URLs use example.com).
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/seed");
mkdirSync(out, { recursive: true });

let seed = 42;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr, n = 1) => { const a = [...arr]; const r = []; while (r.length < n && a.length) r.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return n === 1 ? r[0] : r; };
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const COMPANIES = [
  ["Northwind Labs", "northwindlabs.example.com", "Software / SaaS", "MEDIUM", "San Francisco, CA", "developer tools for API observability"],
  ["Lumen Health", "lumenhealth.example.com", "Healthcare", "LARGE", "Boston, MA", "a care-coordination platform used by 400 hospitals"],
  ["Kestrel Robotics", "kestrelrobotics.example.com", "Automotive", "MEDIUM", "Pittsburgh, PA", "autonomy software for warehouse robots"],
  ["Harborline Logistics", "harborline.example.com", "Logistics / Supply Chain", "LARGE", "Chicago, IL", "freight matching and fleet software"],
  ["Fernweh", "fernweh.example.com", "Travel / Hospitality", "SMALL", "New York, NY", "a group-travel booking marketplace"],
  ["Quillstack", "quillstack.example.com", "Software / SaaS", "STARTUP", "Remote", "collaborative documentation software"],
  ["Meridian Financial", "meridianfin.example.com", "Finance / Banking", "ENTERPRISE", "New York, NY", "a wealth-management and brokerage firm"],
  ["Basalt Security", "basaltsec.example.com", "Cybersecurity", "MEDIUM", "Austin, TX", "cloud security posture management"],
  ["Tidewater Energy", "tidewaterenergy.example.com", "Energy / Climate", "LARGE", "Houston, TX", "grid-scale battery analytics"],
  ["Orchard Learning", "orchardlearning.example.com", "Education", "SMALL", "Denver, CO", "an adaptive math tutoring app for K-12"],
  ["Sable Payments", "sablepay.example.com", "Fintech", "MEDIUM", "San Francisco, CA", "payment infrastructure for marketplaces"],
  ["Copperleaf Insurance", "copperleaf.example.com", "Insurance", "LARGE", "Hartford, CT", "usage-based auto insurance"],
  ["Brightwater Analytics", "brightwater.example.com", "AI / Machine Learning", "STARTUP", "Seattle, WA", "forecasting models for retailers"],
  ["Pinecrest Games", "pinecrestgames.example.com", "Gaming", "MEDIUM", "Los Angeles, CA", "a live-service mobile game studio"],
  ["Silverthread Media", "silverthread.example.com", "Media / Entertainment", "LARGE", "New York, NY", "a streaming service for documentaries"],
  ["Cobalt Semiconductor", "cobaltsemi.example.com", "Hardware / Semiconductors", "ENTERPRISE", "San Jose, CA", "edge-AI accelerator chips"],
  ["Greenfield Grocers", "greenfield.example.com", "Retail", "ENTERPRISE", "Minneapolis, MN", "a regional grocery chain with 300 stores"],
  ["Atlas Civic", "atlascivic.example.com", "Government", "MEDIUM", "Washington, DC", "software for city permitting offices"],
  ["Hollowell Biosciences", "hollowellbio.example.com", "Biotech / Pharma", "MEDIUM", "Cambridge, MA", "computational drug discovery"],
  ["Redwood Ledger", "redwoodledger.example.com", "Crypto / Web3", "SMALL", "Remote", "custody infrastructure for digital assets"],
  ["Summit Consulting Group", "summitcg.example.com", "Consulting", "LARGE", "Chicago, IL", "a management consultancy"],
  ["Beacon Nonprofit Alliance", "beaconalliance.example.org", "Nonprofit", "SMALL", "Oakland, CA", "a nonprofit building tools for food banks"],
  ["Verdant Realty Tech", "verdantrealty.example.com", "Real Estate", "MEDIUM", "Miami, FL", "property-management software"],
  ["Ironclad Aerospace", "ironcladaero.example.com", "Aerospace / Defense", "LARGE", "Denver, CO", "satellite ground software"],
  ["Marlow Legal", "marlowlegal.example.com", "Legal", "SMALL", "New York, NY", "contract-review automation"],
  ["Saffron Ads", "saffronads.example.com", "Marketing / Advertising", "MEDIUM", "Chicago, IL", "a retail media ad platform"],
  ["Dunmore Manufacturing", "dunmore.example.com", "Manufacturing", "ENTERPRISE", "Detroit, MI", "industrial IoT for factories"],
  ["Skylark Telecom", "skylarktel.example.com", "Telecommunications", "ENTERPRISE", "Dallas, TX", "a 5G network operator"],
  ["Wren Consumer", "wren.example.com", "Consumer", "MEDIUM", "Remote", "a personal finance app with 3M users"],
  ["Oakhaven Enterprise", "oakhaven.example.com", "Enterprise", "LARGE", "Atlanta, GA", "HR software for mid-market companies"],
  ["Cinder Cloud", "cindercloud.example.com", "Software / SaaS", "MEDIUM", "Seattle, WA", "a serverless hosting platform"],
  ["Nimbus Data", "nimbusdata.example.com", "AI / Machine Learning", "SMALL", "San Francisco, CA", "a vector database company"],
  ["Petrel Mobility", "petrel.example.com", "Automotive", "MEDIUM", "Austin, TX", "EV charging network software"],
  ["Larkspur Health", "larkspur.example.com", "Healthcare", "STARTUP", "Remote", "virtual physical-therapy"],
  ["Granite Bank", "granitebank.example.com", "Finance / Banking", "ENTERPRISE", "Charlotte, NC", "a regional bank"],
  ["Tessellate Design", "tessellate.example.com", "Software / SaaS", "SMALL", "Portland, OR", "a design-system tooling startup"],
  ["Halcyon Travel", "halcyon.example.com", "Travel / Hospitality", "MEDIUM", "Remote", "corporate travel management"],
  ["Foxglove Education", "foxglove.example.com", "Education", "MEDIUM", "Salt Lake City, UT", "a university LMS"],
  ["Riverbend Security", "riverbendsec.example.com", "Cybersecurity", "STARTUP", "Remote", "identity threat detection"],
  ["Anchorline Ecommerce", "anchorline.example.com", "E-commerce", "LARGE", "Seattle, WA", "a marketplace for outdoor gear"],
];
// staffing agencies used for the duplicate-across-companies scenario (no domain)
const AGENCIES = [["TalentBridge Staffing", null], ["QuickHire Partners", null], ["Apex Recruiting Co", null]];

const ROLES = [
  { title: "Software Engineer, Backend", sen: "MID", years: [2, 5], sal: [140, 190], req: ["Python", "Go", "Java", "PostgreSQL", "REST APIs", "Docker", "Kubernetes", "AWS", "Distributed Systems", "gRPC", "Redis", "Kafka"], pref: ["Terraform", "GraphQL", "Observability", "Rust", "TypeScript"], fam: "swe" },
  { title: "Senior Software Engineer, Backend", sen: "SENIOR", years: [5, 9], sal: [185, 250], req: ["Python", "Go", "Java", "PostgreSQL", "Distributed Systems", "Microservices", "AWS", "Kubernetes", "System Design", "Kafka"], pref: ["Rust", "Terraform", "Observability", "gRPC"], fam: "swe" },
  { title: "Software Engineer, Frontend", sen: "MID", years: [2, 5], sal: [135, 185], req: ["React", "TypeScript", "JavaScript", "CSS", "HTML", "Next.js", "Unit Testing", "REST APIs", "Accessibility"], pref: ["GraphQL", "Tailwind CSS", "Storybook", "Playwright", "Design Systems"], fam: "swe" },
  { title: "Senior Frontend Engineer", sen: "SENIOR", years: [5, 8], sal: [180, 240], req: ["React", "TypeScript", "Next.js", "Performance Optimization", "Design Systems", "Accessibility", "Unit Testing", "CSS"], pref: ["GraphQL", "Node.js", "Playwright", "WebAssembly"], fam: "swe" },
  { title: "Full-Stack Engineer", sen: "MID", years: [3, 6], sal: [145, 195], req: ["TypeScript", "React", "Node.js", "PostgreSQL", "REST APIs", "AWS", "Docker", "Next.js"], pref: ["Prisma", "GraphQL", "Redis", "CI/CD", "Tailwind CSS"], fam: "swe" },
  { title: "Staff Software Engineer", sen: "STAFF", years: [8, 14], sal: [230, 320], req: ["System Design", "Distributed Systems", "Technical Leadership", "Microservices", "Kubernetes", "AWS", "Go", "Java", "Software Architecture"], pref: ["Rust", "Kafka", "SRE", "Mentoring"], fam: "swe" },
  { title: "Software Engineer, New Grad", sen: "ENTRY", years: [0, 1], sal: [110, 145], req: ["Python", "Java", "JavaScript", "Algorithms", "Data Structures", "Git", "SQL"], pref: ["React", "AWS", "Docker", "TypeScript"], fam: "swe" },
  { title: "Software Engineering Intern", sen: "INTERN", years: [0, 0], sal: [40, 55], hourly: true, req: ["Python", "Java", "JavaScript", "Git", "Algorithms"], pref: ["React", "SQL", "Docker"], fam: "swe" },
  { title: "Data Scientist", sen: "MID", years: [2, 5], sal: [140, 190], req: ["Python", "SQL", "Statistics", "Machine Learning", "A/B Testing", "Pandas", "scikit-learn", "Data Visualization"], pref: ["PyTorch", "Airflow", "Snowflake", "Tableau", "Causal Inference"], fam: "data" },
  { title: "Senior Data Scientist", sen: "SENIOR", years: [5, 9], sal: [185, 245], req: ["Python", "SQL", "Machine Learning", "Statistics", "A/B Testing", "Experiment Design", "Feature Engineering", "Communication"], pref: ["PyTorch", "Spark", "Databricks", "MLOps"], fam: "data" },
  { title: "Data Analyst", sen: "ENTRY", years: [1, 3], sal: [85, 120], req: ["SQL", "Excel", "Tableau", "Data Visualization", "Data Analysis", "Python"], pref: ["dbt", "Looker", "Power BI", "Statistics", "Snowflake"], fam: "data" },
  { title: "Data Engineer", sen: "MID", years: [3, 6], sal: [150, 200], req: ["Python", "SQL", "Apache Spark", "Airflow", "Data Engineering", "AWS", "Kafka", "dbt", "Data Modeling"], pref: ["Snowflake", "Databricks", "Terraform", "Scala", "Kubernetes"], fam: "data" },
  { title: "Analytics Engineer", sen: "MID", years: [2, 5], sal: [130, 175], req: ["SQL", "dbt", "Data Modeling", "Snowflake", "Python", "Looker", "Data Warehousing"], pref: ["Airflow", "BigQuery", "Tableau", "Git"], fam: "data" },
  { title: "Machine Learning Engineer", sen: "MID", years: [3, 6], sal: [165, 225], req: ["Python", "PyTorch", "Machine Learning", "MLOps", "Docker", "Kubernetes", "AWS", "Feature Engineering", "SQL"], pref: ["LLMs", "RAG", "Vector Databases", "Spark", "SageMaker"], fam: "data" },
  { title: "Senior ML Engineer, LLM Platform", sen: "SENIOR", years: [5, 10], sal: [210, 290], req: ["Python", "PyTorch", "LLMs", "RAG", "Vector Databases", "Distributed Systems", "Kubernetes", "MLOps"], pref: ["CUDA", "Rust", "Go", "Hugging Face", "LangChain"], fam: "data" },
  { title: "Product Manager", sen: "MID", years: [3, 6], sal: [150, 200], req: ["Product Management", "Roadmapping", "User Research", "SQL", "Product Analytics", "Stakeholder Management", "Agile", "PRDs"], pref: ["A/B Testing", "Figma", "Go-to-Market", "Mixpanel", "Amplitude"], fam: "pm" },
  { title: "Associate Product Manager", sen: "ENTRY", years: [0, 2], sal: [105, 140], req: ["Product Management", "User Stories", "Data Analysis", "SQL", "Communication", "Customer Discovery", "Agile"], pref: ["Figma", "Product Analytics", "A/B Testing", "Jira"], fam: "pm" },
  { title: "Senior Product Manager, Growth", sen: "SENIOR", years: [6, 10], sal: [190, 250], req: ["Product Management", "Growth", "A/B Testing", "Product Analytics", "SQL", "Roadmapping", "Go-to-Market", "Stakeholder Management"], pref: ["Amplitude", "Mixpanel", "Pricing Strategy", "Machine Learning"], fam: "pm" },
  { title: "Technical Program Manager", sen: "SENIOR", years: [5, 9], sal: [170, 225], req: ["Program Management", "Stakeholder Management", "Agile", "Jira", "Roadmapping", "Communication", "Software Architecture"], pref: ["AWS", "SQL", "OKRs", "Risk Assessment"], fam: "pm" },
  { title: "Product Designer", sen: "MID", years: [3, 6], sal: [135, 180], req: ["Figma", "UX Design", "UI Design", "Prototyping", "User Research", "Design Systems", "Accessibility"], pref: ["Motion Design", "HTML", "CSS", "Usability Testing"], fam: "design" },
  { title: "Senior Product Designer", sen: "SENIOR", years: [6, 10], sal: [175, 230], req: ["Figma", "UX Design", "Design Systems", "User Research", "Interaction Design", "Prototyping", "Stakeholder Management"], pref: ["Motion Design", "Accessibility", "Usability Testing", "Front-end"], fam: "design" },
  { title: "UX Researcher", sen: "MID", years: [3, 6], sal: [130, 175], req: ["User Research", "Usability Testing", "Statistics", "Customer Discovery", "Communication", "Data Analysis"], pref: ["SQL", "Figma", "A/B Testing", "Survey Design"], fam: "design" },
  { title: "DevOps Engineer", sen: "MID", years: [3, 6], sal: [145, 195], req: ["Kubernetes", "Terraform", "AWS", "CI/CD", "Docker", "Linux", "Bash", "Observability", "GitHub Actions"], pref: ["Go", "Python", "Helm", "ArgoCD", "Datadog"], fam: "infra" },
  { title: "Site Reliability Engineer", sen: "SENIOR", years: [5, 9], sal: [180, 240], req: ["SRE", "Kubernetes", "Observability", "Incident Response", "Linux", "Terraform", "Go", "Python", "Prometheus"], pref: ["Grafana", "Kafka", "AWS", "Networking", "Chaos Engineering"], fam: "infra" },
  { title: "Security Engineer", sen: "MID", years: [3, 7], sal: [160, 215], req: ["Cybersecurity", "Cloud Security", "AWS", "Python", "Threat Modeling", "IAM", "Incident Response", "Penetration Testing"], pref: ["Kubernetes", "Terraform", "SIEM", "Regulatory Compliance", "Go"], fam: "infra" },
  { title: "iOS Engineer", sen: "MID", years: [3, 6], sal: [150, 200], req: ["Swift", "SwiftUI", "iOS", "UIKit", "REST APIs", "Unit Testing", "Git"], pref: ["Kotlin", "GraphQL", "CI/CD", "Accessibility"], fam: "mobile" },
  { title: "Android Engineer", sen: "MID", years: [3, 6], sal: [150, 200], req: ["Kotlin", "Android", "Jetpack Compose", "REST APIs", "Unit Testing", "Git"], pref: ["Swift", "GraphQL", "CI/CD", "Firebase"], fam: "mobile" },
  { title: "QA Automation Engineer", sen: "MID", years: [2, 5], sal: [110, 150], req: ["Test Automation", "Playwright", "Selenium", "TypeScript", "CI/CD", "REST APIs", "End-to-End Testing"], pref: ["Python", "Load Testing", "Docker", "Cypress"], fam: "swe" },
  { title: "Solutions Engineer", sen: "MID", years: [3, 6], sal: [130, 180], req: ["REST APIs", "JavaScript", "Python", "Communication", "SQL", "Customer Success", "Presentation Skills"], pref: ["AWS", "Salesforce", "Sales", "Technical Writing"], fam: "gtm" },
  { title: "Engineering Manager", sen: "MANAGER", years: [7, 12], sal: [210, 290], req: ["Engineering Management", "Leadership", "Mentoring", "Agile", "System Design", "Stakeholder Management", "Recruiting", "Technical Leadership"], pref: ["Python", "Go", "AWS", "OKRs"], fam: "swe" },
  { title: "Growth Marketing Manager", sen: "MID", years: [3, 6], sal: [110, 150], req: ["Digital Marketing", "A/B Testing", "Google Analytics", "SEO", "Email Marketing", "Product Analytics", "Copywriting"], pref: ["SQL", "HubSpot", "Paid Media", "Content Marketing"], fam: "gtm" },
  { title: "Customer Success Manager", sen: "MID", years: [2, 5], sal: [85, 120], req: ["Customer Success", "Communication", "Stakeholder Management", "Salesforce", "Presentation Skills", "Negotiation"], pref: ["SQL", "SaaS", "Zendesk", "HubSpot"], fam: "gtm" },
  { title: "Business Analyst", sen: "ENTRY", years: [1, 3], sal: [80, 110], req: ["Business Analysis", "SQL", "Excel", "Requirements Gathering", "Data Analysis", "Communication", "Process Mapping"], pref: ["Tableau", "Jira", "Python", "Agile"], fam: "gtm" },
  { title: "Financial Analyst", sen: "ENTRY", years: [1, 3], sal: [85, 115], req: ["Financial Analysis", "Financial Modeling", "Excel", "Budgeting", "Accounting", "Data Analysis"], pref: ["SQL", "Tableau", "Python", "SAP"], fam: "gtm" },
  { title: "Research Scientist, Computer Vision", sen: "SENIOR", years: [4, 8], sal: [190, 260], req: ["Computer Vision", "Deep Learning", "PyTorch", "Python", "Machine Learning", "Statistics", "C++"], pref: ["CUDA", "Robotics", "Publications", "Reinforcement Learning"], fam: "data" },
  { title: "Platform Engineer", sen: "MID", years: [3, 6], sal: [150, 205], req: ["Kubernetes", "Go", "Terraform", "AWS", "CI/CD", "Docker", "Observability", "Linux"], pref: ["Rust", "Python", "Helm", "Networking", "SRE"], fam: "infra" },
];

const REMOTE_POLICY = ["Remote (US)", "Hybrid", "On-site", "Remote", "Hybrid"];
const BENEFITS = ["Medical, dental and vision coverage", "401(k) with 4% match", "Flexible PTO", "Learning stipend of $1,500 per year", "Equity", "Parental leave", "Home-office stipend", "Commuter benefits"];
const VERBS = ["Design and ship", "Own", "Build", "Improve", "Partner with product and design to deliver", "Lead", "Scale", "Maintain and evolve"];
const THINGS = { swe: ["core services", "our public API", "the web application", "internal developer tooling", "the billing system", "the search experience", "our real-time event pipeline"], data: ["forecasting models", "experimentation infrastructure", "our metrics layer", "dashboards used by leadership", "the feature store", "customer-facing ML features"], pm: ["the onboarding funnel", "our self-serve product", "the enterprise admin experience", "pricing and packaging", "the mobile roadmap"], design: ["the design system", "core product flows", "the mobile app experience", "our onboarding"], infra: ["our Kubernetes platform", "CI/CD pipelines", "observability tooling", "incident response processes", "infrastructure as code"], mobile: ["the iOS app", "the Android app", "our mobile release process"], gtm: ["customer onboarding", "quarterly business reviews", "the sales pipeline", "reporting for leadership"] };

function makeDescription(company, role, req, pref, years, policy, salary) {
  const [name, , industry, size, hq, blurb] = company;
  const things = THINGS[role.fam];
  const dos = pick(VERBS, 4).map((v, i) => `${v} ${things[(i * 2 + int(0, 1)) % things.length]}.`);
  const reqLines = [
    role.years[0] > 0 ? `${years[0]}+ years of ${role.fam === "swe" || role.fam === "infra" || role.fam === "mobile" ? "professional software engineering" : role.fam === "data" ? "hands-on data" : "relevant professional"} experience${years[1] ? ` (${years[0]}-${years[1]} years ideal)` : ""}.` : role.sen === "INTERN" ? "Currently pursuing a degree in Computer Science or a related field." : "0-2 years of experience; new graduates welcome.",
    ...req.slice(0, 3).map((s) => `Strong experience with ${s}.`),
    `Working knowledge of ${req.slice(3).join(", ")}.`,
    "Clear written and verbal communication; comfortable working with cross-functional partners.",
  ];
  const niceLines = pref.map((s) => `Experience with ${s}.`);
  const salaryLine = role.hourly ? `Pay: $${salary[0]} - $${salary[1]} per hour.` : `The base salary range for this role is $${salary[0].toLocaleString()} - $${salary[1].toLocaleString()} per year, depending on experience and location, plus equity and benefits.`;
  return [
    `About ${name}`,
    `${name} builds ${blurb}. We are a ${size.toLowerCase()} ${industry.toLowerCase()} company headquartered in ${hq}. ${policy.startsWith("Remote") ? "This role is fully remote within the United States." : policy === "Hybrid" ? `This role is hybrid, with three days a week in our ${hq} office.` : `This role is on-site in ${hq}.`}`,
    "",
    "The role",
    `We are hiring a ${role.title} to join our ${role.fam === "pm" ? "product" : role.fam === "design" ? "design" : role.fam === "gtm" ? "go-to-market" : "engineering"} team. You will work closely with a small, senior team and have real ownership from day one.`,
    "",
    "What you'll do",
    ...dos.map((d) => `• ${d}`),
    "• Participate in design reviews, code or content reviews, and planning.",
    "",
    "What we're looking for",
    ...reqLines.map((l) => `• ${l}`),
    "",
    "Nice to have",
    ...niceLines.map((l) => `• ${l}`),
    "",
    "Compensation and benefits",
    salaryLine,
    ...pick(BENEFITS, 4).map((b) => `• ${b}`),
    "",
    `${name} is an equal opportunity employer. We welcome applicants of every background.`,
  ].join("\n");
}

const jobs = [];
let idCounter = 1000;
const now = Date.now();
for (const company of COMPANIES) {
  const roles = pick(ROLES, int(6, 9));
  for (const role of roles) {
    const req = pick(role.req, Math.min(role.req.length, int(5, 8)));
    const pref = pick(role.pref, Math.min(role.pref.length, int(2, 4)));
    const years = [role.years[0], role.years[1] && rand() < 0.5 ? role.years[1] : null];
    const policy = company[4] === "Remote" ? "Remote" : pick(REMOTE_POLICY);
    const salary = role.hourly ? [role.sal[0], role.sal[1]] : [role.sal[0] * 1000 + int(0, 9) * 1000, role.sal[1] * 1000 + int(0, 9) * 1000];
    const ageDays = rand() < 0.08 ? int(61, 120) : int(0, 45);
    const id = String(idCounter++);
    const location = policy.startsWith("Remote") ? (rand() < 0.5 ? "Remote (US)" : `Remote - ${company[4]}`) : company[4];
    jobs.push({
      externalId: id, title: role.title, company: company[0], companyDomain: company[1], companyIndustry: company[2], companySize: company[3],
      description: makeDescription(company, role, req, pref, years, policy, salary),
      location, isRemote: policy.startsWith("Remote"), applyUrl: `https://jobs.example.com/${company[1].split(".")[0]}/${id}`,
      postedAt: new Date(now - ageDays * 86400_000).toISOString(),
      salaryMin: salary[0], salaryMax: salary[1], salaryCurrency: "USD", salaryPeriod: role.hourly ? "hour" : "year",
    });
  }
}
// duplicate cluster: one posting reposted by three agencies (no company domain)
const dupRole = ROLES[0];
const dupDesc = makeDescription(["Confidential Client", "", "Software / SaaS", "LARGE", "Dallas, TX", "enterprise software"], dupRole, dupRole.req.slice(0, 6), dupRole.pref.slice(0, 3), [3, null], "Hybrid", [140000, 180000]);
for (const [agency] of AGENCIES) {
  const id = String(idCounter++);
  jobs.push({ externalId: id, title: dupRole.title, company: agency, companyDomain: null, companyIndustry: "Consulting", description: dupDesc, location: "Dallas, TX", isRemote: false, applyUrl: `https://jobs.example.com/agency/${id}`, postedAt: new Date(now - int(1, 10) * 86400_000).toISOString(), salaryMin: 140000, salaryMax: 180000, salaryCurrency: "USD", salaryPeriod: "year" });
}
// scam-pattern postings
const scams = [
  ["Data Entry Clerk - Work From Home", "Earn $500 per day from home! No experience necessary, work from home and be your own boss. Contact us on WhatsApp to get started today. A small registration fee applies. Guaranteed income for everyone who joins."],
  ["Remote Package Handler", "We are hiring immediately! No interview needed. You will receive packages at home and reship them. Send a copy of your ID and your bank details to get paid weekly via wire. Unlimited earning potential."],
  ["Crypto Trading Assistant", "Join our cryptocurrency trading program and earn guaranteed returns of 20% weekly. No experience required. Message us on Telegram. Be your own boss and work 2 hours a day and earn $3,000 a week."],
];
for (const [title, description] of scams) {
  const id = String(idCounter++);
  jobs.push({ externalId: id, title, company: pick(["Global Opportunities LLC", "WorkFast Solutions", "PrimeEarn Group"]), companyDomain: null, description, location: "Remote", isRemote: true, applyUrl: `https://jobs.example.com/x/${id}`, postedAt: new Date(now - int(0, 5) * 86400_000).toISOString(), salaryMin: 20000, salaryMax: 250000, salaryCurrency: "USD", salaryPeriod: "year" });
}

writeFileSync(path.join(out, "jobs.json"), JSON.stringify(jobs, null, 1));
console.log(`wrote ${jobs.length} jobs`);

// ---- H-1B employer data hub sample (fictional seed companies + a few real large employers, illustrative counts)
const rows = [["Fiscal Year", "Employer (Petitioner) Name", "Tax ID", "Industry (NAICS) Code", "Petitioner City", "Petitioner State", "Petitioner Zip Code", "Initial Approval", "Initial Denial", "Continuing Approval", "Continuing Denial"]];
const legal = (name) => name.toUpperCase() + pick([" INC", " LLC", " CORP", " INC.", ""]);
for (const [name, , , , hq] of COMPANIES) {
  if (rand() < 0.35) continue; // ~65% of seed companies sponsor
  const ln = legal(name);
  const [city, state] = hq.includes(",") ? hq.split(", ") : ["Remote", "CA"];
  for (const fy of [2024, 2025, 2026]) if (rand() < 0.85) rows.push([fy, ln, "", "54 (PROFESSIONAL, SCIENTIFIC, AND TECHNICAL SERVICES)", city.toUpperCase(), state, "", int(1, 40), int(0, 3), int(2, 80), int(0, 5)]);
}
const REAL = [["GOOGLE LLC", "MOUNTAIN VIEW", "CA", 1200, 3000], ["MICROSOFT CORPORATION", "REDMOND", "WA", 1000, 2500], ["AMAZON.COM SERVICES LLC", "SEATTLE", "WA", 2500, 4000], ["META PLATFORMS INC", "MENLO PARK", "CA", 900, 2000], ["APPLE INC", "CUPERTINO", "CA", 700, 1500], ["STRIPE INC", "SOUTH SAN FRANCISCO", "CA", 120, 300], ["FIGMA INC", "SAN FRANCISCO", "CA", 40, 90], ["DATADOG INC", "NEW YORK", "NY", 60, 150], ["CLOUDFLARE INC", "SAN FRANCISCO", "CA", 50, 120], ["AIRBNB INC", "SAN FRANCISCO", "CA", 90, 250], ["DOORDASH INC", "SAN FRANCISCO", "CA", 150, 400], ["SNOWFLAKE INC", "BOZEMAN", "MT", 100, 300], ["DATABRICKS INC", "SAN FRANCISCO", "CA", 150, 350], ["NVIDIA CORPORATION", "SANTA CLARA", "CA", 500, 1200], ["SALESFORCE INC", "SAN FRANCISCO", "CA", 300, 900], ["ORACLE AMERICA INC", "AUSTIN", "TX", 400, 1200], ["INTEL CORPORATION", "SANTA CLARA", "CA", 300, 900], ["NETFLIX INC", "LOS GATOS", "CA", 80, 200], ["UBER TECHNOLOGIES INC", "SAN FRANCISCO", "CA", 200, 600], ["LYFT INC", "SAN FRANCISCO", "CA", 50, 150], ["ROBLOX CORPORATION", "SAN MATEO", "CA", 30, 90], ["COINBASE INC", "REMOTE", "CA", 40, 120], ["PLAID INC", "SAN FRANCISCO", "CA", 20, 60], ["NOTION LABS INC", "SAN FRANCISCO", "CA", 15, 40], ["RIPPLING PEOPLE CENTER INC", "SAN FRANCISCO", "CA", 25, 70], ["BREX INC", "SAN FRANCISCO", "CA", 20, 50], ["ANDURIL INDUSTRIES INC", "COSTA MESA", "CA", 10, 30], ["SCALE AI INC", "SAN FRANCISCO", "CA", 30, 80], ["VERCEL INC", "SAN FRANCISCO", "CA", 10, 25], ["MONGODB INC", "NEW YORK", "NY", 40, 120]];
for (const [name, city, state, lo, hi] of REAL) for (const fy of [2024, 2025, 2026]) rows.push([fy, name, "", "54 (PROFESSIONAL, SCIENTIFIC, AND TECHNICAL SERVICES)", city, state, "", int(lo, hi), int(0, Math.floor(lo / 10)), int(lo, hi * 2), int(0, Math.floor(lo / 10))]);
writeFileSync(path.join(out, "h1b_sample.csv"), rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");
console.log(`wrote ${rows.length - 1} h1b rows`);
