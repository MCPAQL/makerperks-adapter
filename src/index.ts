// Entry point: select a transport at launch; both share one transport-agnostic core.
// Config via env: MAKERPERKS_SOURCE (perks.json URL/path), MAKERPERKS_PORT (HTTP).

import { buildApp } from "./app.js";
import { inMemorySessionStore } from "./session/state.js";
import { inMemoryProfileStore } from "./session/profile.js";
import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";

async function main(): Promise<void> {
  const useHttp = process.argv.includes("--transport=http");
  const source = process.env.MAKERPERKS_SOURCE;
  // A local single-process session gets in-memory stores — the EXECUTE pipeline and the
  // CRUDE maker profile (#34) run entirely on-device (the local personal-tool mode); the
  // profile never leaves the machine.
  const { router } = await buildApp({
    ...(source ? { source } : {}),
    sessionStore: inMemorySessionStore(),
    profileStore: inMemoryProfileStore(),
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
