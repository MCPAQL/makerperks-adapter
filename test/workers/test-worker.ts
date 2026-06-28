// Minimal Worker entry for the vitest-pool-workers harness. It exists ONLY to register the
// per-user MakerProfileDO Durable Object (and its binding) inside workerd for the isolation
// tests. We deliberately do NOT load the real stateful worker (worker-stateful.ts) here: it
// pulls in the MCP SDK (and ajv), which the test bundler can't resolve for workerd. The tests
// drive the real op handlers directly over this DO, so the full transport isn't needed.
export { MakerProfileDO } from "../../dist/durable-profile.js";

export default {
  async fetch(): Promise<Response> {
    return new Response("makerperks test harness");
  },
};
