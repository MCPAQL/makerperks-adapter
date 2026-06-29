#!/usr/bin/env node
// Generate a perks.json from the server's federated directory (#84 / #89) — the server as producer.
// Dev tooling, never bundled. Two modes:
//
//   Local (default): load the data layer (the configured feeds) and emit a schema-valid perks.json.
//   Point at feeds with --source <url|path> (repeatable) or MAKERPERKS_SOURCE; default = the live feed.
//
//   Remote (--url): call the `export_perks` op against a running deployment over MCP (emits exactly
//   what that server's federated directory would produce). MAKERPERKS_TOKEN for an auth'd endpoint.
//
//   node scripts/export-perks.mjs --out ./perks.json
//   node scripts/export-perks.mjs --source ./a.json --source ./b.json --out ./perks.json
//   node scripts/export-perks.mjs --feed beta --name "Beta feed" --out ./beta.json
//   node scripts/export-perks.mjs --url https://makerperks-dev.mcpaql.com/mcp --out ./perks.json
//
// Requires a prior `npm run build` (reads dist/). Eval-free; no provider SDK.

import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
// --source is repeatable (collect every occurrence).
const sourcesFromArgs = args.reduce((acc, a, i) => {
  if (a === "--source" && args[i + 1]) acc.push(args[i + 1]);
  return acc;
}, []);
const out = flag("--out") ?? "perks.export.json";
const url = flag("--url");
const feed = flag("--feed");
const name = flag("--name");

function emit(payload) {
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote ${payload.count} program(s) to ${out} (name: "${payload.name}").`);
}

if (url) {
  // Remote: drive the `export_perks` READ op over MCP.
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const token = process.env.MAKERPERKS_TOKEN;
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  const client = new Client({ name: "export-perks", version: "0.0.0" });
  await client.connect(transport);
  const res = await client.callTool({
    name: "mcp_aql_read",
    arguments: {
      operation: "export_perks",
      params: { ...(feed ? { feed } : {}), ...(name ? { name } : {}) },
    },
  });
  await client.close();
  const out_ = JSON.parse(res.content[0].text);
  if (!out_.success) {
    console.error("export_perks failed:", out_.error);
    process.exit(1);
  }
  emit(out_.payload ?? out_.data.payload);
} else {
  // Local: emit from the data layer directly (the same federation the op uses).
  const { DataSource } = await import("../dist/data/source.js");
  const sources = sourcesFromArgs.length
    ? sourcesFromArgs
    : process.env.MAKERPERKS_SOURCE
      ? [process.env.MAKERPERKS_SOURCE]
      : undefined;
  const data = new DataSource(sources ? { sources } : {});
  await data.ensureLoaded();
  const programs = data
    .programs()
    .filter((p) => !feed || p.feed === feed)
    .map((p) => {
      const clean = { ...p };
      delete clean.feed; // strip the server-set provenance tag
      return clean;
    });
  emit({
    name: name ?? data.meta().name,
    generated: new Date().toISOString(),
    count: programs.length,
    programs,
  });
}
