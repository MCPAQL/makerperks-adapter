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
import { kvOverlayMirror, overlayReader } from "./session/overlay-mirror.js";
import type { Router } from "./core/router.js";

// Cloudflare Workers Rate Limiting binding (per-IP backstop against abuse / runaway clients).
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  OAUTH_KV: KVNamespace;
  PERKS_URL?: string;
  /** A flows.json URL for the curated overlay (#47); unset = the bundled default. */
  FLOWS_URL?: string;
  // SHARED overlay mirror (#87) — the operator-published accepted overlay (written by the stateful
  // worker's reconcile_flows). This read-only endpoint reads it to serve blessed flows, no redeploy.
  OVERLAY_KV?: KVNamespace;
  MCP_RATE_LIMITER: RateLimit;
}

// --- MCP API handler (the OAuth-protected resource) ---
// Cache data/router per isolate; build a fresh server + stateless transport per request.
let routerPromise: Promise<Router> | undefined;

function getRouter(env: Env): Promise<Router> {
  routerPromise ??= buildApp({
    ...(env.PERKS_URL ? { source: env.PERKS_URL } : {}),
    ...(env.FLOWS_URL ? { flowsSource: env.FLOWS_URL } : {}),
    // Serve the operator-published accepted overlay (#87) when the mirror is bound. Read-only +
    // cached per isolate (TTL) inside the mirror — no per-request KV read (the 2026-06-28 lesson).
    ...(env.OVERLAY_KV
      ? { acceptedOverlay: overlayReader(kvOverlayMirror(env.OVERLAY_KV)) }
      : {}),
  }).then((app) => app.router);
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

const oauthProvider = new OAuthProvider<Env>(oauthOptions);

// Hardening after the 2026-06-28 KV-overuse incident: this endpoint is stateless
// request/response and offers NO server->client SSE stream. Some MCP clients open a GET
// stream, find it can't persist, and reconnect ~2x/sec — each reconnect costing an OAuth
// token-validation KV read (one looping client = ~166k requests/day, blowing the free KV
// read *and* Workers request limits). Answer GET on the API route with 405 BEFORE the OAuth
// layer: zero KV reads, and a spec-compliant client falls back to POST-only instead of
// looping. Discovery GETs (/.well-known/*) and the /authorize redirect are untouched.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Per-IP rate limit — the belt-and-suspenders backstop against abuse, a runaway client,
    // or a traffic spike. Runs first, before OAuth/KV, so a blocked request costs nothing
    // downstream. Generous (100 req / 10s per IP) — far above any real MCP client.
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.MCP_RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "retry-after": "10", "content-type": "text/plain" },
      });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        "Method Not Allowed — this MCP endpoint is POST-only (no SSE stream).",
        { status: 405, headers: { Allow: "POST", "content-type": "text/plain" } },
      );
    }
    return oauthProvider.fetch(request, env, ctx);
  },
};
