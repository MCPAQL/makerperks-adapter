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

- [ ] 1.1 Define the Flow Document shape (today's `CuratedFlow` + additive `sources[]`); the
  `flows.json` collection format (map slug → document); migrate the 3 curated spikes from
  `provider-flows.ts` into `flows.json` + a bundled default the worker can import without fs
- [ ] 1.2 `src/data/flow-source.ts` (`FlowSource`): configurable source (URL/file) + `fetchImpl`
  override + **eval-free `collectCuratedFlowErrors`** validation + TTL refresh; `ensureLoaded()`
  then sync `curatedFor(slug)`; bundled default fallback when no source is configured
- [ ] 1.3 Unit tests: loads + validates `flows.json`; the 3 spikes merge identically to before;
  a schema-invalid `flows.json` fails loud; `FLOWS_URL` override + bundled fallback both work

## 2. Wire `getApplicationFlow` to the loaded overlay — #58

- [ ] 2.1 `getApplicationFlow(program, flows)` uses `flows.curatedFor(slug)` (same `mergeFlow`);
  remove the bundled `provider-flows.ts` constant import path
- [ ] 2.2 Thread the `FlowSource` through `operations/flows.ts`, `operations/execute.ts`, and
  `operations/handoff.ts` (preloaded via `ensureLoaded()` alongside `DataSource`); `buildRouter`
  constructs it; `index.ts` / `worker.ts` / `worker-stateful.ts` wire `FLOWS_URL`
- [ ] 2.3 Tests: flow ops + pipeline + handoff return identical results sourced from `flows.json`;
  transport/op surface unchanged; both worker entries build

## 3. Validate + archive — #59

- [ ] 3.1 `openspec validate add-flow-documents --strict`; typecheck/lint/both test layers green
- [ ] 3.2 Archive into `openspec/specs/` (`flow-documents` created; the `application-flows`
  delta applied)
