// Wires the transport-agnostic core: a DataSource + a Router with the READ family
// and mandatory introspection. Transports (Section 4) consume the returned router.

import { Router } from "./core/router.js";
import { registerIntrospect } from "./core/introspect.js";
import { registerReadOperations } from "./operations/read.js";
import { DataSource, type DataSourceOptions } from "./data/source.js";

export type AppOptions = DataSourceOptions;

export async function buildApp(
  options: AppOptions = {},
): Promise<{ router: Router; data: DataSource }> {
  const data = new DataSource(options);
  await data.ensureLoaded();

  const router = new Router();
  registerReadOperations(router, data);
  registerIntrospect(router);

  return { router, data };
}
