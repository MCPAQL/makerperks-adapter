// Curated application-flow overlay (Stage 1, #16 §2) — repo-owned AGPL IP, NOT the MIT
// perks data. Each record is a partial flow keyed by the perks.json slug; present fields
// override the derived baseline (see mergeFlow). Every record is researched against the
// provider's real signup/docs and dated in `verified`; unknowns stay in `gaps`.
//
// A .ts module (not .json) so it compiles to dist/ and bundles on Workers without a copy
// step or resolveJsonModule; it is still validated at load by the eval-free
// collectCuratedFlowErrors (which also guards any future external/fetched overlay).
//
// LICENSE: structured flow records do NOT flow back to natea/makerperks; only improved
// human-readable steps_to_apply prose may, as MIT data.

import type { CuratedFlows } from "./flows.js";

export const curatedFlows: CuratedFlows = {
  // Self-serve $200 credit — an agent can drive this end to end (no credit card).
  "deepgram/deepgram-pricing-startup-credits": {
    automatability: "api",
    submission: {
      method: "oauth_signup",
      action_url: "https://console.deepgram.com/signup",
      instructions:
        "Create a Deepgram Console account (no credit card). The $200 credit is " +
        "auto-applied. Create an API key under Settings → API Keys.",
    },
    required_inputs: [
      { key: "email", type: "email", required: true, source: "profile" },
      { key: "full_name", type: "string", required: true, source: "profile" },
    ],
    redemption: { type: "auto", note: "$200 credit auto-applied on signup; no code" },
    danger_level: 0,
    gaps: [
      "The $100,000 startup-program credits (slug deepgram/deepgram-startup-program) are a " +
        "SEPARATE gated application requiring a Project ID — not covered by this self-serve flow.",
      "Exact signup form fields not verified field-by-field.",
    ],
    source: "https://console.deepgram.com/signup",
    verified: "2026-06-27",
  },

  // Gated startup program — application + eligibility review (must NOT auto-assert).
  "anthropic/anthropic-startup-program": {
    automatability: "manual_review",
    submission: {
      method: "web_form",
      action_url: "https://www.anthropic.com/startups",
      instructions:
        "Create a Claude Console account first, then complete the ~2-minute application: " +
        "company email, website, and a short description of what you're building. Mention an " +
        "Anthropic partner VC/accelerator if applicable for additional benefits.",
    },
    required_inputs: [
      { key: "company_email", type: "email", required: true, source: "profile" },
      { key: "company_name", type: "string", required: true, source: "profile" },
      { key: "company_website", type: "url", required: true, source: "profile" },
      { key: "product_description", type: "string", required: true, source: "profile" },
      { key: "partner_vc", type: "string", required: false, source: "profile" },
    ],
    redemption: {
      type: "manual_review",
      note: "Claude API credits granted by stage after review; expire after 12 months",
    },
    danger_level: 2, // asserts funding/eligibility — must not be auto-asserted falsely
    gaps: [
      "Eligibility (equity funding from an institutional investor, founded within 4 years, " +
        "no prior Anthropic startup credits) must be verified by the maker — never auto-assert.",
      "Requires an existing Claude Console account before applying.",
      "Exact form fields beyond email/website/description not verified.",
    ],
    source: "https://www.anthropic.com/startups",
    verified: "2026-06-27",
  },

  // Web-only / gated — no API; a prepared handoff to a browser-automation agent (#21).
  "gcp/google-ai-startup-program": {
    automatability: "web_only",
    submission: {
      method: "web_form",
      action_url: "https://cloud.google.com/startup/apply",
      instructions:
        "Apply via the Google Cloud startup form: company details, funding info, and a Cloud " +
        "Billing Account ID. The company website domain must match the email domain and the " +
        "billing account email domain. Reviewed in 3–5 business days. No API — hand off to a " +
        "browser-automation agent (#21).",
    },
    required_inputs: [
      { key: "company_email", type: "email", required: true, source: "profile" },
      { key: "company_name", type: "string", required: true, source: "profile" },
      {
        key: "company_website",
        type: "url",
        required: true,
        source: "profile",
        note: "domain must match the email + billing account domain",
      },
      { key: "funding_stage", type: "string", required: true, source: "profile" },
      {
        key: "billing_account_id",
        type: "string",
        required: true,
        source: "credential",
        note: "GCP Cloud Billing Account ID",
      },
    ],
    redemption: {
      type: "manual_review",
      note: "Up to $350k (AI-First tier) after review; tier depends on funding stage",
    },
    danger_level: 2, // eligibility assertions + a billing-account credential
    gaps: [
      "Eligibility (AI as core tech, equity Seed–Series A with Series A < 12 months, founded " +
        "< 10 years, ≤ $5,000 prior GCP credits) must be verified — never auto-assert.",
      "Requires a GCP Cloud Billing Account ID the maker must supply.",
      "web_only: no API — a prepared handoff to a browser-automation agent (#21), not in-pipeline.",
    ],
    source: "https://cloud.google.com/startup/apply",
    verified: "2026-06-27",
  },
};
