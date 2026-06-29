# Design — flow-export (#84 / #85 + #86)

## Context

`FlowSource.all()` and `registry.accepted()` are both `Record<string, CuratedFlow>` (= `FlowDocuments`
= `CuratedFlows`). `getApplicationFlow` already merges them per-slug as **derived ⊕ flows.json ⊕
accepted** (accepted wins). Export is the same precedence at the *overlay* level (skipping the
derived baseline — export emits the curated overlay, not the runtime-derived full flow), surfaced
as a portable document.

## Decisions

- **One op, no params.** `export_flows()` takes nothing and always returns the source breakdown.
  The breakdown is cheap (one extra string per slug) and makes the export auditable, so there is no
  reason to gate it behind a param. (Considered `include_source`; rejected as needless surface.)
- **Effective overlay = base ⊕ accepted, accepted wins.** Mirrors the serving precedence so the
  export is exactly what the server would serve as the curated layer. A slug present in both is
  marked `"accepted"` (it is the accepted value that is served).
- **Registry optional; degrade cleanly.** With no registry (the stateless read-only worker), export
  is just `flowSource.all()`, every slug `"base"`. This keeps the op available on **every**
  deployment — like the discovery toolkit — rather than gating it behind the stateful worker.
- **READ, not EXECUTE.** No mutation, no danger, no confirmation. Introspectable as READ.
- **No reconcile here.** Export does not write the file or fold accepted into the base. Whether the
  file becomes the durable source of truth (writable overlay store vs. PR/commit) is the real
  decision of #87 and is deliberately out of scope.

## Shape

```ts
// operations/flow-export.ts
export function registerFlowExportOperations(
  router: Router,
  flows: FlowSource,
  registry?: FlowRegistry,
): void
// export_flows -> ok({ count, flows: CuratedFlows, sources: Record<string,"base"|"accepted"> })
```

`buildRouter` registers it unconditionally with `flows` + `options.flowRegistry` (undefined on the
read-only worker), alongside the discovery toolkit.

## Script (#86)

`scripts/export-flows.mjs` is dev tooling (never bundled), peer to `gen-provider-flow-issues.mjs`.
It loads the data layer (a `FlowSource`, and — when pointed at a stateful deployment — calls the
`export_flows` op over the wire) and writes a `flows.json`. The documented loop: export → edit →
`FLOWS_URL`/commit → `FlowSource` ingests; the accepted overlay still layers on top until #87
reconciles it.
