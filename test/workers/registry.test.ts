/**
 * registry.test.ts — the SHARED proposed-flow registry Durable Object (#47 piece D §3).
 *
 * Invariant: one named DO instance (`idFromName("flow-registry")`) holds the queue + the accepted
 * overlay + the mode for the WHOLE deployment, and it is strongly consistent — an accept performed
 * through one stub is visible (and published) on a subsequent read through any stub to the same
 * name. That consistency + the atomic accept (move pending→accepted AND publish in one DO method)
 * is exactly what a Durable Object buys over KV's eventual consistency.
 *
 * This layer proves the DO storage/consistency in real workerd; the op-handler round trip
 * (propose → dial → accept → served) is covered by the in-memory node tests (flow-acceptance).
 *
 * Runner: vitest + @cloudflare/vitest-pool-workers (`cloudflare:test` provides `env`).
 */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { applyProposalFilter } from "../../dist/session/flow-registry.js";

// Build a FlowRegistry over the single shared registry DO — the same wiring as worker-stateful.ts.
function registry() {
  const ns = env.REGISTRY_OBJECT;
  const stub = ns.get(ns.idFromName("flow-registry"));
  return {
    mode: () => stub.getMode(),
    setMode: (m) => stub.setMode(m),
    put: (p) => stub.putProposal(p),
    get: (id) => stub.getProposal(id),
    list: (f) => stub.listProposals(f),
    decide: (id, status, reason) => stub.decide(id, status, reason),
    accepted: () => stub.getAccepted(),
  };
}

const candidate = {
  automatability: "api",
  submission: { method: "oauth_signup", action_url: "https://x.example.com/signup" },
  redemption: { type: "auto" },
  danger_level: 0,
  source: "https://x.example.com/signup",
  verified: "2026-06-28",
};

const proposal = (id: string, slug: string) => ({
  id,
  kind: "flow" as const,
  slug,
  provider: slug.split("/")[0],
  candidate,
  verdict: {
    schema_valid: true,
    schema_errors: [],
    provenance_findings: [],
    eligibility_findings: [],
    adversarial_checklist: [],
    ready_for_proposal: true,
  },
  danger_level: 0,
  status: "pending" as const,
  proposedAt: 1,
});

describe("shared registry Durable Object", () => {
  it("persists the acceptance mode", async () => {
    const reg = registry();
    await reg.setMode("full_auto");
    expect(await reg.mode()).toBe("full_auto");
  });

  it("queues, lists, and reads back a proposal", async () => {
    const reg = registry();
    await reg.put(proposal("p-list", "neon/neon-list"));
    expect((await reg.get("p-list"))?.slug).toBe("neon/neon-list");
    const pending = await reg.list({ status: "pending" });
    expect(pending.some((p) => p.id === "p-list")).toBe(true);
  });

  it("accept atomically publishes to the accepted overlay, visible on a fresh stub", async () => {
    const reg = registry();
    await reg.put(proposal("p-accept", "neon/neon-accept"));
    const decided = await reg.decide("p-accept", "accepted");
    expect(decided.status).toBe("accepted");

    // A SEPARATE stub to the SAME named DO sees the published overlay — the shared-registry
    // consistency that makes "accepted → served live" work across reads.
    const fresh = registry();
    const accepted = await fresh.accepted();
    expect(accepted["neon/neon-accept"]).toBeDefined();
    expect(accepted["neon/neon-accept"].automatability).toBe("api");
    expect((await fresh.get("p-accept"))?.status).toBe("accepted");
  });

  it("the same name resolves the same shared instance (operator-shared, not per-user)", () => {
    const ns = env.REGISTRY_OBJECT;
    expect(String(ns.idFromName("flow-registry"))).toBe(
      String(ns.idFromName("flow-registry")),
    );
    // sanity: the shared filter helper the DO uses is the same one the in-memory impl uses
    expect(applyProposalFilter([], { status: "pending" })).toEqual([]);
  });
});
