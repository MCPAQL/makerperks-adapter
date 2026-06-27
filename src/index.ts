// Entry point: select a transport at launch; both share one transport-agnostic core.
// Config via env: MAKERPERKS_SOURCE (perks.json URL/path), MAKERPERKS_PORT (HTTP).

import { buildApp } from "./app.js";
import { inMemorySessionStore } from "./session/state.js";
import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";

async function main(): Promise<void> {
  const useHttp = process.argv.includes("--transport=http");
  const source = process.env.MAKERPERKS_SOURCE;
  // A local single-process session gets an in-memory store — the EXECUTE pipeline runs
  // entirely on-device (the local personal-tool mode).
  const { router } = await buildApp({
    ...(source ? { source } : {}),
    sessionStore: inMemorySessionStore(),
  });

  if (useHttp) {
    const portEnv = process.env.MAKERPERKS_PORT;
    const handle = await startHttp(router, portEnv ? { port: Number(portEnv) } : {});
    // stderr so it never pollutes stdio-transport JSON on stdout.
    console.error(
      `MakerPerks MCP-AQL adapter (Streamable HTTP) listening on ${handle.url}`,
    );
  } else {
    await startStdio(router);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
