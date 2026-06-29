// MakerPerks data source — load + validate + refresh the PUBLISHED perks.json.
// Never reads MakerPerks source, never forks, never writes back. See docs/ARCHITECTURE.md §4.
//
// Validation is a small, dependency-free, **eval-free** checker (not ajv): ajv compiles
// schemas via `new Function`, which Cloudflare Workers disallow. We validate the fields we
// depend on and stay lenient to additive upstream fields.

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

/** Normalize the configured feeds (sources, else single `source`, else the default) to FeedConfig[]. */
function normalizeFeeds(opts: DataSourceOptions): Required<FeedConfig>[] {
  const raw = opts.sources?.length ? opts.sources : [opts.source ?? DEFAULT_SOURCE];
  return raw.map((f) => {
    const cfg: FeedConfig = typeof f === "string" ? { source: f } : f;
    return {
      source: cfg.source,
      id: cfg.id ?? deriveFeedId(cfg.source),
      prefix: cfg.prefix ?? "",
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
  private readonly feeds: Required<FeedConfig>[];
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
      };
      let payload: PerksPayload;
      try {
        payload = await this.loadFeed(feed.source);
      } catch (error) {
        if (lone) throw error; // single-source default stays loud
        status.status = "failed";
        status.error = (error as Error).message;
        statuses.push(status);
        continue;
      }
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

  /** Federated directory metadata (the primary feed's meta + the federated count). Feed ids are in
   * `sources()`. Throws if not loaded. */
  meta(): Omit<PerksPayload, "programs"> {
    if (!this.federated || !this.primaryMeta) {
      throw new Error("DataSource not loaded — call load() (or ensureLoaded()) first");
    }
    return { ...this.primaryMeta, count: this.federated.length };
  }

  /** Load + validate a single feed's payload (the per-feed unit of the fail-soft loop). */
  private async loadFeed(source: string): Promise<PerksPayload> {
    const raw = await this.read(source);
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
