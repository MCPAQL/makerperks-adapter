// Cloudflare Worker entry — a third transport binding over the same Router.
// Serves the mcp_aql_read surface over public HTTPS Streamable HTTP, statelessly,
// using the MCP SDK's web-standard transport (no Durable Objects). See docs/ARCHITECTURE.md.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import type { Router } from "./core/router.js";

interface Env {
  PERKS_URL?: string;
}

// Cache the data/router once per isolate. The MCP server + stateless transport are
// created FRESH per request — a stateless transport cannot be reused across requests.
let routerPromise: Promise<Router> | undefined;

function getRouter(env: Env): Promise<Router> {
  routerPromise ??= buildApp(env.PERKS_URL ? { source: env.PERKS_URL } : {}).then(
    (app) => app.router,
  );
  return routerPromise;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const router = await getRouter(env);
      const server = createMcpServer(router);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — no Durable Objects needed
      });
      await server.connect(transport);
      return await transport.handleRequest(request);
    } catch (error) {
      routerPromise = undefined; // don't cache a failed data load
      console.error("makerperks-adapter worker error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "internal error" },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  },
};
