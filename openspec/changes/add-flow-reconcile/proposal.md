## Why

The last piece of the flows.json portability story (#87, epic #84). Today an operator's accepted
flows live only in the stateful worker's registry Durable Object and are served live *there* — but
the **read-only public endpoint** (`makerperks.mcpaql.com`, no registry) cannot see them, and the
committed `flows.json` never changes. So a blessed flow is invisible to the cheap public endpoint
and to any external consumer until someone manually re-publishes.

`reconcile_flows` closes that: an **operator-gated** operation (under #90) that flushes the registry's
accepted overlay into a **shared KV mirror** both workers can read. The read-only worker layers that
mirror as its accepted overlay, so the public endpoint serves operator-blessed flows **with no
redeploy** — and the publish is a *deliberate* operator act (the DO stays the always-live layer on
the stateful side; the public endpoint reflects what the operator chose to publish). The export →
PR half stays out of the server entirely: the operator pulls the effective overlay (`export_flows`)
and opens one PR upstream with their own `gh`, including the MIT-safe extract for Nate.

This honors the invariant (the server never initiates a state-changing outbound call): the KV write
is an internal durable write triggered by the operator's own `reconcile_flows`, and the only
GitHub-touching step is the operator's own `gh`.

## What Changes

- **`reconcile_flows()` (UPDATE, operator-gated):** reads `registry.accepted()` and writes it to the
  shared overlay mirror; returns `{ count, slugs }`. A non-operator gets `FORBIDDEN` (per #90).
  Registered only where both a registry and a mirror are wired (the stateful worker).
- **A shared overlay mirror** (`OverlayMirror`: `read()` / `write()`), KV-backed on Workers
  (`kvOverlayMirror`) and in-memory for tests. One new KV namespace (`OVERLAY_KV`) bound on both
  workers (read-mostly published overlay, load-once + TTL — KV on the merits).
- **The read-only worker serves the mirror:** the flow-serving ops are narrowed to depend on an
  `AcceptedOverlay` (`accepted(): Promise<CuratedFlows>`) — which `FlowRegistry` already satisfies —
  so the read-only worker can supply a KV-mirror-backed overlay (no registry) and serve blessed
  flows. The precedence is unchanged: derived ⊕ flows.json ⊕ accepted-overlay.
- **Export-to-PR workflow (operator-run, documented):** extend `docs/flows-roundtrip.md` with the
  operator path — `export_flows` → curate → one `gh pr create` upstream — and the **MIT-safe
  `steps_to_apply` extract** for Nate (data only; no AGPL), surfaced via an `export-flows.mjs --mit`
  filter.

## Capabilities

### New Capabilities

- `flow-reconcile`: an operator-gated `reconcile_flows` that flushes the accepted overlay to a shared
  KV mirror both workers read, so the read-only public endpoint serves operator-blessed flows with no
  redeploy — plus the documented, server-credential-free operator export-to-PR workflow.

## Impact

- **Affected specs:** `flow-reconcile` (new). Depends on `operator-authorization` (#90) for the gate,
  `flow-acceptance`/#64 for `registry.accepted()`, and `flow-export` (#85) for the effective overlay.
- **Affected code:** narrow the three serving ops (`operations/flows.ts`, `operations/flow-discovery.ts`,
  `operations/flow-export.ts`) from `FlowRegistry` to a new `AcceptedOverlay` type; a new
  `session/overlay-mirror.ts` (`OverlayMirror` + `kvOverlayMirror` + `inMemoryOverlayMirror`); a new
  `operations/flow-reconcile.ts` (`reconcile_flows`); `AppOptions`/`buildRouter` gain
  `acceptedOverlay?` (serving) + `overlayMirror?` (reconcile); both worker entries bind `OVERLAY_KV`
  (read-only reads it as the accepted overlay, stateful wires the mirror for reconcile); `export-flows.mjs`
  gains `--mit`; `docs/flows-roundtrip.md` gains the operator workflow.
- **Non-goals / tracked follow-up:** automatic reconcile-on-accept (deliberately an explicit operator
  op); a server-side PR / GitHub write credential (**excluded by the invariant**); multi-source
  perks.json (#88) and MCP-generated perks.json (#89).
