// Per-USER Durable Object backing the maker profile + encrypted vault + audit log (#51). One
// DO instance per user, addressed by `idFromName(userId)` from the OAuth identity — so per-user
// isolation is structural (a session can only reach its own user's DO). Distinct from the
// per-SESSION McpAgent DO (MakerPerksMcpAgent): sessions are ephemeral, the profile is durable.
// The whole UserRecord (profile, vault, audit) lives under one storage key; the vault entries
// are already AES-GCM ciphertext (sealed by the session worker before they arrive here), and
// Durable Object storage is itself encrypted at rest — defence in depth.
// See openspec/changes/add-profile-vault (capability `maker-profile` / `credential-vault`, #51).

import { DurableObject } from "cloudflare:workers";
import type { UserRecord } from "./session/profile.js";

const RECORD_KEY = "record";

/** RPC surface the session worker drives via a stub to back a per-user `ProfileStore`. */
export class MakerProfileDO extends DurableObject {
  async getRecord(): Promise<UserRecord | undefined> {
    return (await this.ctx.storage.get<UserRecord>(RECORD_KEY)) ?? undefined;
  }

  async setRecord(record: UserRecord): Promise<void> {
    await this.ctx.storage.put(RECORD_KEY, record);
  }

  async deleteRecord(): Promise<void> {
    await this.ctx.storage.delete(RECORD_KEY);
  }
}
