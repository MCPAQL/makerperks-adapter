// Per-user program-fit annotations (openspec change per-user-fit-annotations): this user's own
// fit judgments about directory programs — personal data, stored in the per-user record and
// overlaid onto reads for this user only (see operations/read.ts). Modeled on the status-policy
// ops: registered only where a profile store is wired; the anonymous read-only endpoint serves
// no fit at all. Feed-supplied fit is stripped at ingest (data/source.ts), so the ONLY path for
// fit into a response is the session user's own annotations.

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource } from "../data/source.js";
import {
  appendAudit,
  FIT_LEVELS,
  type FitAnnotation,
  type FitLevel,
  type ProfileStore,
  type UserRecord,
} from "../session/profile.js";

export function registerFitOperations(
  router: Router,
  data: DataSource,
  store: ProfileStore,
): void {
  router.register({
    name: "get_fit_annotations",
    semanticCategory: "READ",
    description:
      "This user's own program-fit annotations (slug → fit high|medium|low + note). " +
      "Personal data: only ever this user's, never shared. An annotation whose slug has " +
      "left the directory is still listed (it just stops overlaying).",
    params: {},
    returns: "An object with `count` and `annotations` (slug-keyed).",
    handler: async () => {
      const annotations = (await store.get())?.fitAnnotations ?? {};
      return ok({ count: Object.keys(annotations).length, annotations });
    },
  });

  router.register({
    name: "set_program_fit",
    semanticCategory: "UPDATE",
    description:
      "Record YOUR fit judgment for one directory program (by served slug, e.g. " +
      "'accel:ignition/ai-accelerator-singapore'): fit high|medium|low plus an optional " +
      "free-text note in your own words. Stored per-user and shown back only to you on " +
      "directory reads; never shared, never written to the directory.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The served program slug to annotate.",
      },
      fit: {
        type: "string",
        required: true,
        enum: FIT_LEVELS,
        description: "high | medium | low.",
      },
      note: {
        type: "string",
        required: false,
        description: "Optional note in your own words (why this fit).",
      },
    },
    returns: "An object with the stored `annotation` for that slug.",
    handler: async (params) => {
      const slug = params.slug as string;
      await data.ensureLoaded();
      if (!data.programs().some((p) => p.slug === slug)) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      const annotation: FitAnnotation = {
        fit: params.fit as FitLevel,
        ...(params.note !== undefined ? { note: params.note as string } : {}),
        updatedAt: Date.now(),
      };
      const record: UserRecord = (await store.get()) ?? {};
      const fitAnnotations = { ...record.fitAnnotations, [slug]: annotation };
      await store.set(
        appendAudit({ ...record, fitAnnotations }, "set_program_fit", slug),
      );
      return ok({ slug, annotation });
    },
  });

  router.register({
    name: "clear_program_fit",
    semanticCategory: "DELETE",
    description: "Remove your fit annotation for one program slug.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The annotated program slug to clear.",
      },
    },
    returns: "An object with `cleared` (whether an annotation existed).",
    handler: async (params) => {
      const slug = params.slug as string;
      const record: UserRecord = (await store.get()) ?? {};
      const existing = record.fitAnnotations?.[slug];
      if (!existing) return ok({ cleared: false, slug });
      const fitAnnotations = { ...record.fitAnnotations };
      delete fitAnnotations[slug];
      await store.set(
        appendAudit({ ...record, fitAnnotations }, "clear_program_fit", slug),
      );
      return ok({ cleared: true, slug });
    },
  });
}
