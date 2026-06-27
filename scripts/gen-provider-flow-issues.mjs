#!/usr/bin/env node
// Idempotent generator for per-provider "research + encode the flow" issues (#16 §4).
// Reads the published perks.json, takes a CURATED candidate list (NOT all ~207 — that's
// noise), skips slugs that already have a curated flow or an existing `provider-flow`
// issue, and (only with --create) opens one issue per genuinely-new candidate. Re-run it as
// the directory grows: it only ever adds the new ones. Dev tooling — never bundled.
//
//   node scripts/gen-provider-flow-issues.mjs                 # dry-run, default candidates
//   node scripts/gen-provider-flow-issues.mjs a/b c/d         # dry-run, explicit slugs
//   node scripts/gen-provider-flow-issues.mjs --create a/b    # actually file the new ones
//
// Requires: an authenticated `gh` CLI; a prior `npm run build` (reads dist/ for the
// already-curated slugs).

import { execFileSync } from "node:child_process";

const REPO = "MCPAQL/makerperks-adapter";
const LABEL = "provider-flow";
const PERKS_URL = "https://www.makerperks.com/perks.json";

// Edit this list (or pass slugs as args) to choose the next enrichment targets. The three
// spikes (deepgram/…-pricing-startup-credits, anthropic/anthropic-startup-program,
// gcp/google-ai-startup-program) are already curated and will be skipped automatically.
const DEFAULT_CANDIDATES = [];

const args = process.argv.slice(2);
const create = args.includes("--create");
const slugArgs = args.filter((a) => !a.startsWith("--"));
const candidates = slugArgs.length ? slugArgs : DEFAULT_CANDIDATES;

if (!candidates.length) {
  console.log(
    "No candidates. Pass slugs (e.g. `node scripts/gen-provider-flow-issues.mjs vercel/x neon/y`)\n" +
      "or edit DEFAULT_CANDIDATES. The 3 curated spikes are skipped automatically.",
  );
  process.exit(0);
}

// Already-curated slugs (skip) — read from the compiled overlay.
const { curatedFlows } = await import("../dist/data/provider-flows.js");
const curated = new Set(Object.keys(curatedFlows));

// Existing `provider-flow` issues (skip) — title convention: "provider-flow: <slug>".
const existingJson = execFileSync(
  "gh",
  [
    "issue",
    "list",
    "--repo",
    REPO,
    "--label",
    LABEL,
    "--state",
    "all",
    "--limit",
    "500",
    "--json",
    "title",
  ],
  { encoding: "utf8" },
);
const existing = new Set(
  JSON.parse(existingJson)
    .map((i) => i.title.replace(/^provider-flow:\s*/, ""))
    .filter(Boolean),
);

// Index the live directory by slug for issue bodies.
const perks = await (await fetch(PERKS_URL)).json();
const bySlug = new Map(perks.programs.map((p) => [p.slug, p]));

const toCreate = [];
for (const slug of candidates) {
  if (curated.has(slug)) {
    console.log(`skip (already curated): ${slug}`);
    continue;
  }
  if (existing.has(slug)) {
    console.log(`skip (issue exists):    ${slug}`);
    continue;
  }
  if (!bySlug.has(slug)) {
    console.log(`skip (not in perks):    ${slug}`);
    continue;
  }
  toCreate.push(slug);
}

if (!toCreate.length) {
  console.log("\nNothing new to create.");
  process.exit(0);
}

console.log(
  `\n${create ? "Creating" : "[dry-run] would create"} ${toCreate.length} issue(s):`,
);
for (const slug of toCreate) {
  const p = bySlug.get(slug);
  const title = `provider-flow: ${slug}`;
  const body = [
    `Research the real application flow for **${p.provider}** (\`${slug}\`, ${p.value_display ?? "?"}) and`,
    `encode it into \`src/data/provider-flows.ts\` (curated overlay) per the \`ApplicationFlow\` schema.`,
    ``,
    `- Tag \`automatability\` (api / web_only / manual_review) against the provider's real signup/docs (${p.url ?? "?"}).`,
    `- Fill required_inputs, submission (method + url), redemption, danger_level.`,
    `- Put anything unverified in \`gaps\` — never auto-assert eligibility.`,
    `- Set \`source\` to the docs URL and \`verified\` to today.`,
    ``,
    `Part of #16.`,
  ].join("\n");

  if (!create) {
    console.log(`  - ${title}`);
    continue;
  }
  execFileSync(
    "gh",
    [
      "issue",
      "create",
      "--repo",
      REPO,
      "--label",
      `${LABEL},stage-1`,
      "--title",
      title,
      "--body",
      body,
    ],
    { encoding: "utf8", stdio: "inherit" },
  );
}

if (!create) console.log("\nRe-run with --create to file them.");
