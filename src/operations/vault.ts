// CRUDE credential-vault family (#19): per-user encrypted secrets the application pipeline
// uses on the maker's behalf. Registered ONLY when BOTH a ProfileStore and a VaultCrypto are
// wired (local mode = keyfile under ~/.makerperks; hosted = the VAULT_KEY secret + per-user DO,
// #51; live READ-only worker = neither, so absent). Cardinal rule: a plaintext secret is NEVER
// returned to the agent — reads surface metadata only; the plaintext is decrypted only
// server-side at the point of (simulated) use (#52). Payment is not a storable kind.
// See openspec/changes/add-profile-vault (capability `credential-vault`, #19).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import {
  SECRET_KINDS,
  appendAudit,
  type SecretKind,
  type VaultEntry,
  type ProfileStore,
} from "../session/profile.js";
import type { VaultCrypto } from "../session/vault.js";

/** The only fields ever surfaced for a credential — never the ciphertext, iv, or plaintext. */
function credentialMetadata(entry: VaultEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    provider: entry.provider,
    createdAt: entry.createdAt,
  };
}

export function registerVaultOperations(
  router: Router,
  store: ProfileStore,
  cipher: VaultCrypto,
): void {
  router.register({
    name: "add_credential",
    semanticCategory: "CREATE",
    description:
      "Store a secret in the maker's encrypted vault (scoped_token | password | " +
      "identity_document). The plaintext is encrypted at rest and is NEVER returned or " +
      "listed — only metadata. Payment credentials are not accepted.",
    params: {
      kind: {
        type: "string",
        required: true,
        enum: SECRET_KINDS,
        description:
          "scoped_token | password | identity_document (payment is not storable).",
      },
      label: {
        type: "string",
        required: true,
        description: 'A non-secret human descriptor, e.g. "GitHub PAT".',
      },
      secret: {
        type: "string",
        required: true,
        description: "The secret value to encrypt at rest. Never returned or listed.",
      },
      provider: {
        type: "string",
        required: false,
        description: "Optional provider/slug the credential is for.",
      },
    },
    returns:
      "An object with the stored credential's `credential` metadata (no secret value).",
    handler: async (params) => {
      const record = (await store.get()) ?? {};
      const sealed = await cipher.seal(params.secret as string);
      const entry: VaultEntry = {
        id: crypto.randomUUID(),
        kind: params.kind as SecretKind,
        label: params.label as string,
        ...(params.provider ? { provider: params.provider as string } : {}),
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        createdAt: Date.now(),
      };
      const vault = [...(record.vault ?? []), entry];
      await store.set(
        appendAudit(
          { ...record, vault },
          "add_credential",
          `${entry.kind}:${entry.label}`,
        ),
      );
      return ok({ credential: credentialMetadata(entry) });
    },
  });

  router.register({
    name: "list_credentials",
    semanticCategory: "READ",
    description:
      "List the maker's stored credentials as METADATA ONLY (id, kind, label, provider, " +
      "createdAt). Never returns the ciphertext or the plaintext of any secret.",
    params: {},
    returns: "An object with `credentials` (metadata only).",
    handler: async () => {
      const record = await store.get();
      return ok({ credentials: (record?.vault ?? []).map(credentialMetadata) });
    },
  });

  router.register({
    name: "remove_credential",
    semanticCategory: "DELETE",
    description: "Remove a credential from the maker's vault by its id.",
    params: {
      credential_id: {
        type: "string",
        required: true,
        description: "The id returned by add_credential / list_credentials.",
      },
    },
    returns: "An object with the `removed` id.",
    handler: async (params) => {
      const record = (await store.get()) ?? {};
      const vault = record.vault ?? [];
      const entry = vault.find((c) => c.id === params.credential_id);
      if (!entry) {
        return err(
          "NOT_FOUND_RESOURCE",
          `no credential with id: ${params.credential_id}`,
          {
            credential_id: params.credential_id,
          },
        );
      }
      await store.set(
        appendAudit(
          { ...record, vault: vault.filter((c) => c.id !== entry.id) },
          "remove_credential",
          `${entry.kind}:${entry.label}`,
        ),
      );
      return ok({ removed: entry.id });
    },
  });
}
