// Workers-runtime test layer (runs IN workerd via @cloudflare/vitest-pool-workers), separate
// from the pure-core node:test suite (test/*.test.mjs). This is where the per-user Durable
// Object guarantees that node:test cannot reach get proven — real DOs, real bindings, real
// storage isolation. Bindings/migrations/compat come from wrangler.dev.jsonc (the stateful
// dev Worker), so the DO classes under test are exactly the deployed ones.
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Each test gets isolated DO storage, so subjects/tests never bleed into each other.
      isolatedStorage: true,
      // A test-only config that registers ONLY MakerProfileDO (no MCP-SDK-heavy main worker).
      wrangler: { configPath: "./wrangler.test.jsonc" },
    }),
  ],
  test: {
    include: ["test/workers/**/*.test.ts"],
  },
});
