// Per-user directory status policy ops (#36 add-directory-status §1): how THIS user views the
// directory by status (Active / Discontinued / Beta / Upcoming) + their personal propose guardrails.
// Stored per-user in the ProfileStore (UserRecord.statusPolicy) — a partial override that falls back
// to DEFAULT — so it registers only where a per-user store is wired; the anonymous read-only endpoint
// uses DEFAULT. The accepted flows stay shared; only the VIEW is per-user.
// See openspec/changes/add-directory-status (capability `directory-status`).

import { ok } from "../core/wire.js";
import type { Router } from "../core/router.js";
import { appendAudit, type ProfileStore, type UserRecord } from "../session/profile.js";
import {
  effectiveStatusPolicy,
  PROGRAM_STATUSES,
  LISTING_VISIBILITIES,
  PROPOSAL_GATES,
  type ProgramStatus,
  type ListingVisibility,
  type ProposalGate,
  type StatusEntry,
} from "../data/status.js";

export function registerStatusOperations(router: Router, store: ProfileStore): void {
  router.register({
    name: "get_status_policy",
    semanticCategory: "READ",
    description:
      "Read this user's effective directory status policy — per status (Active / Discontinued / " +
      "Beta / Upcoming): `listing` (include | exclude) and `proposal` (allow | flag | block). " +
      "Unset statuses fall back to the surface/flag default.",
    params: {},
    returns: "An object with the effective `policy` (every status resolved).",
    handler: async () => {
      const stored = (await store.get())?.statusPolicy;
      return ok({ policy: effectiveStatusPolicy(stored) });
    },
  });

  router.register({
    name: "set_status_policy",
    semanticCategory: "UPDATE",
    description:
      "Set this user's view/proposal behavior for one directory status: `listing` (include | " +
      "exclude — whether status-matching programs appear in listings) and/or `proposal` (allow | " +
      "flag | block — whether proposing a flow for them is allowed, flagged, or refused). " +
      "Per-user; the shared accepted flows are unaffected.",
    params: {
      status: {
        type: "string",
        required: true,
        enum: PROGRAM_STATUSES,
        description: "The status to configure.",
      },
      listing: {
        type: "string",
        required: false,
        enum: LISTING_VISIBILITIES,
        description: "include | exclude.",
      },
      proposal: {
        type: "string",
        required: false,
        enum: PROPOSAL_GATES,
        description: "allow | flag | block.",
      },
    },
    returns: "An object with the updated effective `policy`.",
    handler: async (params) => {
      const status = params.status as ProgramStatus;
      const record: UserRecord = (await store.get()) ?? {};
      const updated: Partial<StatusEntry> = {
        ...(record.statusPolicy?.[status] ?? {}),
      };
      if (params.listing !== undefined)
        updated.listing = params.listing as ListingVisibility;
      if (params.proposal !== undefined)
        updated.proposal = params.proposal as ProposalGate;
      const statusPolicy = { ...record.statusPolicy, [status]: updated };
      await store.set(
        appendAudit({ ...record, statusPolicy }, "set_status_policy", status),
      );
      return ok({ policy: effectiveStatusPolicy(statusPolicy) });
    },
  });
}
