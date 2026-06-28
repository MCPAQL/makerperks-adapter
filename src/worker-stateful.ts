// Stateful Cloudflare Worker entry (Stage 1) — deployed SEPARATELY to
// makerperks-dev.mcpaql.com. The live makerperks.mcpaql.com (src/worker.ts) is
// left untouched. See openspec/changes/add-stateful-hosting (issue #20).
//
//   - §1 (#24): the McpAgent + Durable Object entry — a DO per MCP session mounting the
//     SAME single `mcp_aql_read` READ surface.
//   - §2 (#25): a typed per-session SessionState container (confirmation tokens + EXECUTE
//     context); READ never uses it.
//   - §3 (#26): real per-user OAuth — /authorize is delegated to GitHub (the upstream
//     IdP); the authenticated identity is carried into the grant `props` (and so into the
//     session DO as `this.props`). No password is stored.

import OAuthProvider, {
  getOAuthApi,
  type AuthRequest,
} from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { buildRouter } from "./app.js";
import { createMcpServer } from "./mcp.js";
import { DataSource } from "./data/source.js";
import { FlowSource } from "./data/flow-source.js";
import {
  freshSessionState,
  type SessionState,
  type SessionStore,
} from "./session/state.js";
import type { ProfileStore, UserRecord } from "./session/profile.js";
import {
  vaultCrypto,
  importVaultKey,
  fromBase64,
  type VaultCrypto,
} from "./session/vault.js";
import { MakerProfileDO } from "./durable-profile.js";
import { FlowRegistryDO } from "./durable-registry.js";
import { deriveDoName } from "./auth/do-name.js";
import type { FlowRegistry } from "./session/flow-registry.js";
// Re-exported so wrangler can bind the DO classes from this entry.
export { MakerProfileDO } from "./durable-profile.js";
export { FlowRegistryDO } from "./durable-registry.js";
import {
  decodeAuthState,
  encodeAuthState,
  fetchGitHubIdentity,
  githubAuthorizeUrl,
  type GitHubOAuthConfig,
} from "./auth/github.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Cloudflare Workers Rate Limiting binding (per-IP backstop against abuse / runaway clients).
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  // Per-USER profile/vault store (#51). One DO per user via idFromName(userId).
  PROFILE_OBJECT: DurableObjectNamespace<MakerProfileDO>;
  // SHARED proposed-flow registry (#47 piece D). A SINGLE named instance for the whole deployment.
  REGISTRY_OBJECT: DurableObjectNamespace<FlowRegistryDO>;
  PERKS_URL?: string;
  /** A flows.json URL for the curated overlay (#47); unset = the bundled default. */
  FLOWS_URL?: string;
  MCP_RATE_LIMITER: RateLimit;
  // Set as Worker secrets on the dev Worker (`wrangler secret put ... -c wrangler.dev.jsonc`).
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  // Base64 of 32 random bytes — the AES-256 key for the credential vault (#19). When absent,
  // the vault surface is simply not registered (the profile still works).
  VAULT_KEY?: string;
}

// The OAuth-authenticated identity carried into the session DO as `this.props` (set by
// completeAuthorization in the auth handler below).
interface UserProps extends Record<string, unknown> {
  userId: string;
  login: string;
  name?: string;
}

function githubConfig(env: Env): GitHubOAuthConfig {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new Error(
      "GitHub OAuth is not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET " +
        "(via `wrangler secret put`) on the dev Worker.",
    );
  }
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  };
}

// Cache the DATA per isolate (the expensive part); the router is rebuilt per session so its
// EXECUTE ops can bind to that session's Durable Object state. Don't cache a failed load.
let dataPromise: Promise<DataSource> | undefined;
function getData(env: Env): Promise<DataSource> {
  dataPromise ??= (async () => {
    const data = new DataSource(env.PERKS_URL ? { source: env.PERKS_URL } : {});
    await data.ensureLoaded();
    return data;
  })().catch((error) => {
    dataPromise = undefined;
    throw error;
  });
  return dataPromise;
}

// Cache the FLOW overlay per isolate too (fetched from FLOWS_URL or the bundled default).
let flowsPromise: Promise<FlowSource> | undefined;
function getFlows(env: Env): Promise<FlowSource> {
  flowsPromise ??= (async () => {
    const flows = new FlowSource(env.FLOWS_URL ? { source: env.FLOWS_URL } : {});
    await flows.ensureLoaded();
    return flows;
  })().catch((error) => {
    flowsPromise = undefined;
    throw error;
  });
  return flowsPromise;
}

/**
 * A Durable Object per MCP session — the Stage 1 stateful substrate. Mounts the existing
 * single `mcp_aql_read` READ surface unchanged (introspect + READ ops), so the hosted
 * surface and the token-efficient single-tool design are preserved while sessions become
 * stateful. McpAgent runs `init()` and then reads `this.server`, connecting its own
 * Streamable HTTP transport.
 *
 * Each session carries its own `SessionState` (`initialState`) — the home for confirmation
 * tokens + executions. The router is built per session bound to a DO-backed `SessionStore`,
 * so the EXECUTE pipeline (#17) reads/writes *this* session's state. Per-session isolation
 * is guaranteed by one DO per session.
 */
export class MakerPerksMcpAgent extends McpAgent<Env, SessionState, UserProps> {
  // A fresh, per-session state container — never a shared reference across sessions.
  initialState: SessionState = freshSessionState();

  // Built in init() from the cached data + this session's store; read after init() resolves.
  server!: Server;

  async init(): Promise<void> {
    const data = await getData(this.env);
    const flows = await getFlows(this.env);
    const store: SessionStore = {
      get: () => this.state,
      set: (next) => this.setState(next),
    };

    // Per-USER state (#51): bind a ProfileStore + vault to THIS user's Durable Object, keyed by
    // the OAuth identity. A session can only ever reach its own user's record (structural
    // isolation). Skipped if there is no authenticated user (the surface just isn't registered).
    const userId = this.props?.userId;
    let profileStore: ProfileStore | undefined;
    let vault: VaultCrypto | undefined;
    if (userId) {
      const ns = this.env.PROFILE_OBJECT;
      // deriveDoName is the one place subject -> DO name happens; it throws on an empty
      // subject (the guard is unreachable here thanks to `if (userId)`, but keeps the
      // derivation honest and unit-testable — see test/workers/isolation.test.ts).
      const stub = ns.get(ns.idFromName(deriveDoName(userId)));
      profileStore = {
        get: () => stub.getRecord(),
        set: (record: UserRecord) => stub.setRecord(record),
        delete: () => stub.deleteRecord(),
      };
      if (this.env.VAULT_KEY) {
        vault = vaultCrypto(await importVaultKey(fromBase64(this.env.VAULT_KEY)));
      }
    }

    // The SHARED proposed-flow registry (#47 piece D) — one named DO for the whole deployment, so
    // the review queue + accepted overlay are operator-shared (not per-user). The serving ops then
    // serve accepted flows live. (Operator-only gating of accept is a tracked follow-up.)
    const regNs = this.env.REGISTRY_OBJECT;
    const reg = regNs.get(regNs.idFromName("flow-registry"));
    const flowRegistry: FlowRegistry = {
      mode: () => reg.getMode(),
      setMode: (mode) => reg.setMode(mode),
      put: (proposal) => reg.putProposal(proposal),
      get: (id) => reg.getProposal(id),
      list: (filter) => reg.listProposals(filter),
      decide: (id, status, reason) => reg.decide(id, status, reason),
      accepted: () => reg.getAccepted(),
    };

    this.server = createMcpServer(
      buildRouter(data, flows, {
        sessionStore: store,
        profileStore,
        vaultCrypto: vault,
        flowRegistry,
        proposer: userId, // attribute proposals to the authenticated subject (#73)
      }),
    );
  }
}

// --- Real per-user OAuth: delegate /authorize to GitHub (the upstream IdP) ---
// The provider stays our authorization server (DCR, /token, discovery metadata, and a
// 401 + WWW-Authenticate on the protected API for unauthenticated clients). GitHub
// authenticates the human; we round-trip the full AuthRequest through GitHub's `state`
// param (no KV needed), then carry the identity into the grant `props` — which reach the
// session DO as `this.props`. No password is ever stored.
const authHandler = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const callbackUri = `${url.origin}/callback`;

    if (url.pathname === "/authorize") {
      const config = githubConfig(env);
      const oauth = getOAuthApi(oauthOptions, env);
      const authReq = await oauth.parseAuthRequest(request);
      return Response.redirect(
        githubAuthorizeUrl({
          clientId: config.clientId,
          redirectUri: callbackUri,
          state: encodeAuthState(authReq),
        }),
        302,
      );
    }

    if (url.pathname === "/callback") {
      const config = githubConfig(env);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        return new Response("missing code/state", { status: 400 });
      }

      let authReq: AuthRequest;
      try {
        authReq = decodeAuthState(state);
      } catch {
        return new Response("invalid state", { status: 400 });
      }

      const identity = await fetchGitHubIdentity(code, callbackUri, config);
      if (!identity) {
        return new Response("GitHub authentication failed", { status: 502 });
      }

      const oauth = getOAuthApi(oauthOptions, env);
      const { redirectTo } = await oauth.completeAuthorization({
        request: authReq,
        userId: identity.userId,
        metadata: { login: identity.login },
        scope: authReq.scope,
        props: {
          userId: identity.userId,
          login: identity.login,
          name: identity.name,
        },
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

const oauthProvider = new OAuthProvider<Env>(oauthOptions);

// Per-IP rate-limit backstop (mirrors the live worker). NOTE: unlike the stateless live
// endpoint, this stateful endpoint legitimately uses GET/SSE for per-session streams, so we
// do NOT 405 GET here — that would break McpAgent's sessions. Just the rate limit, checked
// before OAuth/work.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.MCP_RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "retry-after": "10", "content-type": "text/plain" },
      });
    }
    return oauthProvider.fetch(request, env, ctx);
  },
};
