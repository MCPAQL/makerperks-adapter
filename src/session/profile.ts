// Per-USER persistent state — the maker profile (#34) and (later) the credential vault +
// audit log (#19). This is the home the MCP-AQL protocol does NOT provide: confirmation
// tokens are session-scoped, this is user-scoped. Kept pure and transport/runtime-free so it
// is unit-testable off the Workers runtime, exactly like session/state.ts.
//
// The store is KEYLESS — bound to ONE user by construction (mirroring SessionStore, which is
// bound to one session). Per-user isolation is therefore structural: local mode binds the one
// local user; the hosted endpoint binds `this.props.userId`'s Durable Object (#51). The vault
// and audit fields of UserRecord are added in #50.
// See openspec/changes/add-profile-vault (#19 + #34).

/** A public link on a maker profile (portfolio, GitHub, project site). */
export interface ProfileLink {
  label: string;
  url: string;
}

/** Non-secret identity fields an application is assembled from. */
export interface ProfileIdentity {
  name?: string;
  email?: string;
  location?: { region?: string; country?: string };
  links?: ProfileLink[];
}

/** A maker project (e.g. DollhouseMCP, MCP-AQL) applications can reference. */
export interface Project {
  id: string;
  name: string;
  description?: string;
  url?: string;
  role?: string;
  tags?: string[];
}

/** The maker's own profile — identity + projects. Holds NO secrets (those are the vault). */
export interface MakerProfile {
  identity: ProfileIdentity;
  projects: Project[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Everything stored for one user. Section 1 (#49) populates `profile`; the credential vault
 * and audit log arrive as additional fields in #50 — the store interface does not change.
 */
export interface UserRecord {
  profile?: MakerProfile;
}

/**
 * How CRUDE profile ops read and persist ONE user's record. Bound to a single user by
 * construction (no userId argument), so it cannot reach another user's data — the structural
 * isolation guarantee. Backed by a per-user Durable Object on the hosted endpoint (#51) and by
 * an in-memory record over stdio (the local personal-tool mode). The live READ-only worker
 * passes no store, so no CRUDE ops are registered there.
 */
export interface ProfileStore {
  get(): Promise<UserRecord | undefined>;
  set(record: UserRecord): Promise<void>;
  delete(): Promise<void>;
}

/**
 * An in-process ProfileStore for the single local user (stdio / tests / local-only mode). The
 * record lives in memory and is never transmitted — the never-leaves-the-machine property of
 * #34's local mode. Cross-restart file persistence is a tracked refinement.
 */
export function inMemoryProfileStore(initial?: UserRecord): ProfileStore {
  let record: UserRecord | undefined = initial;
  return {
    get: async () => record,
    set: async (next) => {
      record = next;
    },
    delete: async () => {
      record = undefined;
    },
  };
}
