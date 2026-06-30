// MakerPerks data source — load + validate + refresh the PUBLISHED perks.json.
// Never reads MakerPerks source, never forks, never writes back. See docs/ARCHITECTURE.md §4.
//
// Validation is a small, dependency-free, **eval-free** checker (not ajv): ajv compiles
// schemas via `new Function`, which Cloudflare Workers disallow. We validate the fields we
// depend on and stay lenient to additive upstream fields.

import { sha256Hex } from "./untrusted.js";

export interface PerkProgram {
  slug: string;
  title: string;
  provider: string;
  url: string;
  audience: string[];
  max_value: number;
  sources: string[];
  verified: string;
  tags?: string[];
  value_type?: "credits" | "discount" | "free_tier";
  currency?: string;
  min_value?: number;
  value_display?: string;
  region?: string;
  status?: "Active" | "Discontinued" | "Beta" | "Upcoming";
  aggregator?: boolean;
  unlocks?: string[];
  /** Server-set provenance (#88): the id of the feed this program was ingested from. */
  feed?: string;
}

export interface PerksPayload {
  name: string;
  programs: PerkProgram[];
  description?: string;
  homepage?: string;
  generated?: string;
  count?: number;
}

/** One federated feed (#88): a URL/path, with an optional id and an optional slug prefix. */
export interface FeedConfig {
  /** A stable feed id (provenance tag). Derived from the URL host / filename stem when omitted. */
  id?: string;
  /** A live published URL or a local file path. */
  source: string;
  /** When set, this feed's slugs become `prefix:slug` (isolated — cannot collide with other feeds). */
  prefix?: string;
  /**
   * #97 trust classification. The primary feed (index 0) defaults to `trusted`; any additional
   * federated feed defaults to `untrusted` unless set here. An `untrusted` feed's programs never
   * take the credential auto-expose path.
   */
  trust?: "trusted" | "untrusted";
  /** #97: sha256 hex of the raw body. When set, verified on load; a mismatch drops the feed fail-soft. */
  integrity?: string;
  /** #97 (reserved): detached signature, base64. Typed for signed feeds; not yet verified. */
  signature?: string;
  /** #97 (reserved): public key, base64, paired with `signature`. Not yet verified. */
  publicKey?: string;
}

/** A feed normalized for loading: ids/prefix/trust resolved; optional integrity carried through. */
interface NormalizedFeed {
  id: string;
  source: string;
  prefix: string;
  trust: "trusted" | "untrusted";
  /** Whether `trust` was set explicitly in config (vs. the positional default) — an explicit value
   *  is never auto-upgraded by a verifying `integrity`. */
  trustExplicit: boolean;
  integrity?: string;
  signature?: string;
  publicKey?: string;
}

/** Per-feed load + federation health, surfaced via `list_sources` (#88). */
export interface FeedStatus {
  id: string;
  source: string;
  prefix?: string;
  status: "ok" | "failed";
  count: number;
  error?: string;
  collisions_dropped: number;
  /** #97: the feed's effective trust after load (a verified integrity upgrades to `trusted`). */
  trust: "trusted" | "untrusted";
}

export interface DataSourceOptions {
  /** A live published URL or a local file path. Defaults to the live MakerPerks endpoint. */
  source?: string;
  /** One or many feeds to federate (#88), in priority order. Takes precedence over `source`. */
  sources?: (string | FeedConfig)[];
  /** Auto-reload if cached data is older than this (ms). 0 = never auto-reload. */
  ttlMs?: number;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_SOURCE = "https://www.makerperks.com/perks.json";

/** Derive a feed id from a URL host or a file's stem, when no explicit id is configured. */
function deriveFeedId(source: string): string {
  try {
    return new URL(source).host;
  } catch {
    const stem = source.split(/[/\\]/).pop() ?? source;
    return stem.replace(/\.json$/i, "") || source;
  }
}

/**
 * Parse a multi-source env value (#88 deploy config) into a feed list. Two forms:
 *  - a JSON array of feeds: `[{"id":"grants","source":"https://…/grants.json","prefix":"grants"}, …]`
 *    (or bare strings in the array);
 *  - a comma-separated list of URLs/paths: `https://a/perks.json, ./grants.json`.
 * Returns `[]` for a blank value (the caller then falls back to a single source / the default).
 */
export function parseSourcesEnv(raw: string): (string | FeedConfig)[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) {
      throw new Error("sources env JSON must be an array of feeds");
    }
    return arr as (string | FeedConfig)[];
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize the configured feeds (sources, else single `source`, else the default) to NormalizedFeed[]. */
function normalizeFeeds(opts: DataSourceOptions): NormalizedFeed[] {
  const raw = opts.sources?.length ? opts.sources : [opts.source ?? DEFAULT_SOURCE];
  return raw.map((f, idx) => {
    const cfg: FeedConfig = typeof f === "string" ? { source: f } : f;
    // #97: the primary feed (operator's deliberate choice, incl. the default) is trusted; any
    // additional federated feed is untrusted unless the operator marks it otherwise.
    const trust = cfg.trust ?? (idx === 0 ? "trusted" : "untrusted");
    return {
      source: cfg.source,
      id: cfg.id ?? deriveFeedId(cfg.source),
      prefix: cfg.prefix ?? "",
      trust,
      trustExplicit: cfg.trust !== undefined,
      ...(cfg.integrity !== undefined ? { integrity: cfg.integrity } : {}),
      ...(cfg.signature !== undefined ? { signature: cfg.signature } : {}),
      ...(cfg.publicKey !== undefined ? { publicKey: cfg.publicKey } : {}),
    };
  });
}

const STATUSES = ["Active", "Discontinued", "Beta", "Upcoming"];
const VALUE_TYPES = ["credits", "discount", "free_tier"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Collect human-readable validation errors for the published perks.json payload. */
export function collectPayloadErrors(data: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(data)) return ["/ payload must be an object"];
  if (typeof data.name !== "string") errors.push("/name must be a string");
  if (!Array.isArray(data.programs)) {
    errors.push("/programs must be an array");
    return errors;
  }

  data.programs.forEach((program: unknown, i: number) => {
    const at = `/programs/${i}`;
    if (!isObject(program)) {
      errors.push(`${at} must be an object`);
      return;
    }
    for (const key of ["slug", "title", "provider", "url", "verified"]) {
      if (typeof program[key] !== "string")
        errors.push(`${at}/${key} must be a string`);
    }
    if (typeof program.max_value !== "number" || !Number.isFinite(program.max_value)) {
      errors.push(`${at}/max_value must be a number`);
    }
    if (!isStringArray(program.audience))
      errors.push(`${at}/audience must be a string[]`);
    if (!isStringArray(program.sources))
      errors.push(`${at}/sources must be a string[]`);
    if (program.tags !== undefined && !isStringArray(program.tags)) {
      errors.push(`${at}/tags must be a string[]`);
    }
    if (program.unlocks !== undefined && !isStringArray(program.unlocks)) {
      errors.push(`${at}/unlocks must be a string[]`);
    }
    if (
      program.value_type !== undefined &&
      !VALUE_TYPES.includes(program.value_type as string)
    ) {
      errors.push(`${at}/value_type must be one of ${VALUE_TYPES.join(", ")}`);
    }
    if (program.status !== undefined && !STATUSES.includes(program.status as string)) {
      errors.push(`${at}/status must be one of ${STATUSES.join(", ")}`);
    }
    if (program.currency !== undefined && typeof program.currency !== "string") {
      errors.push(`${at}/currency must be a string`);
    }
    if (program.min_value !== undefined && typeof program.min_value !== "number") {
      errors.push(`${at}/min_value must be a number`);
    }
    if (program.region !== undefined && typeof program.region !== "string") {
      errors.push(`${at}/region must be a string`);
    }
    if (
      program.value_display !== undefined &&
      typeof program.value_display !== "string"
    ) {
      errors.push(`${at}/value_display must be a string`);
    }
    if (program.aggregator !== undefined && typeof program.aggregator !== "boolean") {
      errors.push(`${at}/aggregator must be a boolean`);
    }
  });

  return errors;
}

export class DataSource {
  private readonly feeds: NormalizedFeed[];
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  // Federated, deduped programs + per-feed health + the primary feed's meta. Null until loaded.
  private federated: PerkProgram[] | null = null;
  private feedStatuses: FeedStatus[] = [];
  private primaryMeta: Omit<PerksPayload, "programs"> | null = null;
  private loadedAt = 0;

  constructor(opts: DataSourceOptions = {}) {
    this.feeds = normalizeFeeds(opts);
    this.ttlMs = opts.ttlMs ?? 0;
    // Wrap (don't store a bare `fetch` reference) — on Workers a detached global
    // fetch throws "Illegal invocation" when called with the wrong `this`.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /**
   * Load + federate all feeds. Each feed loads independently and FAIL-SOFT: a failing feed is
   * recorded (`status: "failed"`) and contributes nothing, the rest serve — UNLESS exactly one feed
   * is configured, in which case a failure throws (never silently serve an empty directory). On
   * success, each program is tagged with its feed id (provenance) and, if the feed has a prefix, its
   * slug is rewritten `prefix:slug`. Programs federate in priority order with first-wins dedupe.
   */
  async load(): Promise<void> {
    const lone = this.feeds.length === 1;
    const statuses: FeedStatus[] = [];
    const bySlug = new Map<string, PerkProgram>();
    let primaryMeta: Omit<PerksPayload, "programs"> | null = null;

    for (const feed of this.feeds) {
      const status: FeedStatus = {
        id: feed.id,
        source: feed.source,
        ...(feed.prefix ? { prefix: feed.prefix } : {}),
        status: "ok",
        count: 0,
        collisions_dropped: 0,
        trust: feed.trust,
      };
      let payload: PerksPayload;
      try {
        payload = await this.loadFeed(feed);
      } catch (error) {
        if (lone) throw error; // single-source default stays loud
        status.status = "failed";
        status.error = (error as Error).message;
        statuses.push(status);
        continue;
      }
      // #97: a feed whose declared integrity verified (loadFeed didn't throw) is trusted — but an
      // EXPLICIT `trust` in config always wins (so `{ trust: "untrusted", integrity }` stays untrusted:
      // pin for reproducibility without granting the credential-exposure path).
      if (feed.integrity && !feed.trustExplicit) status.trust = "trusted";
      const { programs: _p, ...meta } = payload;
      if (!primaryMeta) primaryMeta = meta; // the highest-priority OK feed's meta
      for (const program of payload.programs) {
        const slug = feed.prefix ? `${feed.prefix}:${program.slug}` : program.slug;
        if (bySlug.has(slug)) {
          status.collisions_dropped += 1; // a higher-priority feed already owns this slug
          continue;
        }
        bySlug.set(slug, { ...program, slug, feed: feed.id }); // server-set provenance + prefix
        status.count += 1;
      }
      statuses.push(status);
    }

    this.federated = [...bySlug.values()];
    this.feedStatuses = statuses;
    this.primaryMeta = primaryMeta ?? { name: "directory" };
    this.loadedAt = Date.now();
  }

  /** Re-load on demand. */
  async refresh(): Promise<void> {
    await this.load();
  }

  /** Load if never loaded, or reload if the TTL has elapsed. */
  async ensureLoaded(): Promise<void> {
    if (!this.federated) {
      await this.load();
      return;
    }
    if (this.ttlMs > 0 && Date.now() - this.loadedAt > this.ttlMs) {
      await this.load();
    }
  }

  /** The federated, deduped programs. Throws if not loaded. */
  programs(): PerkProgram[] {
    if (!this.federated) {
      throw new Error("DataSource not loaded — call load() (or ensureLoaded()) first");
    }
    return this.federated;
  }

  /** Per-feed load + federation health (#88). Throws if not loaded. */
  sources(): FeedStatus[] {
    if (!this.federated) {
      throw new Error("DataSource not loaded — call load() (or ensureLoaded()) first");
    }
    return this.feedStatuses;
  }

  /**
   * #97: the effective trust of the feed a program was ingested from (`PerkProgram.feed`). An
   * unknown / missing feed id is treated as `untrusted` (fail-safe — it never auto-exposes a
   * credential). Used by the submission path to gate the credential auto-expose.
   */
  feedTrust(feedId?: string): "trusted" | "untrusted" {
    if (!feedId) return "untrusted";
    // Resolve across ALL statuses sharing this id (ids can collide when two feeds derive the same id
    // from the same host). Fail-safe: `trusted` only if EVERY feed with this id is trusted — an
    // untrusted feed sharing an id with a trusted one never grants the credential auto-expose path.
    const matches = this.feedStatuses.filter((s) => s.id === feedId);
    if (matches.length === 0) return "untrusted";
    return matches.every((s) => s.trust === "trusted") ? "trusted" : "untrusted";
  }

  /** Federated directory metadata (the primary feed's meta + the federated count). Feed ids are in
   * `sources()`. Throws if not loaded. */
  meta(): Omit<PerksPayload, "programs"> {
    if (!this.federated || !this.primaryMeta) {
      throw new Error("DataSource not loaded — call load() (or ensureLoaded()) first");
    }
    return { ...this.primaryMeta, count: this.federated.length };
  }

  /** Load + (optionally) integrity-verify + validate a single feed's payload (the fail-soft unit). */
  private async loadFeed(feed: NormalizedFeed): Promise<PerksPayload> {
    const source = feed.source;
    const raw = await this.read(source);
    // #97: when a feed pins an integrity hash, verify the raw body before trusting its contents. A
    // mismatch throws — the fail-soft loop then drops the feed (or, for a lone feed, stays loud).
    if (feed.integrity) {
      const actual = await sha256Hex(raw);
      if (actual.toLowerCase() !== feed.integrity.trim().toLowerCase()) {
        throw new Error(
          `feed integrity mismatch (source: ${source}): expected ${feed.integrity}, got ${actual}`,
        );
      }
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `perks.json is not valid JSON (source: ${source}): ${(error as Error).message}`,
        { cause: error },
      );
    }
    const errors = collectPayloadErrors(data);
    if (errors.length > 0) {
      throw new Error(
        `perks.json failed schema validation (source: ${source}): ${errors
          .slice(0, 5)
          .join("; ")}`,
      );
    }
    return data as PerksPayload;
  }

  private async read(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source)) {
      const res = await this.fetchImpl(source);
      if (!res.ok) {
        throw new Error(
          `failed to fetch perks.json (${res.status} ${res.statusText}) from ${source}`,
        );
      }
      return res.text();
    }
    // Lazy so URL sources (e.g. on Cloudflare Workers) never bundle node:fs.
    const { readFile } = await import("node:fs/promises");
    return readFile(source, "utf8");
  }
}
