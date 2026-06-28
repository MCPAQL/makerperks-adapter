// FlowSource — loads the curated application-flow overlay (per-perk Flow Documents) from a
// flows.json: fetched from FLOWS_URL on the hosted worker, read from a file/URL locally, or the
// bundled default so an overlay is always available out of the box. Mirrors DataSource and
// reuses the eval-free collectCuratedFlowErrors validator (which was written to also guard a
// fetched overlay — this is that). See openspec/changes/add-flow-documents (#47 piece A).

import bundled from "./flows.json" with { type: "json" };
import { collectCuratedFlowErrors, type CuratedFlow } from "./flows.js";

/** The curated overlay collection: a map of perk slug → Flow Document (a partial flow). */
export type FlowDocuments = Record<string, CuratedFlow>;

// The bundled default — compiled into the worker bundle (no filesystem needed) and the
// out-of-the-box overlay when no source is configured.
const bundledFlowDocuments = bundled as unknown as FlowDocuments;

export interface FlowSourceOptions {
  /** A flows.json URL or local file path. When unset, the bundled default is used. */
  source?: string;
  /** Auto-reload if cached data is older than this (ms). 0 = never auto-reload. */
  ttlMs?: number;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
}

export class FlowSource {
  private readonly source?: string;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private documents: FlowDocuments | null = null;
  private loadedAt = 0;

  constructor(opts: FlowSourceOptions = {}) {
    this.source = opts.source;
    this.ttlMs = opts.ttlMs ?? 0;
    // Wrap (don't store a bare `fetch`) — a detached global fetch throws on Workers.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** Force a load — from the configured source, or the bundled default — validating the overlay. */
  async load(): Promise<void> {
    let documents: FlowDocuments;
    if (this.source === undefined) {
      documents = bundledFlowDocuments;
    } else {
      const raw = await this.read();
      try {
        documents = JSON.parse(raw) as FlowDocuments;
      } catch (error) {
        throw new Error(
          `flows.json is not valid JSON (source: ${this.source}): ${(error as Error).message}`,
          { cause: error },
        );
      }
    }
    const errors = collectCuratedFlowErrors(documents);
    if (errors.length > 0) {
      throw new Error(
        `flows.json failed schema validation (source: ${this.source ?? "bundled"}): ${errors
          .slice(0, 5)
          .join("; ")}`,
      );
    }
    this.documents = documents;
    this.loadedAt = Date.now();
  }

  /** Re-load on demand. */
  async refresh(): Promise<void> {
    await this.load();
  }

  /** Load if never loaded, or reload if the TTL has elapsed. */
  async ensureLoaded(): Promise<void> {
    if (!this.documents) {
      await this.load();
      return;
    }
    if (this.ttlMs > 0 && Date.now() - this.loadedAt > this.ttlMs) {
      await this.load();
    }
  }

  /** The curated overlay for a slug, or undefined if none. Throws if not loaded. */
  curatedFor(slug: string): CuratedFlow | undefined {
    if (!this.documents) {
      throw new Error("FlowSource not loaded — call ensureLoaded() first");
    }
    return this.documents[slug];
  }

  /** All loaded Flow Documents. Throws if not loaded. */
  all(): FlowDocuments {
    if (!this.documents) {
      throw new Error("FlowSource not loaded — call ensureLoaded() first");
    }
    return this.documents;
  }

  private async read(): Promise<string> {
    const src = this.source as string;
    if (/^https?:\/\//i.test(src)) {
      const res = await this.fetchImpl(src);
      if (!res.ok) {
        throw new Error(
          `failed to fetch flows.json (${res.status} ${res.statusText}) from ${src}`,
        );
      }
      return res.text();
    }
    // Lazy so URL sources (e.g. on Cloudflare Workers) never bundle node:fs.
    const { readFile } = await import("node:fs/promises");
    return readFile(src, "utf8");
  }
}
