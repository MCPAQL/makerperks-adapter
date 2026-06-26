// Entry point: select a transport at launch; both share one transport-agnostic core.
// TODO(task 4.3): real arg parsing; wire DataSource + read operations into the router.

import { Router } from "./core/router.js";
import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";

async function main(): Promise<void> {
  const useHttp = process.argv.includes("--transport=http");
  const router = new Router();

  if (useHttp) {
    await startHttp(router);
  } else {
    await startStdio(router);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
