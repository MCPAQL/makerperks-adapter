// MakerPerks data source — load + schema-validate + refresh the PUBLISHED perks.json.
// Never reads MakerPerks source, never forks, never writes back. See docs/ARCHITECTURE.md §4.

import { readFile } from "node:fs/promises";
import { Ajv, type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import { perksPayloadSchema } from "./perks.schema.js";

// ajv-formats ships a CJS default export; normalize it for NodeNext ESM interop.
const addFormats = ((
  addFormatsModule as unknown as { default?: typeof addFormatsModule }
).default ?? addFormatsModule) as unknown as (ajv: Ajv) => Ajv;

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

export class DataSource {
  private readonly source: string;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly validate: ValidateFunction<PerksPayload>;
  private payload: PerksPayload | null = null;
  private loadedAt = 0;

  constructor(opts: DataSourceOptions = {}) {
    this.source = opts.source ?? DEFAULT_SOURCE;
    this.ttlMs = opts.ttlMs ?? 0;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    this.validate = ajv.compile<PerksPayload>(perksPayloadSchema);
  }

  /** Force a load from the source, validating against the published-payload schema. */
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
    if (!this.validate(data)) {
      const detail = (this.validate.errors ?? [])
        .map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim())
        .join("; ");
      throw new Error(
        `perks.json failed schema validation (source: ${this.source}): ${detail}`,
      );
    }
    this.payload = data;
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
    return readFile(this.source, "utf8");
  }
}
