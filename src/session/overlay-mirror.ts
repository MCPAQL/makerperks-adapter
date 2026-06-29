// The shared overlay mirror (#87) — the durable home for operator-blessed flows that BOTH the
// stateful and the read-only deployments can read. `reconcile_flows` (operator-gated) writes the
// registry's accepted overlay here; the read-only worker reads it as its accepted overlay and serves
// those flows with no redeploy. Kept pure + runtime-free (a minimal KV-like interface, no Workers
// import) so it is unit-testable off the Workers runtime, like session/flow-registry.ts.
// See openspec/changes/add-flow-reconcile (capability `flow-reconcile`).

import type { CuratedFlows } from "../data/flows.js";

/**
 * The serving dependency: an `accepted()` provider. `FlowRegistry` satisfies it (the live DO overlay
 * on the stateful side); a mirror-backed reader satisfies it on the read-only side. The flow-serving
 * ops depend on THIS, not the full registry, so a registry-less deployment can still serve blessed
 * flows.
 */
export interface AcceptedOverlay {
  accepted(): Promise<CuratedFlows>;
}

/** The shared store the accepted overlay is published to and read from. */
export interface OverlayMirror {
  read(): Promise<CuratedFlows>;
  write(overlay: CuratedFlows): Promise<void>;
}

/** A minimal KV surface (text get/put) — avoids importing the Workers types into a pure module. */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const MIRROR_KEY = "accepted-overlay";

/**
 * A KV-backed mirror. Reads are cached for `ttlMs` (default 60s) so the read-only worker reads at
 * most once per isolate per window — a published, read-mostly overlay, not a per-request read (the
 * 2026-06-28 KV lesson). A malformed/blank value reads as an empty overlay (never throws on serve).
 */
export function kvOverlayMirror(
  kv: KVLike,
  opts: { ttlMs?: number; now?: () => number } = {},
): OverlayMirror {
  const ttlMs = opts.ttlMs ?? 60_000;
  const now = opts.now ?? (() => Date.now());
  let cache: CuratedFlows | null = null;
  let cachedAt = 0;
  return {
    async read() {
      if (cache && now() - cachedAt < ttlMs) return cache;
      const raw = await kv.get(MIRROR_KEY);
      let parsed: CuratedFlows = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw) as CuratedFlows;
        } catch {
          parsed = {}; // a corrupt mirror serves as empty rather than breaking the read path
        }
      }
      cache = parsed;
      cachedAt = now();
      return parsed;
    },
    async write(overlay: CuratedFlows) {
      await kv.put(MIRROR_KEY, JSON.stringify(overlay));
      cache = overlay; // keep this isolate's cache coherent with the write
      cachedAt = now();
    },
  };
}

/** An in-memory mirror for local mode + tests. */
export function inMemoryOverlayMirror(seed: CuratedFlows = {}): OverlayMirror {
  let store: CuratedFlows = { ...seed };
  return {
    async read() {
      return { ...store };
    },
    async write(overlay: CuratedFlows) {
      store = { ...overlay };
    },
  };
}

/** Adapt a mirror to the `AcceptedOverlay` the serving ops consume (read-only side). */
export function overlayReader(mirror: OverlayMirror): AcceptedOverlay {
  return { accepted: () => mirror.read() };
}
