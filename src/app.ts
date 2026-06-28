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
import { registerFlowHealthOperations } from "./operations/flow-health.js";
import { registerFlowDiscoveryOperations } from "./operations/flow-discovery.js";
import { DataSource, type DataSourceOptions } from "./data/source.js";
import { FlowSource } from "./data/flow-source.js";
import type { SessionStore } from "./session/state.js";
import type { ProfileStore } from "./session/profile.js";
import type { VaultCrypto } from "./session/vault.js";

export interface AppOptions extends DataSourceOptions {
  /** A flows.json URL or file path for the curated overlay (#47). Unset = the bundled default. */
  flowsSource?: string;
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

/** Assemble a router over already-loaded data + flow overlay. EXECUTE/CRUDE ops need a store. */
export function buildRouter(
  data: DataSource,
  flows: FlowSource,
  options: RouterStores = {},
): Router {
  const router = new Router();
  registerReadOperations(router, data);
  registerFlowOperations(router, data, flows);
  // Flow-discovery toolkit (#47 piece C) — model-free READ ops over data + flows; available on
  // every deployment (the agent above supplies the model + web).
  registerFlowDiscoveryOperations(router, data, flows);
  if (options.sessionStore) {
    // The pipeline assembles from the maker profile when one is wired (§4); the profile store
    // is optional, so the pipeline still works (without profile fill) without it.
    registerExecuteOperations(
      router,
      data,
      flows,
      options.sessionStore,
      options.profileStore,
    );
  }
  if (options.profileStore) {
    registerProfileOperations(router, options.profileStore);
    // Per-user flow health (#47 piece B) — needs the flow overlay + the per-user store.
    registerFlowHealthOperations(router, data, flows, options.profileStore);
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
): Promise<{ router: Router; data: DataSource; flows: FlowSource }> {
  const { flowsSource, sessionStore, profileStore, vaultCrypto, ...dataOptions } =
    options;
  const data = new DataSource(dataOptions);
  const flows = new FlowSource(flowsSource ? { source: flowsSource } : {});
  await Promise.all([data.ensureLoaded(), flows.ensureLoaded()]);
  const router = buildRouter(data, flows, { sessionStore, profileStore, vaultCrypto });
  return { router, data, flows };
}
