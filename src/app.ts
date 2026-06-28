// Wires the transport-agnostic core: a DataSource + a Router with READ, the flow ops, and
// (when a SessionStore is provided) the EXECUTE pipeline, plus mandatory introspection.
// `buildRouter` is split out so the stateful Worker can cache the DataSource per isolate and
// rebuild a cheap per-session router bound to that session's store (#17).

import { Router } from "./core/router.js";
import { registerIntrospect } from "./core/introspect.js";
import { registerReadOperations } from "./operations/read.js";
import { registerFlowOperations } from "./operations/flows.js";
import { registerExecuteOperations } from "./operations/execute.js";
import { registerProfileOperations } from "./operations/profile.js";
import { registerVaultOperations } from "./operations/vault.js";
import { DataSource, type DataSourceOptions } from "./data/source.js";
import type { SessionStore } from "./session/state.js";
import type { ProfileStore } from "./session/profile.js";
import type { VaultCrypto } from "./session/vault.js";

export interface AppOptions extends DataSourceOptions {
  /** When present, the EXECUTE pipeline is registered, bound to this session's store. */
  sessionStore?: SessionStore;
  /** When present, the CRUDE maker-profile surface is registered, bound to this user's store. */
  profileStore?: ProfileStore;
  /** With a profileStore, registers the encrypted credential vault (needs a key to seal/open). */
  vaultCrypto?: VaultCrypto;
}

interface RouterStores {
  sessionStore?: SessionStore;
  profileStore?: ProfileStore;
  vaultCrypto?: VaultCrypto;
}

/** Assemble a router over already-loaded data. EXECUTE/CRUDE ops register only with a store. */
export function buildRouter(data: DataSource, options: RouterStores = {}): Router {
  const router = new Router();
  registerReadOperations(router, data);
  registerFlowOperations(router, data);
  if (options.sessionStore) {
    // The pipeline assembles from the maker profile when one is wired (§4); the profile store
    // is optional, so the pipeline still works (without profile fill) without it.
    registerExecuteOperations(router, data, options.sessionStore, options.profileStore);
  }
  if (options.profileStore) {
    registerProfileOperations(router, options.profileStore);
    // The vault needs both a per-user store and a key to seal/open; register only with both.
    if (options.vaultCrypto) {
      registerVaultOperations(router, options.profileStore, options.vaultCrypto);
    }
  }
  registerIntrospect(router);
  return router;
}

export async function buildApp(
  options: AppOptions = {},
): Promise<{ router: Router; data: DataSource }> {
  const { sessionStore, profileStore, vaultCrypto, ...dataOptions } = options;
  const data = new DataSource(dataOptions);
  await data.ensureLoaded();
  const router = buildRouter(data, { sessionStore, profileStore, vaultCrypto });
  return { router, data };
}
