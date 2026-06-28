// Directory status policy (#36 first slice / add-directory-status). The published directory carries
// a per-program `status` (Active / Discontinued / Beta / Upcoming). This module reads it and applies
// an operator-configurable — actually PER-USER — policy: how *you* view the directory by status is a
// personal preference (the accepted flows stay shared). Pure + eval-free (Workers-safe), like the
// rest of data/. The policy is stored per-user in the ProfileStore (UserRecord.statusPolicy);
// anonymous / read-only deployments use DEFAULT. See openspec/changes/add-directory-status.

import type { PerkProgram } from "./source.js";

export const PROGRAM_STATUSES = ["Active", "Discontinued", "Beta", "Upcoming"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const LISTING_VISIBILITIES = ["include", "exclude"] as const;
export type ListingVisibility = (typeof LISTING_VISIBILITIES)[number];

export const PROPOSAL_GATES = ["allow", "flag", "block"] as const;
export type ProposalGate = (typeof PROPOSAL_GATES)[number];

export interface StatusEntry {
  listing: ListingVisibility;
  proposal: ProposalGate;
}
export type StatusPolicy = Record<ProgramStatus, StatusEntry>;

/** The default policy: surface/flag only — nothing hidden or blocked out of the box. */
export const DEFAULT_STATUS_POLICY: StatusPolicy = {
  Active: { listing: "include", proposal: "allow" },
  Discontinued: { listing: "include", proposal: "flag" },
  Beta: { listing: "include", proposal: "flag" },
  Upcoming: { listing: "include", proposal: "flag" },
};

/** A program's status, defaulting to `Active` when absent or unrecognized (the directory default). */
export function resolveStatus(program: PerkProgram): ProgramStatus {
  const s = program.status;
  return s !== undefined && (PROGRAM_STATUSES as readonly string[]).includes(s)
    ? (s as ProgramStatus)
    : "Active";
}

/**
 * The effective policy for a (partial) stored override: each status falls back to DEFAULT, so a
 * user who set only `Discontinued` still gets sensible entries for the rest. Per-user; an absent
 * override (anonymous / read-only) yields DEFAULT.
 */
export function effectiveStatusPolicy(
  stored?: Partial<Record<ProgramStatus, Partial<StatusEntry>>>,
): StatusPolicy {
  const out = {} as StatusPolicy;
  for (const status of PROGRAM_STATUSES) {
    out[status] = { ...DEFAULT_STATUS_POLICY[status], ...(stored?.[status] ?? {}) };
  }
  return out;
}

/** The policy entry that applies to a program, given a (possibly partial) stored override. */
export function statusEntryFor(
  program: PerkProgram,
  stored?: Partial<Record<ProgramStatus, Partial<StatusEntry>>>,
): StatusEntry {
  return effectiveStatusPolicy(stored)[resolveStatus(program)];
}

/**
 * The proposal gate for a program under the session's policy, with a human-readable finding for
 * `flag` / `block`. `allow` → no finding. Used by `propose_flow` / `verify_flow_proposal` (§3):
 * `flag` is a non-blocking surfaced caveat; `block` refuses the proposal.
 */
export function statusProposalCheck(
  program: PerkProgram,
  stored?: Partial<Record<ProgramStatus, Partial<StatusEntry>>>,
): { gate: ProposalGate; finding?: string } {
  const gate = statusEntryFor(program, stored).proposal;
  if (gate === "allow") return { gate };
  const status = resolveStatus(program);
  return {
    gate,
    finding:
      `Program status is ${status}; your status policy ${gate === "block" ? "blocks" : "flags"} ` +
      `proposing a flow for it` +
      (gate === "block" ? " (set its proposal gate to allow/flag to proceed)." : "."),
  };
}
