# Tasks — flow-export (#84 / #85 + #86)

> **Scope:** the read-out half of the flows.json round-trip — an `export_flows` READ op that emits
> the effective curated overlay (`flows.json` base ⊕ registry accepted overlay, accepted wins) as a
> portable `flows.json` document with a per-slug source breakdown (#85), plus the dev export script
> and the documented co-maintenance loop (#86). Reconciling the accepted overlay back into the
> durable file (#87) and the perks.json side (#88/#89) are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-flow-export --strict` passes;
> typecheck/lint/both test layers green; `export_flows` is introspectable as READ on every
> deployment including the read-only endpoint; the merge precedence + source breakdown are
> unit-tested (base-only, accepted-wins, accepted-only). One commit per section, closing its issue;
> push on `main` as each section completes.

## 1. export_flows op + source breakdown (#85)

- [x] 1.1 `operations/flow-export.ts`: `registerFlowExportOperations(router, flows, registry?)`
  registering `export_flows` (READ). Result `{ count, flows, sources }` — `flows` is
  `{ ...flows.all(), ...(await registry?.accepted() ?? {}) }` (accepted wins); `sources[slug]` is
  `"accepted"` when the slug is in the accepted overlay, else `"base"`. No params.
- [x] 1.2 `buildRouter` registers it unconditionally with `flows` + `options.flowRegistry` (absent
  on the read-only worker → exports the loaded overlay, all `"base"`).
- [x] 1.3 Tests (`node:test` against `dist/`): no registry → exports `flows.all()`, every slug
  `"base"`, `count` matches; a registry with an accepted entry for a new slug → it appears, source
  `"accepted"`, count grows; an accepted entry overriding a base slug → accepted value wins, source
  `"accepted"`, count unchanged; the op is introspectable as READ.
- [x] 1.4 Update the op-count assertions (`test/transports.test.mjs`, `test/router.test.mjs` READ
  list) for the new op.

## 2. Export script + round-trip doc (#86)

- [x] 2.1 `scripts/export-flows.mjs` (dev tooling, never bundled): produce a `flows.json` from the
  effective overlay — load a `FlowSource` locally, and/or call the `export_flows` op against a
  configured deployment URL — and write it to a path. Eval-free, no provider SDK.
- [x] 2.2 Document the round-trip in `docs/` (or the README): export → external edit → host at
  `FLOWS_URL` / commit the file → `FlowSource` ingests; note the runtime accepted overlay still
  layers on top until #87 reconciles it.

## 3. Validate + archive

- [ ] 3.1 `openspec validate add-flow-export --strict`; typecheck/lint/both test layers green.
- [ ] 3.2 Archive into `openspec/specs/` (`flow-export` created); fill the spec `Purpose`.
