// Flow discovery (#47 piece C) — the MODEL-FREE pieces of the research→generate→verify→propose
// loop. The server is the substrate (no web, no model, runs on Workers); it hands a connected
// LLM agent a research **brief** to investigate against, and (in §2/§3) the schema/provenance/
// eligibility gates, the overlay diff, and a fidelity oracle. The agent supplies the model + web.
// No provider SDK is a dependency. See openspec/changes/add-flow-discovery (capability
// `flow-discovery`).

import {
  deriveFlow,
  getApplicationFlow,
  curatedFlowContract,
  collectCuratedFlowErrors,
  type ApplicationFlow,
  type CuratedFlow,
  type CuratedFlowContract,
} from "./flows.js";
import type { PerkProgram } from "./source.js";
import type { FlowSource } from "./flow-source.js";

// The static adversarial checks the agent must execute SEMANTICALLY (the server hands over the
// contract; refutation needs a model, so it stays the agent's job). Surfaced in the brief and by
// `verify_flow_proposal` (§2).
export const ADVERSARIAL_CHECKLIST: readonly string[] = [
  "Re-fetch each sources[] URL and confirm it actually supports the claim it backs.",
  "Confirm submission.action_url is the real apply/signup page, not the provider homepage carried over from the baseline.",
  "Confirm no eligibility criterion is recorded as satisfied — eligibility belongs in gaps, never asserted.",
  "Confirm danger_level is justified by the submission (payment or real-identity steps raise it).",
  "Confirm every non-obvious curated field carries a sources[] entry; move anything you could not source to gaps.",
];

export interface DiscoveryBrief {
  slug: string;
  /** The published perks.json record — the raw facts to research from. */
  program: PerkProgram;
  /** The heuristic baseline (deriveFlow) — a low-confidence starting point. */
  baseline: ApplicationFlow;
  /** The currently-served flow (curated overlay if any, else == baseline) — what re-discovery replaces. */
  current: ApplicationFlow;
  /** The baseline's explicit unknowns — what the agent must confirm against the provider. */
  gaps: string[];
  /** The target Flow Document contract (field names + allowed enums) — what `verify` accepts. */
  target: CuratedFlowContract;
  verification_contract: {
    provenance: string;
    eligibility: string;
    adversarial_checklist: readonly string[];
  };
}

/**
 * Build the research scaffold an agent investigates against. Pure: a function of the program +
 * the loaded overlay — no web, no model. Callers must `ensureLoaded()` the FlowSource first.
 */
export function buildDiscoveryBrief(
  program: PerkProgram,
  flows: FlowSource,
): DiscoveryBrief {
  const baseline = deriveFlow(program);
  return {
    slug: program.slug,
    program,
    baseline,
    current: getApplicationFlow(program, flows),
    gaps: baseline.gaps,
    target: curatedFlowContract(),
    verification_contract: {
      provenance:
        "Every non-derived claim must cite a source URL in sources[]; anything you cannot source " +
        "belongs in gaps — never record a guess as a fact.",
      eligibility:
        "Eligibility criteria are surfaced in gaps for the maker to verify; never assert them as " +
        "satisfied, and never auto-deny or hard-block the perk.",
      adversarial_checklist: ADVERSARIAL_CHECKLIST,
    },
  };
}

// ── §2: model-free verification + diff ───────────────────────────────────────────────────────

// The overlay fields whose presence makes a candidate a substantive curated claim (as opposed to,
// say, only tweaking `gaps`). A substantive candidate must carry provenance + a `verified` date.
const SUBSTANTIVE_FIELDS = [
  "automatability",
  "submission",
  "required_inputs",
  "redemption",
  "danger_level",
] as const;

// Top-level keys that look like an eligibility *assertion* (recording eligibility as data instead
// of surfacing it in `gaps`). Matched case-insensitively against any key outside the contract.
const ELIGIBILITY_KEY = /eligib|qualif|approved|accepted|meets_criteria|is_eligible/i;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface ProposalVerdict {
  schema_valid: boolean;
  schema_errors: string[];
  /** Substantive claims without provenance (no `source`/`sources[]`) or without a `verified` date. */
  provenance_findings: string[];
  /** Eligibility recorded as data rather than surfaced in `gaps` — flagged, never asserted/blocked. */
  eligibility_findings: string[];
  /** The semantic refutations the agent still owes (the server hands over the contract only). */
  adversarial_checklist: readonly string[];
  /** Structural bar only (schema + provenance + eligibility-surfaced) — NOT an acceptance decision. */
  ready_for_proposal: boolean;
}

/**
 * Run the model-free gates on a candidate Flow Document. Pure — no web, no model: schema (the
 * eval-free overlay validator), provenance (a substantive candidate must carry a `source` and/or
 * `sources[]` plus a `verified` date), and eligibility-surfaced (eligibility encoded as data is
 * flagged, never asserted, and the perk is never hard-blocked). The semantic adversarial pass
 * stays the agent's job; the server returns the checklist it must execute.
 */
export function collectProposalFindings(candidate: unknown): ProposalVerdict {
  const schema_errors = collectCuratedFlowErrors({ flow: candidate }).map((e) =>
    e.replace(/^\/flow/, ""),
  );
  const schema_valid = schema_errors.length === 0;

  const provenance_findings: string[] = [];
  const eligibility_findings: string[] = [];

  if (isObject(candidate)) {
    const substantive = SUBSTANTIVE_FIELDS.some((f) => candidate[f] !== undefined);
    if (substantive) {
      const hasSource =
        typeof candidate.source === "string" && candidate.source.length > 0;
      const hasSources =
        Array.isArray(candidate.sources) && candidate.sources.length > 0;
      if (!hasSource && !hasSources) {
        provenance_findings.push(
          "substantive curated claims carry no provenance — set `source` (a docs URL) and/or `sources[]`",
        );
      }
      if (typeof candidate.verified !== "string" || candidate.verified.length === 0) {
        provenance_findings.push("missing a `verified` date for the curated claims");
      }
    }

    const contractFields = new Set(curatedFlowContract().fields);
    for (const key of Object.keys(candidate)) {
      if (!contractFields.has(key) && ELIGIBILITY_KEY.test(key) && candidate[key]) {
        eligibility_findings.push(
          `eligibility encoded as \`${key}\` — surface eligibility criteria in \`gaps\`, never assert them`,
        );
      }
    }
  } else {
    // A non-object candidate already failed the schema gate; nothing more to inspect.
  }

  return {
    schema_valid,
    schema_errors,
    provenance_findings,
    eligibility_findings,
    adversarial_checklist: ADVERSARIAL_CHECKLIST,
    ready_for_proposal:
      schema_valid &&
      provenance_findings.length === 0 &&
      eligibility_findings.length === 0,
  };
}

export interface FlowDiff {
  /** Fields the candidate sets that the current overlay does not. */
  added: Record<string, unknown>;
  /** Fields present in both whose value differs (deep). */
  changed: Record<string, { from: unknown; to: unknown }>;
  /** Fields the current overlay sets that the candidate drops. */
  removed: string[];
}

/**
 * Field-level diff of a candidate Flow Document against the current curated overlay entry, over
 * the overlay's authored fields. With no current entry, every populated candidate field is
 * `added`. Pure.
 */
export function diffFlow(candidate: CuratedFlow, current?: CuratedFlow): FlowDiff {
  const fields = curatedFlowContract().fields;
  const added: Record<string, unknown> = {};
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const removed: string[] = [];
  const cand = candidate as Record<string, unknown>;
  const curr = (current ?? {}) as Record<string, unknown>;

  for (const f of fields) {
    const inCand = cand[f] !== undefined;
    const inCurr = curr[f] !== undefined;
    if (inCand && !inCurr) {
      added[f] = cand[f];
    } else if (!inCand && inCurr) {
      removed.push(f);
    } else if (
      inCand &&
      inCurr &&
      JSON.stringify(cand[f]) !== JSON.stringify(curr[f])
    ) {
      changed[f] = { from: curr[f], to: cand[f] };
    }
  }
  return { added, changed, removed };
}
