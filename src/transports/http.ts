// Streamable HTTP transport binding — a single endpoint with optional SSE,
// Mcp-Session-Id sessions, and Host/Origin validation. NOT the deprecated HTTP+SSE
// transport. See docs/ARCHITECTURE.md §2.

import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../mcp.js";
import type { Router } from "../core/router.js";

export interface HttpOptions {
  port?: number;
  host?: string;
  path?: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  enableDnsRebindingProtection?: boolean;
}

export interface HttpServerHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function startHttp(
  router: Router,
  opts: HttpOptions = {},
): Promise<HttpServerHandle> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 3000;
  const path = opts.path ?? "/mcp";
  const allowedHosts = opts.allowedHosts ?? [
    `${host}:${port}`,
    `localhost:${port}`,
    `127.0.0.1:${port}`,
  ];
  const dnsProtection = opts.enableDnsRebindingProtection ?? true;

  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
      if (url.pathname !== path) {
        res.writeHead(404).end();
        return;
      }

      const body = await readJsonBody(req);
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (req.method !== "POST" || !isInitializeRequest(body)) {
          res.writeHead(400, { "content-type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "No valid session; expected an initialize request.",
              },
              id: null,
            }),
          );
          return;
        }
        const created: StreamableHTTPServerTransport =
          new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableDnsRebindingProtection: dnsProtection,
            allowedHosts,
            allowedOrigins: opts.allowedOrigins,
            onsessioninitialized: (sid) => {
              transports.set(sid, created);
            },
            onsessionclosed: (sid) => {
              transports.delete(sid);
            },
          });
        await createMcpServer(router).connect(created);
        transport = created;
      }

      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) {
        res
          .writeHead(500, { "content-type": "application/json" })
          .end(JSON.stringify({ error: String(error) }));
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));

  return {
    port,
    url: `http://${host}:${port}${path}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== "POST") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}
