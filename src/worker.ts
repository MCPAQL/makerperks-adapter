// Cloudflare Worker entry — a third transport binding over the same Router.
// Serves the mcp_aql_read surface over public HTTPS Streamable HTTP, statelessly,
// using the MCP SDK's web-standard transport (no Durable Objects). See docs/ARCHITECTURE.md.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildApp } from "./app.js";
import { createMcpServer } from "./mcp.js";

interface Env {
  PERKS_URL?: string;
}

// One stateless server + transport per isolate, reused across requests (read-only surface).
let transportPromise: Promise<WebStandardStreamableHTTPServerTransport> | undefined;

function getTransport(env: Env): Promise<WebStandardStreamableHTTPServerTransport> {
  transportPromise ??= (async () => {
    const { router } = await buildApp(env.PERKS_URL ? { source: env.PERKS_URL } : {});
    const server = createMcpServer(router);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no Durable Objects needed
    });
    await server.connect(transport);
    return transport;
  })();
  return transportPromise;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const transport = await getTransport(env);
    return transport.handleRequest(request);
  },
};
