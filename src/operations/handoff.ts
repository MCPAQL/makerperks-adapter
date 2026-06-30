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
import type { MakerProfile, VaultEntry } from "../session/profile.js";
import type { VaultCrypto } from "./../session/vault.js";
import {
  buildProvenance,
  HANDOFF_UNTRUSTED_FIELDS,
  isExposureUrlAllowed,
  normalizeActionUrl,
  normalizeOptionalText,
  normalizeTextList,
  normalizeUntrustedText,
  UNTRUSTED_LIMITS,
  type Provenance,
} from "../data/untrusted.js";

/** Provenance of the directory data behind a package — surfaced so the agent knows the source feed. */
export interface ProvenanceContext {
  feed?: string;
  feedTrust?: "trusted" | "untrusted";
}

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
  /** #97: which fields are untrusted third-party directory data (to act on, never as instructions). */
  provenance: Provenance;
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
  provenanceCtx?: ProvenanceContext,
): HandoffPackage {
  // The execution's accumulated inputs win over profile-derived defaults.
  const known: Record<string, unknown> = {
    ...profileInputs(profile),
    ...execution.inputs,
  };

  const assembled: HandoffAssembledInput[] = [];
  const pending: HandoffPendingInput[] = [];
  for (const ri of flow.required_inputs) {
    const note = normalizeOptionalText(ri.note, UNTRUSTED_LIMITS.note);
    if (ri.source === "credential") {
      pending.push({
        key: ri.key,
        type: ri.type,
        required: ri.required,
        source: ri.source,
        note: `${note ? `${note}; ` : ""}supply out-of-band — never exposed in the handoff`,
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
        note,
        reason: "missing",
      });
    }
  }

  // #97: feed/flow text is untrusted — normalize it and constrain the apply URL before the agent
  // ever sees it. A URL dropped for an unsafe scheme is surfaced as a gap, never silently blanked.
  const gaps = normalizeTextList(flow.gaps);
  const action_url = normalizeActionUrl(flow.submission.action_url);
  if (flow.submission.action_url && !action_url) {
    gaps.push(
      "apply URL was rejected (not an https/mailto URL) and withheld from the package",
    );
  }

  return {
    slug: flow.slug,
    provider: flow.provider,
    title: normalizeUntrustedText(flow.title, UNTRUSTED_LIMITS.title),
    automatability: flow.automatability,
    action_url,
    method: flow.submission.method,
    instructions: normalizeOptionalText(
      flow.submission.instructions,
      UNTRUSTED_LIMITS.instructions,
    ),
    assembled_inputs: assembled,
    pending_inputs: pending,
    danger_level: flow.danger_level,
    confidence: flow.confidence,
    gaps,
    eligibility_notice: eligibilityNotice(flow),
    provenance: buildProvenance(HANDOFF_UNTRUSTED_FIELDS, {
      feed: provenanceCtx?.feed,
      feedTrust: provenanceCtx?.feedTrust,
    }),
  };
}

/**
 * The live application package the agent actually applies with (#91). It is `buildHandoff` plus
 * KIND- and DANGER-TIERED credential delivery (#95): a supplied vault credential is decrypted and
 * moved from `pending_inputs` into `assembled_inputs` ONLY when it is a **`scoped_token`** AND the
 * flow is at **danger ≤ 2**. A `password` or `identity_document` is NEVER auto-exposed regardless
 * of danger (reusable account access / irreplaceable PII — supplied out-of-band), and **danger ≥ 3**
 * never exposes any credential. With no vault key (or no credential), it stays pending — fail safe.
 * This is the one place a credential plaintext may reach the agent; the preview path (`get_handoff`
 * / `buildHandoff`) remains entirely secret-free.
 */
export async function buildApplicationPackage(
  flow: ApplicationFlow,
  execution: Execution,
  profile?: MakerProfile,
  opts?: {
    vault?: VaultCrypto;
    credential?: VaultEntry;
    /** #97: the program's own URL (directory identity) — anchors the apply-URL domain check. */
    anchorUrl?: string;
    /** #97: trust of the source feed; an `untrusted` feed never auto-exposes a credential. */
    feedTrust?: "trusted" | "untrusted";
    /** #97: operator-configured trusted form hosts (e.g. `*.typeform.com`). */
    formHosts?: readonly string[];
    /** Source feed id, surfaced in the package's provenance envelope. */
    feed?: string;
  },
): Promise<HandoffPackage> {
  const { vault, credential, anchorUrl, feedTrust, formHosts, feed } = opts ?? {};
  const pkg = buildHandoff(flow, execution, profile, { feed, feedTrust });

  // The credential auto-expose path (#95) additionally requires (#97) that the source feed is
  // explicitly trusted AND the normalized apply URL is on the program's own registrable domain (or an
  // operator form-host allowlist) — so an injected off-domain redirect never carries a live secret.
  // The feed check is fail-CLOSED: only `feedTrust === "trusted"` exposes; `undefined` (a caller that
  // didn't resolve trust) withholds. On any failure the credential stays pending (fail-safe),
  // annotated with why, for out-of-band supply.
  if (
    vault &&
    credential &&
    credential.kind === "scoped_token" &&
    flow.danger_level <= 2
  ) {
    const idx = pkg.pending_inputs.findIndex((p) => p.reason === "credential");
    if (idx >= 0) {
      const feedOk = feedTrust === "trusted";
      const urlAllowed =
        feedOk &&
        isExposureUrlAllowed({ actionUrl: pkg.action_url, anchorUrl, formHosts });
      if (urlAllowed) {
        const target = pkg.pending_inputs[idx];
        const value = await vault.open({
          ciphertext: credential.ciphertext,
          iv: credential.iv,
        });
        pkg.assembled_inputs.push({ key: target.key, value, source: "credential" });
        pkg.pending_inputs.splice(idx, 1);
      } else {
        const target = pkg.pending_inputs[idx];
        const why = !feedOk
          ? `source feed is not trusted (${feedTrust ?? "unknown"}) — credential withheld, supply out-of-band`
          : "apply URL is not on the provider's domain — verify the URL before supplying the credential";
        target.note = target.note ? `${target.note}; ${why}` : why;
      }
    }
  }
  return pkg;
}
