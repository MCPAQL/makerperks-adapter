// Application-flow dataset (Stage 1, #16). Two layers over the directory:
//   - DERIVED: a baseline flow computed from each perks.json program (low-confidence,
//     gaps explicit) — so the server always answers "what does it take to apply to X?".
//   - CURATED: a portable per-slug overlay loaded from flows.json (a FlowSource) that overrides
//     the baseline. This file holds the schema, the derivation, mergeFlow, and an eval-free
//     validator for the overlay (no ajv — Workers disallow new Function). The overlay itself is
//     loaded via src/data/flow-source.ts (#47 add-flow-documents).
// See openspec/changes/add-provider-flows + add-flow-documents (capability `application-flows`).

import type { PerkProgram } from "./source.js";
import type { FlowSource } from "./flow-source.js";
import { resolveStatus, type ProgramStatus } from "./status.js";

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
  /** The program's published directory status (from perks.json; defaults to Active). #36 */
  status: ProgramStatus;
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
  /** Per-claim provenance URLs (additive; #47 flow documents). */
  sources?: string[];
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
  Omit<ApplicationFlow, "slug" | "provider" | "title" | "confidence" | "status">
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

/**
 * A machine-readable descriptor of the curated-overlay contract: the overlay fields an authored
 * Flow Document may set, and the allowed values per constrained field. Drawn from the SAME
 * constants `collectCuratedFlowErrors` enforces, so the discovery brief (#47 piece C) never
 * promises a shape the validator would reject — one source of truth, no drift. Identity
 * (`slug`/`provider`/`title`) and `confidence` are never authored (they come from perks.json /
 * the overlay's existence), so they are not in `fields`.
 */
export interface CuratedFlowContract {
  fields: readonly string[];
  enums: {
    automatability: readonly string[];
    submission_method: readonly string[];
    redemption_type: readonly string[];
    input_source: readonly string[];
    input_type: readonly string[];
    danger_level: readonly number[];
  };
}

export function curatedFlowContract(): CuratedFlowContract {
  return {
    fields: [
      "automatability",
      "required_inputs",
      "submission",
      "redemption",
      "danger_level",
      "gaps",
      "source",
      "sources",
      "verified",
    ],
    enums: {
      automatability: AUTOMATABILITY,
      submission_method: SUBMISSION_METHODS,
      redemption_type: REDEMPTION_TYPES,
      input_source: INPUT_SOURCES,
      input_type: INPUT_TYPES,
      danger_level: [0, 1, 2, 3, 4],
    },
  };
}

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
    if (
      r.sources !== undefined &&
      !(Array.isArray(r.sources) && r.sources.every((s) => typeof s === "string"))
    ) {
      errors.push(`${at}/sources must be a string[]`);
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
    status: resolveStatus(p),
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

/**
 * Merge a curated overlay over a derived baseline, field by field. Identity is always taken
 * from the baseline (it comes from perks.json), and `confidence` flips to `curated` whenever
 * an overlay record exists. Returns the baseline unchanged when there is no overlay.
 */
export function mergeFlow(
  derived: ApplicationFlow,
  curated?: CuratedFlow,
): ApplicationFlow {
  if (!curated) return derived;
  return {
    slug: derived.slug,
    provider: derived.provider,
    title: derived.title,
    status: derived.status, // from the program/directory, never authored in the overlay
    confidence: "curated",
    automatability: curated.automatability ?? derived.automatability,
    required_inputs: curated.required_inputs ?? derived.required_inputs,
    submission: curated.submission ?? derived.submission,
    redemption: curated.redemption ?? derived.redemption,
    danger_level: curated.danger_level ?? derived.danger_level,
    gaps: curated.gaps ?? derived.gaps,
    source: curated.source ?? derived.source,
    sources: curated.sources ?? derived.sources,
    verified: curated.verified ?? derived.verified,
  };
}

/**
 * The merged application flow for a program: the curated overlay (a Flow Document from the
 * loaded `FlowSource`, #47) over the derived baseline. The `FlowSource` validates the overlay on
 * load, so callers must `ensureLoaded()` it first (as they already do the `DataSource`).
 */
export function getApplicationFlow(
  program: PerkProgram,
  flows: FlowSource,
  accepted?: CuratedFlows,
): ApplicationFlow {
  // Precedence: derived baseline ⊕ flows.json overlay ⊕ accepted overlay (highest, #47 piece D).
  // An accepted proposal's candidate is a complete curated record, so it replaces the flows.json
  // overlay for that slug; with no registry wired, `accepted` is undefined and behavior is the
  // baseline ⊕ flows.json overlay exactly as before.
  const curated = accepted?.[program.slug] ?? flows.curatedFor(program.slug);
  return mergeFlow(deriveFlow(program), curated);
}

// Flows go stale 90 days after they were last verified against the provider (#47 piece B). A
// single default; per-flow / danger-weighted TTLs are a later refinement.
const STALE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface Freshness {
  /** The flow's last-verified date, if curated. */
  verified?: string;
  /** True only for a curated flow whose `verified` date is older than the TTL. */
  stale: boolean;
  /** Age in days since `verified`, or null when there is no (parseable) `verified` date. */
  age_days: number | null;
}

/**
 * Derived freshness for a flow — no stored state. A flow without a `verified` date (a derived
 * baseline) is never "stale"; it is unverified, which `gaps` already says.
 */
export function freshness(flow: ApplicationFlow, now: number = Date.now()): Freshness {
  const verified = flow.verified;
  if (!verified) return { stale: false, age_days: null };
  const verifiedAt = Date.parse(verified);
  if (Number.isNaN(verifiedAt)) return { verified, stale: false, age_days: null };
  const ageMs = now - verifiedAt;
  return {
    verified,
    stale: ageMs > STALE_TTL_MS,
    age_days: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
  };
}
