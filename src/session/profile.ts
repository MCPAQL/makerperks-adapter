// Per-USER persistent state — the maker profile (#34) and (later) the credential vault +
// audit log (#19). This is the home the MCP-AQL protocol does NOT provide: confirmation
// tokens are session-scoped, this is user-scoped. Kept pure and transport/runtime-free so it
// is unit-testable off the Workers runtime, exactly like session/state.ts.
//
// The store is KEYLESS — bound to ONE user by construction (mirroring SessionStore, which is
// bound to one session). Per-user isolation is therefore structural: local mode binds the one
// local user; the hosted endpoint binds `this.props.userId`'s Durable Object (#51).
// See openspec/changes/add-profile-vault (#19 + #34).

import type { ProgramStatus, StatusEntry } from "../data/status.js";

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
 * The kinds of secret the credential vault stores. `payment` is INTENTIONALLY ABSENT — the
 * core stores no payment credentials and drives no payment steps (a scope boundary, not
 * enforcement against externally composed tools). See the credential-vault spec.
 */
export const SECRET_KINDS = ["scoped_token", "password", "identity_document"] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];

/**
 * A stored secret, encrypted at rest (AES-GCM). Listings surface only the metadata (id, kind,
 * label, provider, createdAt) — never the secret value. The plaintext is decrypted server-side and
 * reaches the agent only DANGER-TIERED at the point of use (#91): included in the application
 * package for a danger ≤ 2 flow so the agent can authenticate; danger ≥ 3 is never exposed (it stays
 * out-of-band). See session/vault.ts.
 */
export interface VaultEntry {
  id: string;
  kind: SecretKind;
  /** Non-secret human descriptor, e.g. "GitHub PAT" or "Passport scan". */
  label: string;
  /** Optional provider/slug the credential is for. */
  provider?: string;
  ciphertext: string; // base64 AES-GCM ciphertext
  iv: string; // base64 per-entry random IV
  createdAt: number;
}

/** An append-only audit record of a profile/vault mutation or a secret use. No secret values. */
export interface AuditEntry {
  at: number;
  action: string;
  /** Non-secret detail, e.g. the credential label — never a secret value. */
  detail?: string;
}

/** Keep the per-user audit log bounded (newest retained) so a Durable Object can't grow forever. */
export const AUDIT_CAP = 1000;

/**
 * Per-user health for one flow (#47 piece B): the outcome of this user's attempts. `failure_count`
 * is CONSECUTIVE (reset to 0 on a success), so a flow that works again is trusted again.
 */
export interface FlowHealth {
  last_success_at?: number;
  last_failure_at?: number;
  failure_count: number;
  last_note?: string;
}

/**
 * Everything stored for one user: the maker profile (#49), the encrypted credential vault, the
 * append-only audit log (#50), and per-flow health keyed by slug (#47 piece B). All optional so a
 * record can exist with only some populated.
 */
export interface UserRecord {
  profile?: MakerProfile;
  vault?: VaultEntry[];
  audit?: AuditEntry[];
  flowHealth?: Record<string, FlowHealth>;
  /** This user's per-status directory view/proposal policy (#36 add-directory-status). A partial
   * override; absent statuses fall back to DEFAULT. Per-user — how you view the directory by status
   * is personal (the accepted flows stay shared). */
  statusPolicy?: Partial<Record<ProgramStatus, Partial<StatusEntry>>>;
}

/** Append an audit entry to a record (bounded to the newest AUDIT_CAP), returning a new record. */
export function appendAudit(
  record: UserRecord,
  action: string,
  detail?: string,
): UserRecord {
  const entry: AuditEntry = { at: Date.now(), action, ...(detail ? { detail } : {}) };
  const audit = [...(record.audit ?? []), entry].slice(-AUDIT_CAP);
  return { ...record, audit };
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
