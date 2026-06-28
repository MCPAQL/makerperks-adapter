# Design — Directory status knobs (#36 first slice)

Read + apply the published `status` through an **operator-configurable policy**, because the
adapter is general infrastructure (many publishers, many feed kinds) — not a MakerPerks-specific
app. Default surfaces + flags only; the agent decides; the operator can tighten to exclude/block.

## Decisions

### 1. The policy model

```ts
type ListingVisibility = "include" | "exclude";
type ProposalGate = "allow" | "flag" | "block";
type ProgramStatus = "Active" | "Discontinued" | "Beta" | "Upcoming";
type StatusPolicy = Record<ProgramStatus, { listing: ListingVisibility; proposal: ProposalGate }>;

// DEFAULT — surface/flag only (nothing hidden or blocked out of the box):
const DEFAULT: StatusPolicy = {
  Active:       { listing: "include", proposal: "allow" },
  Discontinued: { listing: "include", proposal: "flag"  },
  Beta:         { listing: "include", proposal: "flag"  },
  Upcoming:     { listing: "include", proposal: "flag"  },
};
```

A missing/unknown `status` is treated as `Active` (the directory's own default). The applier is a
pure, eval-free function (Workers-safe), like the rest of `data/`.

### 2. How the policy is applied

- **Surface:** `status` is added to the served flow + the brief + the list summaries (always —
  it's just data).
- **Listings** (`list_programs` / `search_programs` / `list_application_flows`): omit programs
  whose status is `exclude`, **unless** the caller passes `include_inactive: true`. Default
  excludes nothing → behavior unchanged by default.
- **Proposals** (`propose_flow` / `verify_flow_proposal`): apply the program's `proposal` gate —
  `flag` adds a non-blocking `status_finding` (surfaced, agent decides; consistent with
  eligibility-surfaced); `block` refuses with a clear error. Default flags non-`Active`, blocks
  nothing.

### 3. Where the policy lives — PER-USER, with the user's profile (decided 2026-06-28)

The status knobs are a **per-user preference/view**, not shared content: the accepted *flows* are
shared (a fix bubbles out to everyone), but how a user *views* the directory by status, and their
own propose guardrails, are personal. So the policy is stored **per user** in the existing
`ProfileStore` (`UserRecord.statusPolicy`, alongside profile / vault / audit / flow-health),
defaulting to `DEFAULT` (surface/flag) when a user has set nothing.

This cleanly resolves the public-worker question: **no user / anonymous → `DEFAULT`**; an
authenticated session resolves *that user's* policy. No env config, no coupling to the shared
registry DO.

- `get_status_policy` / `set_status_policy` operate on the **per-user store** (registered where a
  `ProfileStore` is wired — local + the authed endpoint), exactly like the profile/vault ops.
- The **listing** ops (`list_programs` / `search_programs` / `list_application_flows`) and the
  **proposal** ops resolve the session's per-user policy (defaults when there is no user). Threading
  is the same shape as the accepted-overlay seam — pass the resolved policy (or the `ProfileStore`)
  into those ops; the read-only worker has no store, so `DEFAULT` applies.

**Two nuances (eyes-open):**
- The proposal `block` is a **personal guardrail** (your setting stops *you* from proposing), not a
  deployment rule — the shared `verify` gate + acceptance dial remain the real protections.
- A **deployment-level floor** (a publisher hard-enforcing "never show discontinued to anyone") is a
  separate, later concern (like operator-gating). For now: a hardcoded `DEFAULT` everyone starts
  from, per-user overrides on top. A publisher who wants a different *baseline* can change `DEFAULT`
  (or, later, an env-driven default) — out of scope here.

### 4. Section plan

§1 stands up the model + `DEFAULT` + `get/set_status_policy` on the per-user `ProfileStore`
(`UserRecord.statusPolicy`); §2 wires listing exclusion (resolving the session's policy, default
otherwise); §3 wires the proposal gate. The read-only worker never wires a store and uses `DEFAULT`.

## Out of scope (tracked)

Drift detection + retire (#36 proper); a publisher-supplied policy embedded in the feed; per-status
TTLs; auto-rejecting existing pending proposals when a status flips to `block`.
