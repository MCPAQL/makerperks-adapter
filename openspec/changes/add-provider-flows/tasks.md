# Tasks — Provider application-flow dataset (#16)

> **Scope:** a discoverable, read-only application-flow dataset over the directory — a
> derived baseline for every perk plus a curated overlay for a few spikes — exposed via
> `get_application_flow` / `list_application_flows`. The EXECUTE pipeline (#17), autonomy
> switch (#18), vault (#19), and `web_only` handoff (#21) are **out of scope**; this is the
> data they build on.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-provider-flows --strict`
> passes, typecheck/build/lint/tests green, the new ops return merged flows over the live
> directory, and the existing READ surface is unchanged.

## 1. Flow schema + derivation (general layer)

- [ ] 1.1 `src/data/flows.ts`: the `ApplicationFlow` type (automatability, required_inputs,
  submission, redemption, danger_level, confidence, gaps, identity, provenance) + an
  **eval-free** validator for the curated overlay (no ajv — Workers)
- [ ] 1.2 `deriveFlow(program)`: baseline flow from a `perks.json` program — action_url from
  url, generic required_inputs, automatability/redemption heuristics, conservative
  danger_level, with honest `gaps` for everything unverified; `confidence: derived`
- [ ] 1.3 Unit-test the derivation: shape, heuristic branches (free_tier/credits/discount),
  and that every uncertain field is named in `gaps`

## 2. Curated overlay + merge

- [ ] 2.1 `provider-flows.json` (repo-owned, AGPL) + a loader using the eval-free validator;
  `mergeFlow(derived, curated)` (curated-over-derived; `confidence: curated` when present)
- [ ] 2.2 Seed curated records for the spikes, each researched against the provider's real
  signup/docs: **anthropic** (`api`), **deepgram** (`api`), **gcp** (`web_only` handoff)
- [ ] 2.3 Unit-test the merge (curated wins per field; confidence flips; unknown slug →
  derived only)

## 3. Discoverable READ surface

- [ ] 3.1 Register `get_application_flow(slug)` → merged flow (404 on unknown slug) and
  `list_application_flows(automatability?, limit?)` → summaries, on the Router
- [ ] 3.2 Confirm `introspect` lists the two new ops with params/types; existing READ ops
  (`list_programs`/`get_program`/`search_programs`) unchanged
- [ ] 3.3 Tests: get/list over the fixture; automatability filter; transport parity holds

## 4. Enrichment tooling (idempotent issue generator)

- [ ] 4.1 `scripts/gen-provider-flow-issues.mjs`: read `perks.json`, take a **curated**
  candidate list (not all 207), dedupe by slug against existing `provider-flow` issues,
  create only new ones; dev tooling, not bundled in the Worker
- [ ] 4.2 Dry-run mode (print what it *would* create); run it for the spike set to open the
  per-provider research issues

## 5. Validate + archive

- [ ] 5.1 `openspec validate add-provider-flows --strict` passes
- [ ] 5.2 `npm run typecheck`, `npm run build`, `npm run lint`, `npm test` green; ops return
  real merged flows over the live `perks.json`
- [ ] 5.3 Archive into `openspec/specs/`
