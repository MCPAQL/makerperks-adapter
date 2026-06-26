// CRUDE READ family over the directory: list_programs / get_program / search_programs.
// Results carry decision signal (value, audience, verified, redemption URL).
// See docs/ARCHITECTURE.md §1 and the directory-query spec.

import Fuse from "fuse.js";
import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource, PerkProgram } from "../data/source.js";

export function registerReadOperations(router: Router, data: DataSource): void {
  router.register({
    name: "list_programs",
    semanticCategory: "READ",
    description: "List builder-perk programs, optionally filtered.",
    params: {
      audience: {
        type: "string",
        required: false,
        description:
          "Filter by audience/persona (e.g. startup, student, oss, indie, nonprofit).",
      },
      tag: {
        type: "string",
        required: false,
        description: "Filter by tag (e.g. ai, cloud, database).",
      },
      provider: {
        type: "string",
        required: false,
        description: "Filter by provider slug.",
      },
      region: {
        type: "string",
        required: false,
        description: "Filter by region (e.g. global).",
      },
      status: {
        type: "string",
        required: false,
        enum: ["Active", "Discontinued", "Beta", "Upcoming"],
        description: "Filter by program status.",
      },
      min_value: {
        type: "number",
        required: false,
        description: "Only programs whose max_value is at least this.",
      },
      limit: {
        type: "number",
        required: false,
        description: "Maximum number of results.",
      },
    },
    returns:
      "An object with `count` and `programs` (decision-signal fields per program).",
    handler: async (params) => {
      await data.ensureLoaded();
      let results: PerkProgram[] = data.programs();
      const audience = params.audience as string | undefined;
      const tag = params.tag as string | undefined;
      const provider = params.provider as string | undefined;
      const region = params.region as string | undefined;
      const status = params.status as string | undefined;
      const minValue = params.min_value as number | undefined;
      const limit = params.limit as number | undefined;

      if (audience) results = results.filter((p) => p.audience.includes(audience));
      if (tag) results = results.filter((p) => (p.tags ?? []).includes(tag));
      if (provider) results = results.filter((p) => p.provider === provider);
      if (region) results = results.filter((p) => p.region === region);
      if (status) results = results.filter((p) => p.status === status);
      if (minValue !== undefined)
        results = results.filter((p) => p.max_value >= minValue);
      if (limit !== undefined) results = results.slice(0, limit);

      return ok({ count: results.length, programs: results });
    },
  });

  router.register({
    name: "get_program",
    semanticCategory: "READ",
    description: "Get a single program by its slug.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug, e.g. anthropic/anthropic-startup-program.",
      },
    },
    returns: "An object with the full `program` record.",
    handler: async (params) => {
      await data.ensureLoaded();
      const slug = params.slug as string;
      const program = data.programs().find((p) => p.slug === slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      return ok({ program });
    },
  });

  router.register({
    name: "search_programs",
    semanticCategory: "READ",
    description:
      "Fuzzy full-text search across programs (title, provider, tags, slug).",
    params: {
      query: { type: "string", required: true, description: "Free-text query." },
      limit: {
        type: "number",
        required: false,
        description: "Maximum number of results (default 20).",
      },
    },
    returns: "An object with `count` and ranked `programs`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const query = params.query as string;
      const limit = (params.limit as number | undefined) ?? 20;
      const fuse = new Fuse(data.programs(), {
        threshold: 0.4,
        ignoreLocation: true,
        keys: [
          { name: "title", weight: 3 },
          { name: "provider", weight: 2 },
          { name: "tags", weight: 1 },
          { name: "slug", weight: 1 },
        ],
      });
      const results = fuse.search(query, { limit }).map((r) => r.item);
      return ok({ count: results.length, programs: results });
    },
  });
}
