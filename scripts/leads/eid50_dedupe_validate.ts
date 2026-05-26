/**
 * EID50 Campaign — Lead Deduplication & Validation
 *
 * Usage: deno run --allow-read --allow-write scripts/leads/eid50_dedupe_validate.ts
 *
 * Reads: data/leads/eid50_leads_raw.csv
 * Writes: data/leads/eid50_leads_clean.csv
 */

const RAW_CSV = "data/leads/eid50_leads_raw.csv";
const CLEAN_CSV = "data/leads/eid50_leads_clean.csv";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const EXCLUDED_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "aol.com", "icloud.com", "protonmail.com", "mail.com", "yandex.com",
]);

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

interface Lead {
  company_name: string;
  email: string;
  website: string;
  phone: string;
  city: string;
  source: string;
  source_url: string;
  confidence: string;
  notes: string;
}

function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

function isBusinessEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return !EXCLUDED_DOMAINS.has(domain);
}

async function main() {
  console.log("=".repeat(60));
  console.log("EID50 Lead Deduplication & Validation");
  console.log("=".repeat(60));

  const rawText = await Deno.readTextFile(RAW_CSV);
  const lines = rawText.split("\n").filter((l) => l.trim());

  if (lines.length <= 1) {
    console.log("No leads to process. Raw CSV only has headers.");
    console.log("Collect leads first, then run this script.");
    return;
  }

  const headers = parseCsvLine(lines[0]);

  const leads: Lead[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < headers.length) continue;
    const lead: Lead = {} as Lead;
    headers.forEach((h, idx) => {
      (lead as any)[h] = values[idx] ?? "";
    });
    leads.push(lead);
  }

  console.log(`\nRaw leads: ${leads.length}`);

  // Step 1: Validate email syntax
  const withValidEmail = leads.filter((l) => {
    if (!l.email) return false;
    return validateEmail(l.email);
  });
  const invalidEmail = leads.length - withValidEmail.length;
  console.log(`Invalid/missing email: ${invalidEmail}`);

  // Step 2: Filter business emails only
  const businessEmails = withValidEmail.filter((l) => isBusinessEmail(l.email));
  const personalEmails = withValidEmail.length - businessEmails.length;
  console.log(`Personal email domains excluded: ${personalEmails}`);

  // Step 3: Remove emails without source_url
  const withSource = businessEmails.filter((l) => l.source_url);
  const noSource = businessEmails.length - withSource.length;
  console.log(`Missing source URL: ${noSource}`);

  // Step 4: Deduplicate by email (keep first occurrence)
  const seenEmails = new Set<string>();
  const byEmail: Lead[] = [];
  for (const l of withSource) {
    const key = l.email.toLowerCase().trim();
    if (seenEmails.has(key)) continue;
    seenEmails.add(key);
    byEmail.push(l);
  }
  const dupEmail = withSource.length - byEmail.length;
  console.log(`Duplicate email removed: ${dupEmail}`);

  // Step 5: Deduplicate by domain (if multiple leads share the same domain, keep the one with higher confidence or first)
  const seenDomains = new Set<string>();
  const byDomain: Lead[] = [];
  for (const l of byEmail) {
    const domain = l.email.split("@")[1]?.toLowerCase() ?? "";
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    byDomain.push(l);
  }
  const dupDomain = byEmail.length - byDomain.length;
  console.log(`Duplicate domain removed: ${dupDomain}`);

  // Step 6: Sort by confidence (high > medium > low), then by company name
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  byDomain.sort((a, b) => {
    const ca = confidenceOrder[a.confidence] ?? 99;
    const cb = confidenceOrder[b.confidence] ?? 99;
    if (ca !== cb) return ca - cb;
    return a.company_name.localeCompare(b.company_name);
  });

  // Write clean CSV
  const cleanLines: string[] = [headers.join(",")];
  for (const l of byDomain) {
    cleanLines.push(headers.map((h) => {
      const val = (l as any)[h] ?? "";
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(","));
  }
  cleanLines.push(""); // trailing newline

  await Deno.writeTextFile(CLEAN_CSV, cleanLines.join("\n"));

  console.log(`\nClean leads written: ${byDomain.length}`);

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Raw leads:        ${leads.length}`);
  console.log(`Invalid email:    ${invalidEmail}`);
  console.log(`Personal domain:  ${personalEmails}`);
  console.log(`No source URL:    ${noSource}`);
  console.log(`Dup by email:     ${dupEmail}`);
  console.log(`Dup by domain:    ${dupDomain}`);
  console.log(`Clean output:     ${byDomain.length}`);

  // Source breakdown
  const sourceCounts: Record<string, number> = {};
  for (const l of byDomain) {
    sourceCounts[l.source] = (sourceCounts[l.source] ?? 0) + 1;
  }
  console.log("\nSource breakdown:");
  for (const [src, count] of Object.entries(sourceCounts)) {
    console.log(`  ${src}: ${count}`);
  }
}

if (import.meta.main) {
  main();
}
