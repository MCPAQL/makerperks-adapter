// Web-only provider handoff (#21): project an in-flight execution + the maker profile + the
// program's flow into a structured package an EXTERNAL browser-automation agent can act on.
// The adapter prepares and hands off; it never drives a browser. No secret ever enters the
// package, and eligibility is surfaced (not decided) — neither auto-asserted nor auto-denied,
// never hard-blocked. See openspec/changes/add-web-handoff (capability `web-handoff`).

import type {
  ApplicationFlow,
  Confidence,
  DangerLevel,
  InputSource,
  InputType,
  SubmissionMethod,
} from "../data/flows.js";
import type { Execution } from "../session/state.js";
import type { MakerProfile } from "../session/profile.js";

/**
 * Project the maker profile into candidate application inputs. Only fields the profile actually
 * holds are surfaced; keys match the flow's `source: "profile"` inputs (full_name / email /
 * region / country). Shared by the assemble stage and the handoff builder.
 */
export function profileInputs(profile?: MakerProfile): Record<string, unknown> {
  if (!profile) return {};
  const id = profile.identity;
  const out: Record<string, unknown> = {};
  if (id.name) {
    out.full_name = id.name;
    out.name = id.name;
  }
  if (id.email) out.email = id.email;
  if (id.location?.region) out.region = id.location.region;
  if (id.location?.country) out.country = id.location.country;
  return out;
}

export interface HandoffAssembledInput {
  key: string;
  value: unknown;
  source: InputSource;
}

export interface HandoffPendingInput {
  key: string;
  type: InputType;
  required: boolean;
  source: InputSource;
  note?: string;
  /** Why it isn't assembled: not yet provided, or a secret that must be supplied out-of-band. */
  reason: "missing" | "credential";
}

export interface HandoffPackage {
  slug: string;
  provider: string;
  title: string;
  automatability: ApplicationFlow["automatability"];
  action_url?: string;
  method: SubmissionMethod;
  instructions?: string;
  assembled_inputs: HandoffAssembledInput[];
  pending_inputs: HandoffPendingInput[];
  danger_level: DangerLevel;
  confidence: Confidence;
  gaps: string[];
  eligibility_notice: string;
}

function eligibilityNotice(flow: ApplicationFlow): string {
  const gated = flow.automatability === "manual_review" || flow.danger_level >= 2;
  return gated
    ? "Eligibility (funding stage, prior-credit history, etc.) is yours to assert — this " +
        "server neither auto-asserts nor auto-denies it. Review the gaps below; if you judge " +
        "your project eligible, you may proceed (including simulating a follow-through)."
    : "Self-serve: review the steps and proceed.";
}

/**
 * Build the handoff package. Required inputs split into `assembled_inputs` (non-secret, value
 * known from the profile or the execution's accumulated inputs) and `pending_inputs` (still
 * missing, or `source: "credential"` — whose value is NEVER included; it is supplied to the
 * browser agent / maker out-of-band). No hard lock: the package is always returned.
 */
export function buildHandoff(
  flow: ApplicationFlow,
  execution: Execution,
  profile?: MakerProfile,
): HandoffPackage {
  // The execution's accumulated inputs win over profile-derived defaults.
  const known: Record<string, unknown> = {
    ...profileInputs(profile),
    ...execution.inputs,
  };

  const assembled: HandoffAssembledInput[] = [];
  const pending: HandoffPendingInput[] = [];
  for (const ri of flow.required_inputs) {
    if (ri.source === "credential") {
      pending.push({
        key: ri.key,
        type: ri.type,
        required: ri.required,
        source: ri.source,
        note: `${ri.note ? `${ri.note}; ` : ""}supply out-of-band — never exposed in the handoff`,
        reason: "credential",
      });
      continue;
    }
    const value = known[ri.key];
    if (value !== undefined && value !== "") {
      assembled.push({ key: ri.key, value, source: ri.source });
    } else {
      pending.push({
        key: ri.key,
        type: ri.type,
        required: ri.required,
        source: ri.source,
        note: ri.note,
        reason: "missing",
      });
    }
  }

  return {
    slug: flow.slug,
    provider: flow.provider,
    title: flow.title,
    automatability: flow.automatability,
    action_url: flow.submission.action_url,
    method: flow.submission.method,
    instructions: flow.submission.instructions,
    assembled_inputs: assembled,
    pending_inputs: pending,
    danger_level: flow.danger_level,
    confidence: flow.confidence,
    gaps: flow.gaps,
    eligibility_notice: eligibilityNotice(flow),
  };
}
