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
import { DataSource, type DataSourceOptions } from "./data/source.js";
import type { SessionStore } from "./session/state.js";
import type { ProfileStore } from "./session/profile.js";

export interface AppOptions extends DataSourceOptions {
  /** When present, the EXECUTE pipeline is registered, bound to this session's store. */
  sessionStore?: SessionStore;
  /** When present, the CRUDE maker-profile surface is registered, bound to this user's store. */
  profileStore?: ProfileStore;
}

interface RouterStores {
  sessionStore?: SessionStore;
  profileStore?: ProfileStore;
}

/** Assemble a router over already-loaded data. EXECUTE/CRUDE ops register only with a store. */
export function buildRouter(data: DataSource, options: RouterStores = {}): Router {
  const router = new Router();
  registerReadOperations(router, data);
  registerFlowOperations(router, data);
  if (options.sessionStore) {
    registerExecuteOperations(router, data, options.sessionStore);
  }
  if (options.profileStore) {
    registerProfileOperations(router, options.profileStore);
  }
  registerIntrospect(router);
  return router;
}

export async function buildApp(
  options: AppOptions = {},
): Promise<{ router: Router; data: DataSource }> {
  const { sessionStore, profileStore, ...dataOptions } = options;
  const data = new DataSource(dataOptions);
  await data.ensureLoaded();
  const router = buildRouter(data, { sessionStore, profileStore });
  return { router, data };
}
