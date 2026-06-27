## Why

The published `perks.json` carries **no executable application-flow data** — no
`steps_to_apply`, `eligibility`, or `action_url`, only decision-signal fields. So for an
agent to *act* on a perk (the Stage 1 value), the MakerPerks server must expose, **generally
and discoverably**, as much application-flow information as the data allows.

The architecture (decided 2026-06-27): the **MCP server is the substrate** — it provides the
flow information and (later, #17) the tools that make an application possible; the
**intelligence lives in agents above it** (a Dollhouse ensemble, or "any clever LLM
engineer's" pipeline — never required). So this change makes flow **discoverable**, as
complete as the data permits, with the **gaps made explicit** so an agent knows exactly
what it still has to figure out for a novel platform.

Two layers, because value and automatability are inversely correlated (the big startup-credit
programs are gated/manual; the self-serve free-tier and API signups are the automatable ones):

- **Derived (broad, shallow, every provider):** a baseline flow record generated from
  `perks.json` for all ~207 perks — low-confidence, gaps explicit.
- **Curated (narrow, deep):** a repo-owned overlay with verified flows for a few spike
  providers.

This is the data the #17 EXECUTE pipeline acts on, and the read-only substrate that proves
the "turn any perk listing into a discoverable, actionable flow" story for the PoC.

## What Changes

- **A general flow schema** (the "pragmatic middle"): `automatability`
  (`api` | `web_only` | `manual_review` | `unknown`), `required_inputs`, `submission`
  (method + `action_url`/`endpoint`), `redemption`, `danger_level` (0–4, for the autonomy
  switch #18), `confidence` (`derived` | `curated`), and **`gaps`** (what the agent must
  still discover). Validated with the existing eval-free checker (no ajv — Workers).
- **A derivation layer** (`src/data/flows.ts`): from each `perks.json` program, produce a
  baseline flow — `action_url` from `url`, generic `required_inputs`, an `automatability`
  heuristic from `value_type`/`audience`/`tags`, a `redemption` guess — `confidence: derived`,
  with honest `gaps` for everything unverified.
- **A curated overlay** (`provider-flows.json`, repo-owned, AGPL — *not* the MIT perks
  data): per-slug records that override/enrich the derived baseline; `confidence: curated`.
  Seeded with the spike providers.
- **A discoverable READ surface** (new ops, still read-only): `get_application_flow(slug)`
  → the merged flow (curated over derived); `list_application_flows(automatability?, limit?)`
  → summaries so an agent can discover which perks are in-pipeline vs. handoff. Both appear
  in `introspect`.
- **Enrichment tooling:** an **idempotent** `provider-flow` issue generator (reads
  `perks.json`, dedupes by slug against existing issues, creates only new ones for a
  *curated* candidate set — not all 207), so per-provider research can be decomposed and
  re-run as the directory grows.

## Capabilities

### New Capabilities

- `application-flows`: a discoverable, two-layer (derived + curated) application-flow
  dataset over the directory, exposed read-only via `get_application_flow` /
  `list_application_flows`, with explicit confidence and gaps.

## Impact

- **Affected specs:** `application-flows` (new).
- **Affected code:** `src/data/flows.ts` (schema + derivation + curated merge + eval-free
  validation); `provider-flows.json` (curated overlay, repo-owned); new flow operations in
  `src/operations/` registered on the Router; introspection picks them up automatically.
  The existing READ ops and the EXECUTE path are unchanged (this is read-only).
- **Tooling:** a `scripts/`-level idempotent issue generator (dev tooling, not shipped in
  the Worker bundle).
- **License boundary:** the curated overlay is **our** AGPL IP; only derived/improved
  `steps_to_apply` *prose* may flow back to `natea/makerperks` as MIT data — never the
  structured flow.
- **Non-goals / tracked follow-up:** the EXECUTE pipeline + opt-in Execution Safety Loop
  (#17), the autonomy switch (#18), the credential vault (#19), the browser-automation
  handoff for `web_only` providers (#21), and the **generalized agent-driven flow-discovery
  tool** (an agent-layer follow-on, spec'd once the spikes reveal its shape).
