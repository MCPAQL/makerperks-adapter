## Why

Piece D of the #47 arc — the last piece. Piece C (`add-flow-discovery`) produces **verified
proposed Flow Documents** (`ready_for_proposal`); D governs **how a proposal becomes curated and
served**. Two things: a **shared, operator-curated review queue** the proposals pass through, and
an **acceptance autonomy dial** over them — human-gated by default, full-auto available — with
accepted flows **served live** (no redeploy).

This closes the runtime loop: `start_flow_discovery` → (cache miss) brief → agent researches →
`verify_flow_proposal` → **`propose_flow` → review → `accept_flow` → served**. It also stands up
the **generic queue machinery** #35 (community service submissions) and #36 (service maintenance)
will reuse — one queue mechanism, two entity kinds (flow now, service later).

## What Changes

- **A shared proposed-flow queue (CRUDE over proposals).** A new operator/shared store (a
  `FlowRegistry` seam: in-memory locally + a single registry **Durable Object** hosted) holds the
  queue + the accepted overlay.
  - `propose_flow` (CREATE) — submit a candidate Flow Document (+ provenance + the agent's
    adversarial attestation). The server **re-runs piece-C `verify` authoritatively** (it never
    trusts the caller's `ready_for_proposal`), stamps the verdict, stores it `pending`.
  - `list_proposed_flows` (READ) — pending proposals with their verdicts and the diff vs the
    currently-served flow; filterable by status / provider / danger.
  - `accept_flow` / `update_proposed_flow` (UPDATE) — accept (per the dial) → publish to the
    accepted overlay; or revise a pending proposal (re-runs `verify`).
  - `reject_flow` (DELETE) — discard with a reason.
- **An acceptance autonomy dial** (`set_acceptance_mode` / `get_acceptance_mode`), mirroring #18:
  **review_each** (default — a human accepts every proposal), **auto_low_risk** (auto-accept
  `ready_for_proposal` **and** `danger_level ≤ 1`; human handles `≥ 2` or not-ready), **full_auto**
  (auto-accept `ready_for_proposal`). In **every** mode the `verify` gate runs, **eligibility is
  never auto-asserted** (eligibility findings block `ready_for_proposal`, so it can't auto-accept),
  and **`danger_level ≥ 3` (payment / real identity) is never auto-accepted** — it always waits for
  an explicit human `accept_flow`, the #18 floor.
- **Accepted flows are served live.** `accept_flow` publishes the flow into the registry's accepted
  overlay; the flow-serving path merges it with **highest precedence** (derived ⊕ `flows.json` ⊕
  accepted) **when a registry is wired** — no redeploy. The read-only public endpoint (no registry)
  is unchanged.

## Capabilities

### New Capabilities

- `flow-acceptance`: a shared, operator-curated proposed-flow review queue (CRUDE over proposals,
  generic over entity kind) + an acceptance autonomy dial (review_each / auto_low_risk / full_auto;
  `verify` always runs; eligibility never auto-asserted; danger ≥ 3 always human), with accepted
  flows published to a live overlay the server serves.

## Impact

- **Affected specs:** `flow-acceptance` (new); `application-flows` (MODIFIED — the served flow
  merges the accepted overlay with highest precedence when a registry is wired).
- **Affected code:** a new `session/flow-registry.ts` (the `FlowRegistry` store seam + the
  `Proposal` model + an in-memory shared impl, runtime-free + unit-testable like `session/state.ts`
  / `session/profile.ts`); a new `operations/flow-acceptance.ts` (the CRUDE queue ops + the dial,
  re-running piece-C `collectProposalFindings`); the flow-serving merge gains an optional
  accepted-overlay layer (`data/flows.ts` `getApplicationFlow` + the ops that call it); `buildRouter`
  registers the acceptance ops when a registry is wired; the **stateful worker** adds a single
  registry Durable Object. The read-only worker, the pipeline, the vault, and `flows.json` are
  unchanged.
- **Non-goals / tracked follow-up:** publishing the accepted overlay to **KV** for the public
  read-only worker to serve (KV's read-mostly sweet spot, load-once + TTL — a fast follow-up after
  the stateful round trip); the committed-`flows.json` reconcile + the **MIT-safe `steps_to_apply`
  extract for Nate** (a dev script, like `gen-provider-flow-issues`); the **service** entity kind
  (#35) + service maintenance (#36) over the same queue; swapping the registry backing to **D1** if
  the queue ever needs real SQL at scale (the seam keeps it swappable).
