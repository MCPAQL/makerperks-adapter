// Stateful Cloudflare Worker entry (Stage 1) — deployed SEPARATELY to
// makerperks-dev.mcpaql.com. The live makerperks.mcpaql.com (src/worker.ts) is
// left untouched. See openspec/changes/add-stateful-hosting (issue #20).
//
// §1 (this commit, #24): the McpAgent + Durable Object entry so each MCP session is
// backed by a DO, mounting the SAME single `mcp_aql_read` READ surface. Two things are
// still interim and land in later sections of this change:
//   - the typed per-session SessionState container (confirmation tokens + EXECUTE
//     context) — §2 (#25); READ never uses it.
//   - real per-user GitHub OAuth — §3 (#26) replaces the anonymous auto-approve below,
//     which is CLIENT COMPATIBILITY, not access control (mirrors src/worker.ts).

import OAuthProvider, { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { buildApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import { freshSessionState, type SessionState } from "./session/state.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Router } from "./core/router.js";

interface Env {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  PERKS_URL?: string;
}

// Cache the data/router per isolate; the Durable Object holds *session* state, not the
// dataset. Don't cache a failed load.
let routerPromise: Promise<Router> | undefined;
function getRouter(env: Env): Promise<Router> {
  routerPromise ??= buildApp(env.PERKS_URL ? { source: env.PERKS_URL } : {})
    .then((app) => app.router)
    .catch((error) => {
      routerPromise = undefined;
      throw error;
    });
  return routerPromise;
}

/**
 * A Durable Object per MCP session — the Stage 1 stateful substrate. Mounts the existing
 * single `mcp_aql_read` READ surface unchanged (introspect + READ ops), so the hosted
 * surface and the token-efficient single-tool design are preserved while sessions become
 * stateful. McpAgent runs `init()` and then reads `this.server`, connecting its own
 * Streamable HTTP transport.
 *
 * Each session carries its own `SessionState` (`initialState`) — the typed home for
 * confirmation tokens + EXECUTE context. READ does NOT touch it; the application pipeline
 * (#17) populates it. Per-session isolation is guaranteed by one DO per session and
 * verified live in §4.
 */
export class MakerPerksMcpAgent extends McpAgent<Env, SessionState> {
  // A fresh, per-session state container — never a shared reference across sessions.
  initialState: SessionState = freshSessionState();

  // Built in init() from the cached router; read by McpAgent after init() resolves.
  server!: Server;

  async init(): Promise<void> {
    const router = await getRouter(this.env);
    this.server = createMcpServer(router);
  }
}

// --- Interim anonymous auto-approve /authorize (compatibility, NOT gating) ---
// Mirrors src/worker.ts. §3 (#26) replaces this with a real GitHub login that carries the
// authenticated identity into the agent as `this.props`.
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
  apiHandler: MakerPerksMcpAgent.serve("/"),
  apiRoute: "/",
  defaultHandler: authHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["mcp"],
};

export default new OAuthProvider<Env>(oauthOptions);
