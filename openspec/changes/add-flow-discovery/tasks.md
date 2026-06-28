# Tasks — Generalized flow-discovery toolkit (#47 piece C)

> **Scope:** a model- and provider-agnostic, server-side toolkit a connected LLM agent drives to
> discover a flow for any perk — a research **brief**, model-free **verify** (schema + provenance +
> eligibility) + **diff**, a **discovery entry point**, and a **fidelity oracle** over the 3
> spikes. The proposed-flow review queue + acceptance dial + dynamic store (piece D / #64),
> auto-merge into `flows.json`, and **any** provider-SDK dependency are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-flow-discovery --strict` passes;
> typecheck/lint/both test layers green; the four READ ops are introspectable on every deployment
> including the read-only endpoint; the gates + fidelity scorer are unit-tested with the 3 spikes
> as fixtures (no model call); and a manual live regeneration of the 3 spikes via a connected MCP
> agent reaches acceptable fidelity, plus one live discovery of a never-seen perk. One commit per
> section, closing its issue; push on `main` as each section completes.

## 1. Discovery brief + the Flow Document contract descriptor

- [x] 1.1 Export a `curatedFlowContract()` descriptor (field names + allowed enums) from
  `data/flows.ts`, sourced from the same constants `collectCuratedFlowErrors` enforces (one
  source of truth)
- [x] 1.2 `buildDiscoveryBrief(program, flows)` in a new `data/discovery.ts`: program record +
  derived baseline + its `gaps` + the target contract + the verification contract (provenance,
  eligibility-surfaced, adversarial checklist)
- [x] 1.3 `get_discovery_brief(slug)` READ op (needs `data` + `flows`); `NOT_FOUND_RESOURCE` for an
  unknown slug
- [x] 1.4 Tests: a brief for a known slug carries baseline + gaps + contract; the target contract's
  enums match what the validator enforces; unknown slug errors

## 2. Model-free verification + diff

- [ ] 2.1 `collectProposalFindings(candidate, currentCurated?)` in `data/discovery.ts`: schema (reuse
  `collectCuratedFlowErrors`) + provenance (curated claims missing `sources[]`; missing `verified`)
  + eligibility (a criterion recorded as satisfied) + the static adversarial checklist; derives
  `ready_for_proposal`
- [ ] 2.2 `verify_flow_proposal(slug, candidate)` READ op returning the structured verdict; never
  asserts or auto-denies eligibility
- [ ] 2.3 `diffFlow(candidate, currentCurated?)` + `diff_flow_proposal(slug, candidate)` READ op:
  field-level added/changed/removed; all-added when no current overlay entry
- [ ] 2.4 Tests (spikes as fixtures): a known-good spike candidate passes and is
  `ready_for_proposal`; an unsourced claim → provenance finding; an asserted eligibility →
  eligibility finding (never satisfied, never blocked); the diff reports changed + added fields and
  all-added for an uncurated slug

## 3. Discovery entry point + fidelity oracle

- [ ] 3.1 `start_flow_discovery(slug)` READ op: fresh (and healthy, where a `ProfileStore` is wired)
  → `{action: "use", flow, freshness}`; else → `{action: "discover", reason, brief}`
  (reason `uncurated` / `stale` / `rediscover`); calls no model
- [ ] 3.2 `scoreFidelity(candidate, knownGood)` in `data/discovery.ts`: weighted field-level
  agreement over the load-bearing overlay fields
- [ ] 3.3 `buildRouter` registers the four discovery ops (on `data` + `flows`; the entry point uses
  the optional `ProfileStore` for health)
- [ ] 3.4 Tests: a fresh flow → `use`; an uncurated/stale flow → `discover` + brief; a spike scored
  against itself ≈ top of range; a degraded candidate scores lower
- [ ] 3.5 Manual demo (DoD, not CI): a connected MCP agent regenerates the 3 spikes to acceptable
  fidelity and discovers one never-seen perk end to end (brief → research → verify → diff)

## 4. Validate + archive

- [ ] 4.1 Reframe #63 to the model-agnostic, server-toolkit architecture (the "pin a Claude model"
  language only applies if Claude happens to be the driving client); note the arc status on #47
- [ ] 4.2 `openspec validate add-flow-discovery --strict`; typecheck/lint/both test layers green
- [ ] 4.3 Archive into `openspec/specs/` (`flow-discovery` created)
