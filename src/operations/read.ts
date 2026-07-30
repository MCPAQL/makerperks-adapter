// CRUDE READ family over the directory: list_programs / get_program / search_programs.
// Results carry decision signal (value, audience, verified, redemption URL).
// See docs/ARCHITECTURE.md §1 and the directory-query spec.

import Fuse from "fuse.js";
import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource, PerkProgram } from "../data/source.js";
import type { ProfileStore } from "../session/profile.js";
import { statusEntryFor } from "../data/status.js";

export function registerReadOperations(
  router: Router,
  data: DataSource,
  // When a per-user store is wired, listings honor that user's status policy (#36 add-directory-
  // status): programs whose status is configured `exclude` are omitted unless `include_inactive`.
  // No store (the read-only endpoint) → the DEFAULT policy excludes nothing.
  store?: ProfileStore,
): void {
  // Drop programs whose status is `exclude` in the session's policy, unless include_inactive.
  const applyStatusExclusion = async (
    programs: PerkProgram[],
    includeInactive: boolean,
  ): Promise<PerkProgram[]> => {
    if (includeInactive || !store) return programs;
    const stored = (await store.get())?.statusPolicy;
    return programs.filter((p) => statusEntryFor(p, stored).listing !== "exclude");
  };
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
      feed: {
        type: "string",
        required: false,
        description:
          "Filter by source feed id (#88 federation; see list_sources for the ids).",
      },
      region: {
        type: "string",
        required: false,
        description: "Filter by region (e.g. global).",
      },
      status: {
        type: "string",
        required: false,
        enum: [
          "Active",
          "Discontinued",
          "Beta",
          "Upcoming",
          "Defunct",
          "Paused",
          "Unverified",
        ],
        description:
          "Filter by program status (the last three are the accelerators-feed vocabulary).",
      },
      min_value: {
        type: "number",
        required: false,
        description: "Only programs whose max_value is at least this.",
      },
      include_inactive: {
        type: "boolean",
        required: false,
        description:
          "Include programs whose status your policy excludes (e.g. Discontinued). Default false.",
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
      const feed = params.feed as string | undefined;
      const region = params.region as string | undefined;
      const status = params.status as string | undefined;
      const minValue = params.min_value as number | undefined;
      const limit = params.limit as number | undefined;

      if (audience) results = results.filter((p) => p.audience.includes(audience));
      if (tag) results = results.filter((p) => (p.tags ?? []).includes(tag));
      if (provider) results = results.filter((p) => p.provider === provider);
      if (feed) results = results.filter((p) => p.feed === feed);
      if (region) results = results.filter((p) => p.region === region);
      if (status) results = results.filter((p) => p.status === status);
      if (minValue !== undefined)
        results = results.filter((p) => p.max_value >= minValue);
      results = await applyStatusExclusion(results, params.include_inactive === true);
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
      feed: {
        type: "string",
        required: false,
        description: "Restrict the search to one source feed id (#88 federation).",
      },
      include_inactive: {
        type: "boolean",
        required: false,
        description:
          "Include programs whose status your policy excludes (e.g. Discontinued). Default false.",
      },
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
      const feed = params.feed as string | undefined;
      const limit = (params.limit as number | undefined) ?? 20;
      let pool = await applyStatusExclusion(
        data.programs(),
        params.include_inactive === true,
      );
      if (feed) pool = pool.filter((p) => p.feed === feed);
      const fuse = new Fuse(pool, {
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

  router.register({
    name: "upcoming_deadlines",
    semanticCategory: "READ",
    description:
      "Programs with an application deadline (`next_deadline`) inside a day window, soonest " +
      "first with days remaining — plus programs that explicitly declare no deadline " +
      "(rolling / apply-anytime). Programs from feeds without deadline fields (e.g. perks) " +
      "never appear.",
    params: {
      within_days: {
        type: "number",
        required: false,
        description: "Deadline window in days from today (default 60, max 730).",
      },
      feed: {
        type: "string",
        required: false,
        description: "Restrict to one source feed id (#88 federation).",
      },
      include_rolling: {
        type: "boolean",
        required: false,
        description:
          "Also list programs explicitly marked rolling (next_deadline: null). Default true.",
      },
      limit: {
        type: "number",
        required: false,
        description: "Maximum dated results (default all in window).",
      },
    },
    returns:
      "An object with `as_of`, `within_days`, `deadlines` (soonest-first, each with " +
      "`days_left`), and `rolling`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const raw = (params.within_days as number | undefined) ?? 60;
      const windowDays = Math.min(Math.max(1, Math.floor(raw)), 730);
      const feed = params.feed as string | undefined;
      const limit = params.limit as number | undefined;
      let pool = await applyStatusExclusion(data.programs(), false);
      if (feed) pool = pool.filter((p) => p.feed === feed);
      // A radar never books the dead: Defunct/Paused are landscape memory, not
      // deadlines. Unverified stays (surfaced via `status` on each entry).
      pool = pool.filter((p) => p.status !== "Defunct" && p.status !== "Paused");
      const asOf = new Date().toISOString().slice(0, 10);
      const dayMs = 24 * 60 * 60 * 1000;
      // Rolling is EXPLICIT (next_deadline: null); an absent field means the feed has no
      // deadline concept at all, so its programs belong in neither list.
      let deadlines = pool
        .filter(
          (p): p is PerkProgram & { next_deadline: string } =>
            typeof p.next_deadline === "string",
        )
        .map((p) => ({
          program: p,
          days_left: Math.round(
            (Date.parse(p.next_deadline) - Date.parse(asOf)) / dayMs,
          ),
        }))
        .filter((d) => d.days_left >= 0 && d.days_left <= windowDays)
        .sort((a, b) => a.days_left - b.days_left)
        .map(({ program, days_left }) => ({
          slug: program.slug,
          title: program.title,
          provider: program.provider,
          feed: program.feed,
          next_deadline: program.next_deadline,
          days_left,
          deadline_note: program.deadline_note ?? undefined,
          status: program.status,
          value_display: program.value_display,
          format: program.format,
          apply_url: program.apply_url ?? program.url,
        }));
      if (limit !== undefined) deadlines = deadlines.slice(0, limit);
      const rolling =
        params.include_rolling === false
          ? []
          : pool
              .filter((p) => p.next_deadline === null)
              .sort((a, b) => (b.max_value ?? 0) - (a.max_value ?? 0))
              .map((p) => ({
                slug: p.slug,
                title: p.title,
                provider: p.provider,
                feed: p.feed,
                status: p.status,
                value_display: p.value_display,
                format: p.format,
                apply_url: p.apply_url ?? p.url,
              }));
      return ok({
        as_of: asOf,
        within_days: windowDays,
        count: deadlines.length,
        deadlines,
        rolling,
      });
    },
  });

  router.register({
    name: "list_sources",
    semanticCategory: "READ",
    description:
      "List the federated directory's source feeds (#88) with per-feed health: id, source, " +
      "optional slug prefix, status (ok/failed), program count, any load error, and how many " +
      "colliding slugs were dropped. How a skipped (failed) feed or a slug collision becomes visible.",
    params: {},
    returns:
      "An object with `count` and `sources` (one health entry per configured feed).",
    handler: async () => {
      await data.ensureLoaded();
      const sources = data.sources();
      return ok({ count: sources.length, sources });
    },
  });
}
