// Entry point: select a transport at launch; both share one transport-agnostic core.
// Config via env: MAKERPERKS_SOURCE (one perks.json URL/path) or MAKERPERKS_SOURCES (many,
// federated — JSON array of feeds or a comma list); MAKERPERKS_FLOWS; MAKERPERKS_PORT (HTTP).

import { homedir } from "node:os";
import { join } from "node:path";
import { buildApp } from "./app.js";
import { parseSourcesEnv } from "./data/source.js";
import { inMemorySessionStore } from "./session/state.js";
import { inMemoryProfileStore } from "./session/profile.js";
import { vaultCrypto } from "./session/vault.js";
import { loadLocalVaultKey } from "./local/vault-key.js";
import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";

async function main(): Promise<void> {
  const useHttp = process.argv.includes("--transport=http");
  const source = process.env.MAKERPERKS_SOURCE;
  // MAKERPERKS_SOURCES (many feeds, federated) takes precedence over the single MAKERPERKS_SOURCE.
  const sources = process.env.MAKERPERKS_SOURCES
    ? parseSourcesEnv(process.env.MAKERPERKS_SOURCES)
    : undefined;
  // A local single-process session gets in-memory stores — the EXECUTE pipeline and the
  // CRUDE maker profile (#34) run entirely on-device (the local personal-tool mode); the
  // profile never leaves the machine. The credential vault (#19) is encrypted at rest with a
  // keyfile under ~/.makerperks/ (override the dir with MAKERPERKS_VAULT_DIR).
  const vaultDir = process.env.MAKERPERKS_VAULT_DIR ?? join(homedir(), ".makerperks");
  const vaultKey = await loadLocalVaultKey(vaultDir);
  const flowsSource = process.env.MAKERPERKS_FLOWS; // a flows.json URL/path; unset = bundled
  const { router } = await buildApp({
    ...(sources?.length ? { sources } : source ? { source } : {}),
    ...(flowsSource ? { flowsSource } : {}),
    sessionStore: inMemorySessionStore(),
    profileStore: inMemoryProfileStore(),
    vaultCrypto: vaultCrypto(vaultKey),
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
