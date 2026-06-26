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
}

export interface PerksPayload {
  name: string;
  programs: PerkProgram[];
  description?: string;
  homepage?: string;
  generated?: string;
  count?: number;
}

export interface DataSourceOptions {
  /** A live published URL or a local file path. Defaults to the live MakerPerks endpoint. */
  source?: string;
  /** Auto-reload if cached data is older than this (ms). 0 = never auto-reload. */
  ttlMs?: number;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_SOURCE = "https://www.makerperks.com/perks.json";

const STATUSES = ["Active", "Discontinued", "Beta", "Upcoming"];
const VALUE_TYPES = ["credits", "discount", "free_tier"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Collect human-readable validation errors for the published perks.json payload. */
function collectPayloadErrors(data: unknown): string[] {
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
  private readonly source: string;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private payload: PerksPayload | null = null;
  private loadedAt = 0;

  constructor(opts: DataSourceOptions = {}) {
    this.source = opts.source ?? DEFAULT_SOURCE;
    this.ttlMs = opts.ttlMs ?? 0;
    // Wrap (don't store a bare `fetch` reference) — on Workers a detached global
    // fetch throws "Illegal invocation" when called with the wrong `this`.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** Force a load from the source, validating the published payload. */
  async load(): Promise<void> {
    const raw = await this.read();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `perks.json is not valid JSON (source: ${this.source}): ${(error as Error).message}`,
        { cause: error },
      );
    }
    const errors = collectPayloadErrors(data);
    if (errors.length > 0) {
      throw new Error(
        `perks.json failed schema validation (source: ${this.source}): ${errors
          .slice(0, 5)
          .join("; ")}`,
      );
    }
    this.payload = data as PerksPayload;
    this.loadedAt = Date.now();
  }

  /** Re-load on demand. */
  async refresh(): Promise<void> {
    await this.load();
  }

  /** Load if never loaded, or reload if the TTL has elapsed. */
  async ensureLoaded(): Promise<void> {
    if (!this.payload) {
      await this.load();
      return;
    }
    if (this.ttlMs > 0 && Date.now() - this.loadedAt > this.ttlMs) {
      await this.load();
    }
  }

  /** The loaded programs. Throws if not loaded. */
  programs(): PerkProgram[] {
    if (!this.payload) {
      throw new Error("DataSource not loaded — call load() (or ensureLoaded()) first");
    }
    return this.payload.programs;
  }

  /** Payload metadata (everything except the programs array). Throws if not loaded. */
  meta(): Omit<PerksPayload, "programs"> {
    if (!this.payload) {
      throw new Error("DataSource not loaded — call load() (or ensureLoaded()) first");
    }
    const { programs: _programs, ...meta } = this.payload;
    return meta;
  }

  private async read(): Promise<string> {
    if (/^https?:\/\//i.test(this.source)) {
      const res = await this.fetchImpl(this.source);
      if (!res.ok) {
        throw new Error(
          `failed to fetch perks.json (${res.status} ${res.statusText}) from ${this.source}`,
        );
      }
      return res.text();
    }
    // Lazy so URL sources (e.g. on Cloudflare Workers) never bundle node:fs.
    const { readFile } = await import("node:fs/promises");
    return readFile(this.source, "utf8");
  }
}
