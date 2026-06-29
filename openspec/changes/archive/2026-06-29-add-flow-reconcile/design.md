# Design — flow-reconcile (#84 / #87)

## Context

The stateful worker serves accepted flows live from the registry DO (`registry.accepted()`); the
read-only worker has no registry and serves only base flows.json. The three serving ops
(`flows.ts`, `flow-discovery.ts`, `flow-export.ts`) each take `registry?: FlowRegistry` and call only
`registry.accepted()`. `getApplicationFlow(program, flows, accepted?)` already merges derived ⊕
flows.json ⊕ accepted (accepted wins).

## Decisions

- **Reconcile is an explicit operator op, not write-through (option A).** `accept_flow` stays a single
  atomic DO write. The operator runs `reconcile_flows` to *publish* the current accepted overlay to
  the shared mirror — a deliberate "make this public" gate. This decouples accept from the second
  store, avoids cross-binding coupling inside the DO accept, and matches the operator-curates model.
- **A shared KV mirror, read by both workers.** The mirror holds the accepted overlay (`CuratedFlows`)
  under one key. The stateful worker writes it (on `reconcile_flows`); both workers read it. KV is
  right here: read-mostly, load-once + TTL — the on-the-merits use, not the incident's per-request
  reads. The read-only worker caches it per isolate like it caches the router.
- **Mirror = accepted overlay only, layered (not the full effective overlay).** Writing only the
  accepted map and layering it over each worker's own base flows.json keeps precedence correct even
  if the bundled base diverges from when the mirror was written (a base entry updated by redeploy is
  not shadowed by a stale snapshot). The read-only worker thus serves *its* base ⊕ the mirror.
- **Narrow the serving dependency to `AcceptedOverlay`.** `interface AcceptedOverlay { accepted():
  Promise<CuratedFlows> }`; `FlowRegistry extends AcceptedOverlay`. The three serving ops take
  `AcceptedOverlay` (a supertype — all existing call sites still pass a `FlowRegistry`). The
  read-only worker supplies a mirror-backed `AcceptedOverlay` with **no** queue. Acceptance ops keep
  needing the full `FlowRegistry`.
- **`reconcile_flows` is operator-gated (#90).** Same `operator` flag as `accept_flow`; non-operator
  → `FORBIDDEN`. Registered only when both a registry (to read) and a mirror (to write) are wired —
  the stateful worker. UPDATE semantics (it republishes a shared resource).
- **Read-only worker stays hardened.** It binds `OVERLAY_KV` read-side only and reads it once per
  isolate (TTL-refreshed), so no per-request KV storm (the 2026-06-28 lesson). It gains no registry,
  no acceptance, no reconcile — only the ability to *serve* what an operator published.
- **Export-to-PR stays out of the server.** No new server GitHub code. `export-flows.mjs` gains a
  `--mit` filter that strips a Flow Document to its MIT-safe data (the `steps_to_apply` /
  `submission` / `instructions` fields — the application steps), so the operator can open one curated
  PR of data-only changes to Nate's MIT directory. Documented in `docs/flows-roundtrip.md`.

## Shape

```ts
// session/overlay-mirror.ts
export interface AcceptedOverlay { accepted(): Promise<CuratedFlows> }      // serving dependency
export interface OverlayMirror {                                            // the shared store
  read(): Promise<CuratedFlows>;
  write(overlay: CuratedFlows): Promise<void>;
}
export function kvOverlayMirror(kv: KVNamespace, opts?): OverlayMirror       // Workers
export function inMemoryOverlayMirror(seed?): OverlayMirror                  // tests
export function overlayReader(mirror: OverlayMirror): AcceptedOverlay        // { accepted: () => mirror.read() }

// operations/flow-reconcile.ts
registerFlowReconcileOperations(router, registry, mirror, operator)         // reconcile_flows (UPDATE, gated)
```

`buildRouter` options gain `acceptedOverlay?: AcceptedOverlay` (serving when there is no registry)
and `overlayMirror?: OverlayMirror` (the reconcile target). Serving ops receive
`flowRegistry ?? acceptedOverlay`. `reconcile_flows` registers when `flowRegistry && overlayMirror`.

## Worker wiring

- **Stateful:** bind `OVERLAY_KV`; `overlayMirror = kvOverlayMirror(env.OVERLAY_KV)`; pass it +
  the existing registry + `operator`. (Serving still uses the live DO registry, unchanged.)
- **Read-only:** bind `OVERLAY_KV`; `acceptedOverlay = overlayReader(kvOverlayMirror(env.OVERLAY_KV))`;
  cache per isolate. No registry, no reconcile.
- **Local/stdio:** no mirror, no reconcile (serving uses the in-memory registry if any).

## Why not

- **Read-only worker reads the registry DO directly** — rejected: per-request DO reads on the
  hardened public endpoint (cost/latency, the incident pattern), and it removes the deliberate
  publish gate (every accept would instantly hit public). KV + explicit reconcile gives caching and
  curation.
- **Mirror the full effective overlay** — rejected: a stale snapshot could shadow a newer base entry.
  Mirror accepted-only and layer it.
- **Server opens the PR** — rejected by the invariant; the operator runs `gh` themselves.
