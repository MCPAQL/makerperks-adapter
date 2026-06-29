// Perks-export (#89) — the server as PRODUCER. `export_perks` emits a schema-valid, re-ingestible
// perks.json from the federated directory (#88), so a generated feed is itself an ingestable source
// (the producer/consumer round-trip closes). Read-only and dependent only on `data`, so it is
// available on every deployment. Generating from accepted perk-record contributions is a later input
// (#81); this emits the current directory. See openspec/changes/add-perks-export (capability `perks-export`).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import { collectPayloadErrors, type DataSource } from "../data/source.js";

export function registerPerksExportOperations(router: Router, data: DataSource): void {
  router.register({
    name: "export_perks",
    semanticCategory: "READ",
    description:
      "Emit a schema-valid perks.json from the federated directory (the server as producer): " +
      "{ name, generated, count, programs }. Optionally restrict to one source `feed` or override " +
      "the payload `name`. The internal `feed` provenance tag is stripped, and the payload is " +
      "validated on emit, so the output is a clean, re-ingestible feed.",
    params: {
      name: {
        type: "string",
        required: false,
        description:
          "Override the emitted payload name (default: the directory's name).",
      },
      feed: {
        type: "string",
        required: false,
        description:
          "Export only this source feed's programs (see list_sources for ids).",
      },
    },
    returns: "An object with `count` and the `payload` (a valid perks.json document).",
    handler: async (params) => {
      await data.ensureLoaded();
      const feed = params.feed as string | undefined;
      const name = params.name as string | undefined;
      // Strip the server-set provenance tag so the emitted feed is clean + round-trip-stable.
      const programs = data
        .programs()
        .filter((p) => !feed || p.feed === feed)
        .map(({ feed: _feed, ...rest }) => rest);
      const payload = {
        name: name ?? data.meta().name,
        generated: new Date().toISOString(),
        count: programs.length,
        programs,
      };
      // Valid by construction (the inputs were validated on ingest), but verify — never emit a
      // malformed feed.
      const errors = collectPayloadErrors(payload);
      if (errors.length > 0) {
        return err("INTERNAL_ERROR", "generated perks.json failed validation", {
          errors: errors.slice(0, 5),
        });
      }
      return ok({ count: programs.length, payload });
    },
  });
}
