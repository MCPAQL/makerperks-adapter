// Cloudflare Worker entry — fronts the MCP surface with OAuth 2.1 (dynamic client
// registration) so OAuth-mandatory clients (e.g. claude.ai) can register and connect.
//
// IMPORTANT: the directory is PUBLIC. Authorization is anonymous / auto-approve — this is
// CLIENT COMPATIBILITY, not access control. Real per-user, scoped auth is the Stage 1
// pipeline. See docs/ARCHITECTURE.md and the add-endpoint-oauth change.

import OAuthProvider, { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import type { Router } from "./core/router.js";

interface Env {
  OAUTH_KV: KVNamespace;
  PERKS_URL?: string;
}

// --- MCP API handler (the OAuth-protected resource) ---
// Cache data/router per isolate; build a fresh server + stateless transport per request.
let routerPromise: Promise<Router> | undefined;

function getRouter(env: Env): Promise<Router> {
  routerPromise ??= buildApp(env.PERKS_URL ? { source: env.PERKS_URL } : {}).then(
    (app) => app.router,
  );
  return routerPromise;
}

const mcpApiHandler = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const router = await getRouter(env);
      const server = createMcpServer(router);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
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

// --- /authorize handler (the provider's defaultHandler) ---
// Auto-approve for an anonymous principal — no login (public data). Compatibility, not gating.
const authHandler = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/authorize") {
      const oauth = getOAuthApi(oauthOptions, env);
      const authReq = await oauth.parseAuthRequest(request);
      const { redirectTo } = await oauth.completeAuthorization({
        request: authReq,
        userId: "public",
        metadata: {},
        scope: authReq.scope,
        props: {},
      });
      return Response.redirect(redirectTo, 302);
    }
    return new Response("Not Found", { status: 404 });
  },
};

const oauthOptions = {
  apiHandler: mcpApiHandler,
  apiRoute: "/",
  defaultHandler: authHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["mcp"],
};

export default new OAuthProvider<Env>(oauthOptions);
