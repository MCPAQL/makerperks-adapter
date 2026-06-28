# Tasks — Flow Documents + flows.json (#47 piece A)

> **Scope:** make the curated flow overlay a portable per-perk Flow Document loaded from a
> `flows.json` (fetched on the hosted worker, read locally, bundled default), replacing the
> bundled `provider-flows.ts` constant. Reuses the schema, `deriveFlow`, `mergeFlow`, and the
> eval-free validator; migrates the 3 spikes verbatim. Freshness/health + `report_flow_outcome`
> (piece B), the discovery harness (piece C), acceptance/queue (piece D), and the Nate-facing
> MIT guide extract are **out of scope**.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-flow-documents --strict` passes,
> typecheck/lint/both test layers green, `get_application_flow` returns the same merged flows as
> before (now from `flows.json`), the worker fetches `FLOWS_URL` with a bundled fallback, and the
> live endpoints stay correct. One commit per section, closing its issue.

## 1. Flow Document model + `flows.json` + `FlowSource` loader — #57

- [x] 1.1 Flow Document shape = `CuratedFlow` + additive `sources[]` (type + `mergeFlow` +
  eval-free validator updated in `flows.ts`); `src/data/flows.json` is the portable collection
  (map slug → document); the 3 spikes migrated **verbatim** (parity-tested). The worker imports
  it via `import … with { type: "json" }` (esbuild inlines; `tsc` emits it to `dist/` with
  `resolveJsonModule`, so the node path resolves it too — no copy step)
- [x] 1.2 `src/data/flow-source.ts` (`FlowSource`, mirrors `DataSource`): configurable source
  (URL/file) + `fetchImpl` override + **eval-free `collectCuratedFlowErrors`** validation + TTL
  refresh; `ensureLoaded()` then sync `curatedFor(slug)` / `all()`; bundled default when no source
- [x] 1.3 Tests (`test/flow-source.test.mjs`): loads + resolves the bundled overlay; **verbatim
  parity vs the old `provider-flows.ts`**; not-loaded throws; a fetched URL source validates; a
  schema-invalid `flows.json` + a non-OK fetch fail loud. 124 node:test + 6 vitest green

## 2. Wire `getApplicationFlow` to the loaded overlay — #58

- [x] 2.1 `getApplicationFlow(program, flows)` uses `flows.curatedFor(slug)` (same `mergeFlow`);
  removed `ensureCuratedValid` + the bundled `provider-flows.ts` (deleted; validation now lives
  in `FlowSource.load`)
- [x] 2.2 Threaded the `FlowSource` through `operations/flows.ts` + `operations/execute.ts`
  (preloaded via `ensureLoaded()` alongside `DataSource`; `handoff.ts` builds off the flow it's
  handed); `buildApp`/`buildRouter` construct + thread it; `index.ts` (`MAKERPERKS_FLOWS`),
  `worker.ts` + `worker-stateful.ts` (`FLOWS_URL`, cached per isolate) wire the source. Updated
  `flows.test`/`gen-provider-flow-issues.mjs` off the deleted module
- [x] 2.3 Tests: existing flow/pipeline/handoff suites pass unchanged sourced from `flows.json`;
  a new `buildApp` test proves a `flowsSource` override changes the served flow (curated) while
  an absent slug falls back to derived; **both worker entries build with `flows.json` inlined**
  (verified by `wrangler deploy --dry-run`). 125 node:test + 6 vitest green

## 3. Validate + archive — #59

- [x] 3.1 `openspec validate add-flow-documents --strict`; typecheck/lint/both test layers green
  (125 node:test + 6 vitest; both worker bundles dry-run-build)
- [x] 3.2 Archive into `openspec/specs/` (`flow-documents` created; the `application-flows`
  delta applied)
