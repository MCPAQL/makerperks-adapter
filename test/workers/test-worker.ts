// Minimal Worker entry for the vitest-pool-workers harness. It exists ONLY to register the
// Durable Objects (and their bindings) inside workerd for the workers tests: the per-user
// MakerProfileDO (isolation) and the shared FlowRegistryDO (registry consistency). We deliberately
// do NOT load the real stateful worker (worker-stateful.ts) here: it pulls in the MCP SDK (and
// ajv), which the test bundler can't resolve for workerd. The tests drive the real op handlers /
// the DO directly, so the full transport isn't needed.
export { MakerProfileDO } from "../../dist/durable-profile.js";
export { FlowRegistryDO } from "../../dist/durable-registry.js";

export default {
  async fetch(): Promise<Response> {
    return new Response("makerperks test harness");
  },
};
