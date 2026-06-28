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

### 3. OPEN DECISION — where the policy lives (confirm before implementing)

The policy is operator config that **both** the read-only public worker (for listings) and the
stateful worker (for proposals + operator edits) need to honor. Three options:

- **(a) Runtime op + the registry DO (stateful only).** `set_status_policy` writes the shared
  registry DO; the public read-only worker (no registry) always uses `DEFAULT`. Simplest, runtime
  knobs — but the public directory can't be configured (always shows everything).
- **(b) Deployment env config (both workers).** A `STATUS_POLICY` env/var both workers read at
  startup; flipping a knob = redeploy. Both surfaces honor it; no runtime op.
- **(c) Both — env default + runtime override on the stateful side.** The public worker honors the
  env default; the stateful worker layers a runtime override (registry) on top. Most flexible, most
  machinery.

**Recommendation: (c)** — an env-driven `STATUS_POLICY` default both workers honor (so the public
directory *can* hide discontinued), plus a `set_status_policy` runtime override on the stateful
worker for no-redeploy tuning. If that's too much for a first slice, **(a)** ships the runtime
knobs fastest and a publisher can still pre-bake exclusions into the feed they publish. **Settle
this at the top of §1.**

### 4. Section plan reflects the decision

§1 stands up the model + defaults + `get/set_status_policy` against whichever store §3 of this
design selects; §2 wires listing exclusion; §3 wires the proposal gate. If we choose (a), the
public worker simply never wires the policy and uses `DEFAULT`.

## Out of scope (tracked)

Drift detection + retire (#36 proper); a publisher-supplied policy embedded in the feed; per-status
TTLs; auto-rejecting existing pending proposals when a status flips to `block`.
