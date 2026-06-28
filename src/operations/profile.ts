// CRUDE maker-profile family (#34): the maker's OWN profile (identity + projects) as a
// first-class Create / Read / Update / Delete entity. Registered ONLY when a ProfileStore is
// wired (stateful endpoint = per-user Durable Object; stdio = in-memory local mode; live
// READ-only worker = not registered). The profile holds NO secrets — that is the credential
// vault (#19, a later section). The application pipeline assembles from this profile (#52).
// See openspec/changes/add-profile-vault (capabilities `maker-profile`, #19 + #34).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import { appendAudit } from "../session/profile.js";
import type {
  MakerProfile,
  ProfileIdentity,
  Project,
  ProfileStore,
  UserRecord,
} from "../session/profile.js";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Whitelist + type-check an identity object (the router only checks the top-level type). */
function cleanIdentity(raw: unknown): { identity?: ProfileIdentity; error?: string } {
  if (raw === undefined) return { identity: undefined };
  if (!isObject(raw)) return { error: "identity must be an object" };
  const identity: ProfileIdentity = {};
  if (raw.name !== undefined) {
    if (typeof raw.name !== "string")
      return { error: "identity.name must be a string" };
    identity.name = raw.name;
  }
  if (raw.email !== undefined) {
    if (typeof raw.email !== "string")
      return { error: "identity.email must be a string" };
    identity.email = raw.email;
  }
  if (raw.location !== undefined) {
    if (!isObject(raw.location))
      return { error: "identity.location must be an object" };
    const loc: { region?: string; country?: string } = {};
    if (raw.location.region !== undefined) {
      if (typeof raw.location.region !== "string")
        return { error: "identity.location.region must be a string" };
      loc.region = raw.location.region;
    }
    if (raw.location.country !== undefined) {
      if (typeof raw.location.country !== "string")
        return { error: "identity.location.country must be a string" };
      loc.country = raw.location.country;
    }
    identity.location = loc;
  }
  if (raw.links !== undefined) {
    if (!Array.isArray(raw.links)) return { error: "identity.links must be an array" };
    const links: { label: string; url: string }[] = [];
    for (const l of raw.links) {
      if (!isObject(l) || typeof l.label !== "string" || typeof l.url !== "string") {
        return { error: "each identity.links entry must be { label, url }" };
      }
      links.push({ label: l.label, url: l.url });
    }
    identity.links = links;
  }
  return { identity };
}

/** Field-wise merge so a partial update never drops the half of `location` it omits. */
function mergeIdentity(base: ProfileIdentity, patch: ProfileIdentity): ProfileIdentity {
  const merged: ProfileIdentity = { ...base, ...patch };
  if (patch.location || base.location) {
    merged.location = { ...base.location, ...patch.location };
  }
  return merged;
}

/** Whitelist + type-check a project object; `name` is required. Id is assigned by the op. */
function cleanProject(raw: unknown): { project?: Omit<Project, "id">; error?: string } {
  if (!isObject(raw)) return { error: "project must be an object" };
  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    return { error: "project.name is required" };
  }
  const project: Omit<Project, "id"> = { name: raw.name };
  if (raw.description !== undefined) {
    if (typeof raw.description !== "string")
      return { error: "project.description must be a string" };
    project.description = raw.description;
  }
  if (raw.url !== undefined) {
    if (typeof raw.url !== "string") return { error: "project.url must be a string" };
    project.url = raw.url;
  }
  if (raw.role !== undefined) {
    if (typeof raw.role !== "string") return { error: "project.role must be a string" };
    project.role = raw.role;
  }
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || !raw.tags.every((t) => typeof t === "string")) {
      return { error: "project.tags must be an array of strings" };
    }
    project.tags = raw.tags;
  }
  return { project };
}

export function registerProfileOperations(router: Router, store: ProfileStore): void {
  // Fetch the existing profile or return a NOT_FOUND error (for ops that require one).
  const requireProfile = async (): Promise<
    { record: UserRecord; profile: MakerProfile } | { error: ReturnType<typeof err> }
  > => {
    const record = (await store.get()) ?? {};
    if (!record.profile) {
      return {
        error: err("NOT_FOUND_RESOURCE", "no maker profile — create one first"),
      };
    }
    return { record, profile: record.profile };
  };

  router.register({
    name: "create_profile",
    semanticCategory: "CREATE",
    description:
      "Create the maker's own profile (identity + projects assembled into applications). " +
      "Holds NO secrets — credentials are a separate vault. Errors if a profile already exists.",
    params: {
      identity: {
        type: "object",
        required: false,
        description:
          "Identity fields: { name?, email?, location?: { region?, country? }, " +
          "links?: [{ label, url }] }. All non-secret.",
      },
    },
    returns: "An object with the created `profile`.",
    handler: async (params) => {
      const record = (await store.get()) ?? {};
      if (record.profile) {
        return err(
          "CONFLICT_EXISTS",
          "a maker profile already exists — update it instead",
        );
      }
      const { identity, error } = cleanIdentity(params.identity);
      if (error) return err("VALIDATION_INVALID_TYPE", error, { param: "identity" });
      const now = Date.now();
      const profile: MakerProfile = {
        identity: identity ?? {},
        projects: [],
        createdAt: now,
        updatedAt: now,
      };
      await store.set(appendAudit({ ...record, profile }, "create_profile"));
      return ok({ profile });
    },
  });

  router.register({
    name: "get_profile",
    semanticCategory: "READ",
    description:
      "Get the maker's own profile (identity + projects). Returns `profile: null` if none " +
      "exists yet — that is a normal state, not an error. Pass include_audit to also return " +
      "the per-user audit log (metadata only — never any secret value).",
    params: {
      include_audit: {
        type: "boolean",
        required: false,
        description:
          "When true, also return the append-only audit log (no secret values).",
      },
    },
    returns:
      "An object with the `profile` (or null), and `audit` when include_audit is set.",
    handler: async (params) => {
      const record = await store.get();
      return ok({
        profile: record?.profile ?? null,
        ...(params.include_audit ? { audit: record?.audit ?? [] } : {}),
      });
    },
  });

  router.register({
    name: "update_profile",
    semanticCategory: "UPDATE",
    description:
      "Update the maker profile's identity fields (merged into the existing identity; " +
      "location merges field-wise). Use add_project / remove_project for projects.",
    params: {
      identity: {
        type: "object",
        required: true,
        description:
          "Identity fields to merge: { name?, email?, location?: { region?, country? }, " +
          "links?: [{ label, url }] }. Provided fields replace; omitted fields are kept.",
      },
    },
    returns: "An object with the updated `profile`.",
    handler: async (params) => {
      const found = await requireProfile();
      if ("error" in found) return found.error;
      const { identity, error } = cleanIdentity(params.identity);
      if (error) return err("VALIDATION_INVALID_TYPE", error, { param: "identity" });
      const profile: MakerProfile = {
        ...found.profile,
        identity: mergeIdentity(found.profile.identity, identity ?? {}),
        updatedAt: Date.now(),
      };
      await store.set(appendAudit({ ...found.record, profile }, "update_profile"));
      return ok({ profile });
    },
  });

  router.register({
    name: "add_project",
    semanticCategory: "UPDATE",
    description:
      "Add a project to the maker profile (e.g. DollhouseMCP, MCP-AQL) — what applications " +
      "reference. Returns the assigned project_id.",
    params: {
      project: {
        type: "object",
        required: true,
        description: "{ name (required), description?, url?, role?, tags?: string[] }.",
      },
    },
    returns: "An object with the updated `profile` and the new `project_id`.",
    handler: async (params) => {
      const found = await requireProfile();
      if ("error" in found) return found.error;
      const { project, error } = cleanProject(params.project);
      if (error || !project)
        return err("VALIDATION_INVALID_TYPE", error ?? "invalid project", {
          param: "project",
        });
      const withId: Project = { id: crypto.randomUUID(), ...project };
      const profile: MakerProfile = {
        ...found.profile,
        projects: [...found.profile.projects, withId],
        updatedAt: Date.now(),
      };
      await store.set(
        appendAudit({ ...found.record, profile }, "add_project", withId.name),
      );
      return ok({ profile, project_id: withId.id });
    },
  });

  router.register({
    name: "remove_project",
    semanticCategory: "UPDATE",
    description: "Remove a project from the maker profile by its id.",
    params: {
      project_id: {
        type: "string",
        required: true,
        description: "The id returned by add_project.",
      },
    },
    returns: "An object with the updated `profile` and the `removed` id.",
    handler: async (params) => {
      const found = await requireProfile();
      if ("error" in found) return found.error;
      const projectId = params.project_id as string;
      if (!found.profile.projects.some((p) => p.id === projectId)) {
        return err("NOT_FOUND_RESOURCE", `no project with id: ${projectId}`, {
          project_id: projectId,
        });
      }
      const profile: MakerProfile = {
        ...found.profile,
        projects: found.profile.projects.filter((p) => p.id !== projectId),
        updatedAt: Date.now(),
      };
      await store.set(
        appendAudit({ ...found.record, profile }, "remove_project", projectId),
      );
      return ok({ profile, removed: projectId });
    },
  });

  router.register({
    name: "delete_profile",
    semanticCategory: "DELETE",
    description:
      "Delete the maker profile. Idempotent — succeeds even if no profile exists. A " +
      "subsequent get_profile reports no profile.",
    params: {},
    returns: "An object with `deleted` (whether a profile was present).",
    handler: async () => {
      const record = await store.get();
      const existed = Boolean(record?.profile);
      if (record) {
        await store.set(
          appendAudit({ ...record, profile: undefined }, "delete_profile"),
        );
      }
      return ok({ deleted: existed });
    },
  });
}
