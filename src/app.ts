// Wires the transport-agnostic core: a DataSource + a Router with READ, the flow ops, and
// (when a SessionStore is provided) the EXECUTE pipeline, plus mandatory introspection.
// `buildRouter` is split out so the stateful Worker can cache the DataSource per isolate and
// rebuild a cheap per-session router bound to that session's store (#17).

import { Router } from "./core/router.js";
import { registerIntrospect } from "./core/introspect.js";
import { registerReadOperations } from "./operations/read.js";
import { registerFlowOperations } from "./operations/flows.js";
import { registerExecuteOperations } from "./operations/execute.js";
import { DataSource, type DataSourceOptions } from "./data/source.js";
import type { SessionStore } from "./session/state.js";

export interface AppOptions extends DataSourceOptions {
  /** When present, the EXECUTE pipeline is registered, bound to this session's store. */
  sessionStore?: SessionStore;
}

/** Assemble a router over already-loaded data. EXECUTE ops register only with a store. */
export function buildRouter(
  data: DataSource,
  options: { sessionStore?: SessionStore } = {},
): Router {
  const router = new Router();
  registerReadOperations(router, data);
  registerFlowOperations(router, data);
  if (options.sessionStore) {
    registerExecuteOperations(router, data, options.sessionStore);
  }
  registerIntrospect(router);
  return router;
}

export async function buildApp(
  options: AppOptions = {},
): Promise<{ router: Router; data: DataSource }> {
  const { sessionStore, ...dataOptions } = options;
  const data = new DataSource(dataOptions);
  await data.ensureLoaded();
  const router = buildRouter(data, { sessionStore });
  return { router, data };
}
