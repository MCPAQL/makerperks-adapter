#!/usr/bin/env node
// Export the curated flows overlay to a portable flows.json file (#84 / #86) — the read-out half
// of the round-trip. Dev tooling, never bundled. Two modes:
//
//   Local (default): load a FlowSource and write its overlay. This is the loaded flows.json only
//   (no accepted overlay — there is no registry locally), so every slug is `base`. Respects
//   FLOWS_URL, or pass --source <path|url> to point at a specific overlay.
//
//   Remote (--url): call the `export_flows` op against a running deployment over MCP, capturing the
//   EFFECTIVE overlay (loaded flows.json ⊕ the registry's accepted overlay, accepted winning) —
//   i.e. exactly what that server serves. Pass a bearer token via MAKERPERKS_TOKEN if the endpoint
//   requires auth (the stateful worker does).
//
//   node scripts/export-flows.mjs                          # local bundled overlay -> flows.export.json
//   node scripts/export-flows.mjs --source ./my-flows.json --out ./flows.json
//   FLOWS_URL=https://… node scripts/export-flows.mjs      # local, from a hosted overlay
//   node scripts/export-flows.mjs --url https://makerperks-dev.mcpaql.com/mcp --out ./flows.json
//
// Requires a prior `npm run build` (reads dist/). Eval-free; no provider SDK.

import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = flag("--out") ?? "flows.export.json";
const url = flag("--url");
const source = flag("--source") ?? process.env.FLOWS_URL;

/** Write the merged overlay + report a small source breakdown summary. */
function emit(flows, sources) {
  writeFileSync(out, JSON.stringify(flows, null, 2) + "\n");
  const slugs = Object.keys(flows);
  const accepted = sources ? slugs.filter((s) => sources[s] === "accepted").length : 0;
  console.log(
    `Wrote ${slugs.length} flow(s) to ${out}` +
      (sources ? ` (${slugs.length - accepted} base, ${accepted} accepted).` : "."),
  );
}

if (url) {
  // Remote: drive the `export_flows` READ op over MCP so the export includes the accepted overlay.
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const token = process.env.MAKERPERKS_TOKEN;
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  const client = new Client({ name: "export-flows", version: "0.0.0" });
  await client.connect(transport);
  const res = await client.callTool({
    name: "mcp_aql_read",
    arguments: { operation: "export_flows" },
  });
  await client.close();
  const payload = JSON.parse(res.content[0].text);
  if (!payload.success) {
    console.error("export_flows failed:", payload.error);
    process.exit(1);
  }
  emit(payload.data.flows, payload.data.sources);
} else {
  // Local: load the data layer directly (the same merge the op does, minus the registry).
  const { FlowSource } = await import("../dist/data/flow-source.js");
  const flows = new FlowSource(source ? { source } : {});
  await flows.ensureLoaded();
  const overlay = flows.all();
  const sources = Object.fromEntries(Object.keys(overlay).map((s) => [s, "base"]));
  emit(overlay, sources);
}
