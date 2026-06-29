# Tasks — flow-reconcile (#84 / #87)

> **Scope:** an operator-gated `reconcile_flows` that flushes the accepted overlay to a shared KV
> mirror both workers read, so the read-only public endpoint serves operator-blessed flows with no
> redeploy (the DO stays the live layer on the stateful side; reconcile is the deliberate publish),
> plus the documented, server-credential-free operator export-to-PR workflow + MIT extract. Automatic
> reconcile-on-accept, any server-side PR/GitHub-write, and the perks.json side (#88/#89) are **out of
> scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-flow-reconcile --strict` passes;
> typecheck/lint/both test layers green; a non-operator is refused `reconcile_flows` (`FORBIDDEN`); an
> operator reconcile writes the mirror and a read-only-style overlay then serves the blessed flow; the
> mirror read/write + `overlayReader` are unit-tested; op-count/parity assertions updated. One commit
> per section, closing #87 on the last; push on `main` as each section completes.

## 1. Overlay mirror + AcceptedOverlay narrowing + read-only serving

- [x] 1.1 `session/overlay-mirror.ts`: `AcceptedOverlay { accepted() }`; `OverlayMirror { read(); write() }`;
  `kvOverlayMirror(kv, opts?)` (one key, JSON, TTL cache; empty on missing/corrupt),
  `inMemoryOverlayMirror(seed?)`, `overlayReader(mirror)`. `FlowRegistry extends AcceptedOverlay`.
- [x] 1.2 Narrow `operations/flows.ts`, `operations/flow-discovery.ts`, `operations/flow-export.ts`
  from `FlowRegistry` to `AcceptedOverlay` (call sites already pass a `FlowRegistry`).
- [x] 1.3 `AppOptions`/`RouterStores`/`buildRouter`: add `acceptedOverlay?: AcceptedOverlay`; serving
  ops receive `flowRegistry ?? acceptedOverlay`.
- [x] 1.4 Tests: an `acceptedOverlay` (no registry) makes `get_application_flow` / `export_flows`
  serve a blessed flow; precedence (accepted wins over base) holds; mirror read/write round-trips
  + TTL cache + empty-on-corrupt; an empty mirror leaves serving unchanged.

## 2. reconcile_flows op + worker wiring + binding

- [ ] 2.1 `operations/flow-reconcile.ts`: `registerFlowReconcileOperations(router, registry, mirror,
  operator)` → `reconcile_flows` (UPDATE): `FORBIDDEN` for non-operators, else
  `overlay = await registry.accepted(); await mirror.write(overlay)`; return `{ count, slugs }`.
- [ ] 2.2 `buildRouter`: add `overlayMirror?`; register reconcile when `flowRegistry && overlayMirror`.
- [ ] 2.3 `worker-stateful.ts`: bind `OVERLAY_KV`; wire `overlayMirror = kvOverlayMirror(env.OVERLAY_KV)`.
  `worker.ts` (read-only): bind `OVERLAY_KV`; wire `acceptedOverlay = overlayReader(kvOverlayMirror(...))`,
  cached per isolate. Add the `OVERLAY_KV` binding to `wrangler.jsonc` + `wrangler.dev.jsonc`
  (namespace created out-of-band; note the id).
- [ ] 2.4 Tests: a non-operator `reconcile_flows` → `FORBIDDEN`, mirror unchanged; an operator
  reconcile writes the accepted overlay to the mirror and returns the count/slugs; update op-count /
  parity assertions for `reconcile_flows`.

## 3. Export-to-PR workflow + MIT extract; validate + archive

- [ ] 3.1 `scripts/export-flows.mjs`: add `--mit` — strip each Flow Document to its MIT-safe data
  (application steps / submission / instructions), for a data-only upstream PR.
- [ ] 3.2 `docs/flows-roundtrip.md`: add the operator workflow — accept → `reconcile_flows` (public
  serves it) → `export_flows` → `--mit` → one `gh pr create` upstream; reaffirm the server opens no PR.
- [ ] 3.3 `openspec validate add-flow-reconcile --strict`; typecheck/lint/both test layers green.
- [ ] 3.4 Archive into `openspec/specs/` (`flow-reconcile` created); fill the spec `Purpose`.
