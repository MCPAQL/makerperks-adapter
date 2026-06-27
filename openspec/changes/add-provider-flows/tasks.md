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

- [x] 1.1 `src/data/flows.ts`: the `ApplicationFlow` type (automatability, required_inputs,
  submission, redemption, danger_level, confidence, gaps, identity, provenance), the
  `CuratedFlow` partial-overlay type, + `collectCuratedFlowErrors` — an **eval-free**
  validator for the curated overlay (no ajv — Workers)
- [x] 1.2 `deriveFlow(program)`: baseline flow from a `perks.json` program — action_url from
  url, generic required_inputs, automatability/redemption heuristics, danger_level 0, with
  honest `gaps` for everything unverified; `confidence: derived`
- [x] 1.3 `test/flows.test.mjs`: derivation shape, heuristic branches
  (free_tier→api/auto, gated credits→manual_review, small credits/discount→web_only/code,
  student→credential input, unknown→unknown), gaps named; + validator (well-formed passes,
  bad enums/shape caught, non-object rejected)

## 2. Curated overlay + merge

- [x] 2.1 `src/data/provider-flows.ts` (repo-owned, AGPL — `.ts` not `.json` so it bundles on
  Workers without a copy step; still runtime-validated via `collectCuratedFlowErrors`);
  `mergeFlow(derived, curated)` (curated-over-derived per field; `confidence: curated`;
  identity from baseline) + `getApplicationFlow(program)` accessor
- [x] 2.2 Seeded 3 researched spikes (verified 2026-06-27): **deepgram/deepgram-pricing-
  startup-credits** (`api`, self-serve $200), **anthropic/anthropic-startup-program**
  (`manual_review`, gated app, danger 2), **gcp/google-ai-startup-program** (`web_only`
  handoff, danger 2). Eligibility kept in `gaps` — never auto-asserted
- [x] 2.3 Unit-tested the merge (curated wins per field; confidence flips; identity preserved;
  unseeded slug → derived), plus "shipped overlay validates" and a seeded `getApplicationFlow`

## 3. Discoverable READ surface

- [x] 3.1 `src/operations/flows.ts`: `get_application_flow(slug)` → merged flow
  (`NOT_FOUND_RESOURCE` on unknown slug) and `list_application_flows(automatability?, limit?)`
  → summaries; registered in `buildApp` (`registerFlowOperations`)
- [x] 3.2 `introspect` now lists 6 ops incl. the two new ones with params/types/enums;
  existing READ ops untouched; the single `mcp_aql_read` tool surface is unchanged
- [x] 3.3 Tests: curated vs derived get; unknown-slug 404; automatability filter; invalid-enum
  rejection; updated introspect-count + transport-parity (6 ops over stdio and http). 45 green

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
