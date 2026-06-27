// Application-flow dataset (Stage 1, #16). Two layers over the directory:
//   - DERIVED: a baseline flow computed from each perks.json program (low-confidence,
//     gaps explicit) — so the server always answers "what does it take to apply to X?".
//   - CURATED: a repo-owned overlay (provider-flows.json) of verified per-slug flows that
//     override the baseline (§2). This file holds §1: the schema, the derivation, and an
//     eval-free validator for the curated overlay (no ajv — Workers disallow new Function).
// See openspec/changes/add-provider-flows (capability `application-flows`).

import type { PerkProgram } from "./source.js";

export type Automatability = "api" | "web_only" | "manual_review" | "unknown";
export type Confidence = "derived" | "curated";
export type RedemptionType = "auto" | "code" | "manual_review" | "unknown";
export type SubmissionMethod =
  | "api"
  | "oauth_signup"
  | "web_form"
  | "email"
  | "unknown";
export type InputSource = "profile" | "credential" | "generated" | "unknown";
export type InputType = "string" | "number" | "boolean" | "email" | "url";
export type DangerLevel = 0 | 1 | 2 | 3 | 4;

export interface RequiredInput {
  key: string;
  type: InputType;
  required: boolean;
  source: InputSource;
  note?: string;
}

export interface Submission {
  method: SubmissionMethod;
  /** Where to apply — a signup page (api/oauth) or a handoff target (web_only). */
  action_url?: string;
  /** The API endpoint when `method` is `api`. */
  endpoint?: string;
  instructions?: string;
}

export interface Redemption {
  type: RedemptionType;
  note?: string;
}

export interface ApplicationFlow {
  slug: string;
  provider: string;
  title: string;
  automatability: Automatability;
  confidence: Confidence;
  required_inputs: RequiredInput[];
  submission: Submission;
  redemption: Redemption;
  danger_level: DangerLevel;
  /** What is NOT known and must still be discovered — so a guess is never a fact. */
  gaps: string[];
  /** "derived" for a heuristic baseline, or a provider-docs URL for curated. */
  source: string;
  /** ISO date a curated flow was last verified against the provider. */
  verified?: string;
}

/**
 * A curated overlay record: a partial flow keyed by slug whose present fields override the
 * derived baseline. Identity (`slug`/`provider`/`title`) and `confidence` are not authored —
 * identity comes from `perks.json`, and `confidence` becomes `curated` by virtue of being
 * in the overlay.
 */
export type CuratedFlow = Partial<
  Omit<ApplicationFlow, "slug" | "provider" | "title" | "confidence">
>;
export type CuratedFlows = Record<string, CuratedFlow>;

const AUTOMATABILITY: readonly string[] = [
  "api",
  "web_only",
  "manual_review",
  "unknown",
];
const REDEMPTION_TYPES: readonly string[] = [
  "auto",
  "code",
  "manual_review",
  "unknown",
];
const SUBMISSION_METHODS: readonly string[] = [
  "api",
  "oauth_signup",
  "web_form",
  "email",
  "unknown",
];
const INPUT_SOURCES: readonly string[] = [
  "profile",
  "credential",
  "generated",
  "unknown",
];
const INPUT_TYPES: readonly string[] = ["string", "number", "boolean", "email", "url"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Collect human-readable errors for a curated overlay map (slug -> partial flow). */
export function collectCuratedFlowErrors(data: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(data)) return ["/ curated overlay must be an object keyed by slug"];

  for (const [slug, record] of Object.entries(data)) {
    const at = `/${slug}`;
    if (!isObject(record)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    const r = record as Record<string, unknown>;

    if (
      r.automatability !== undefined &&
      !AUTOMATABILITY.includes(r.automatability as string)
    ) {
      errors.push(`${at}/automatability must be one of ${AUTOMATABILITY.join(", ")}`);
    }
    if (
      r.danger_level !== undefined &&
      !(typeof r.danger_level === "number" && [0, 1, 2, 3, 4].includes(r.danger_level))
    ) {
      errors.push(`${at}/danger_level must be an integer 0..4`);
    }
    if (
      r.gaps !== undefined &&
      !(Array.isArray(r.gaps) && r.gaps.every((g) => typeof g === "string"))
    ) {
      errors.push(`${at}/gaps must be a string[]`);
    }
    if (r.source !== undefined && typeof r.source !== "string") {
      errors.push(`${at}/source must be a string`);
    }
    if (r.verified !== undefined && typeof r.verified !== "string") {
      errors.push(`${at}/verified must be a string`);
    }
    if (r.required_inputs !== undefined) {
      if (!Array.isArray(r.required_inputs)) {
        errors.push(`${at}/required_inputs must be an array`);
      } else {
        r.required_inputs.forEach((input: unknown, i: number) => {
          const ia = `${at}/required_inputs/${i}`;
          if (!isObject(input)) return errors.push(`${ia} must be an object`);
          if (typeof input.key !== "string") errors.push(`${ia}/key must be a string`);
          if (!INPUT_TYPES.includes(input.type as string))
            errors.push(`${ia}/type invalid`);
          if (typeof input.required !== "boolean")
            errors.push(`${ia}/required must be a boolean`);
          if (!INPUT_SOURCES.includes(input.source as string))
            errors.push(`${ia}/source invalid`);
        });
      }
    }
    if (r.submission !== undefined) {
      if (!isObject(r.submission)) {
        errors.push(`${at}/submission must be an object`);
      } else if (!SUBMISSION_METHODS.includes(r.submission.method as string)) {
        errors.push(
          `${at}/submission/method must be one of ${SUBMISSION_METHODS.join(", ")}`,
        );
      }
    }
    if (r.redemption !== undefined) {
      if (!isObject(r.redemption)) {
        errors.push(`${at}/redemption must be an object`);
      } else if (!REDEMPTION_TYPES.includes(r.redemption.type as string)) {
        errors.push(
          `${at}/redemption/type must be one of ${REDEMPTION_TYPES.join(", ")}`,
        );
      }
    }
  }
  return errors;
}

/**
 * Derive a baseline application flow from a published program. Heuristics are deliberately
 * simple and transparent: every field that is not certain is named in `gaps`, and the whole
 * record is marked `confidence: derived` — so a consumer never mistakes a guess for a fact.
 */
export function deriveFlow(p: PerkProgram): ApplicationFlow {
  const audience = p.audience ?? [];
  const vt = p.value_type;

  let automatability: Automatability;
  if (vt === "free_tier") {
    automatability = "api"; // self-serve signup → an agent can likely drive it
  } else if (vt === "discount") {
    automatability = "web_only"; // usually a coupon / web checkout
  } else if (vt === "credits") {
    automatability =
      p.max_value >= 25000 || audience.includes("startup")
        ? "manual_review"
        : "web_only";
  } else {
    automatability = "unknown";
  }

  const submission: Submission = {
    method: automatability === "api" ? "oauth_signup" : "web_form",
    action_url: p.url,
  };

  const required_inputs: RequiredInput[] = [
    { key: "email", type: "email", required: true, source: "profile" },
    { key: "full_name", type: "string", required: true, source: "profile" },
  ];
  if (audience.includes("startup")) {
    required_inputs.push(
      { key: "company_name", type: "string", required: true, source: "profile" },
      { key: "company_website", type: "url", required: false, source: "profile" },
    );
  }
  if (audience.includes("student")) {
    required_inputs.push({
      key: "student_verification",
      type: "string",
      required: true,
      source: "credential",
      note: "proof of current enrollment",
    });
  }

  let redemption: Redemption;
  if (vt === "free_tier") {
    redemption = { type: "auto", note: "typically active on signup" };
  } else if (vt === "discount") {
    redemption = { type: "code" };
  } else if (vt === "credits") {
    redemption = {
      type: automatability === "manual_review" ? "manual_review" : "code",
    };
  } else {
    redemption = { type: "unknown" };
  }

  const gaps = [
    "action_url is the provider homepage from perks.json, not a verified apply/signup URL",
    "automatability is a heuristic from value_type/audience, not confirmed against the provider",
    "required_inputs are generic defaults, not the provider's actual form fields",
    `redemption.type is inferred from value_type (${vt ?? "unknown"})`,
  ];

  return {
    slug: p.slug,
    provider: p.provider,
    title: p.title,
    automatability,
    confidence: "derived",
    required_inputs,
    submission,
    redemption,
    danger_level: 0, // signup-only baseline asserts no payment / real identity
    gaps,
    source: "derived",
  };
}
