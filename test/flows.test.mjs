import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveFlow,
  collectCuratedFlowErrors,
  mergeFlow,
  getApplicationFlow,
  freshness,
} from "../dist/data/flows.js";
import { FlowSource } from "../dist/data/flow-source.js";

// The loaded bundled overlay (flows.json) — the curated documents getApplicationFlow merges.
const flows = new FlowSource();
await flows.ensureLoaded();

const base = (over) => ({
  slug: "x/y",
  title: "Y",
  provider: "x",
  url: "https://x.example.com/",
  audience: [],
  max_value: 0,
  sources: [],
  verified: "2026-06-27",
  ...over,
});

test("derive: free_tier → api/self-serve, auto redemption, derived confidence", () => {
  const f = deriveFlow(base({ value_type: "free_tier" }));
  assert.equal(f.automatability, "api");
  assert.equal(f.submission.method, "oauth_signup");
  assert.equal(f.submission.action_url, "https://x.example.com/");
  assert.equal(f.redemption.type, "auto");
  assert.equal(f.confidence, "derived");
  assert.equal(f.danger_level, 0);
});

test("derive: high-value startup credits → manual_review handoff", () => {
  const f = deriveFlow(
    base({ value_type: "credits", max_value: 100000, audience: ["startup"] }),
  );
  assert.equal(f.automatability, "manual_review");
  assert.equal(f.submission.method, "web_form");
  assert.equal(f.redemption.type, "manual_review");
  // startup audience pulls in company inputs
  const keys = f.required_inputs.map((i) => i.key);
  assert.ok(keys.includes("company_name"));
  assert.ok(keys.includes("email") && keys.includes("full_name"));
});

test("derive: small credits → web_only/code (not gated)", () => {
  const f = deriveFlow(
    base({ value_type: "credits", max_value: 200, audience: ["indie"] }),
  );
  assert.equal(f.automatability, "web_only");
  assert.equal(f.redemption.type, "code");
});

test("derive: discount → web_only/code", () => {
  const f = deriveFlow(base({ value_type: "discount" }));
  assert.equal(f.automatability, "web_only");
  assert.equal(f.redemption.type, "code");
});

test("derive: student audience adds a verification input", () => {
  const f = deriveFlow(base({ value_type: "free_tier", audience: ["student"] }));
  const verify = f.required_inputs.find((i) => i.key === "student_verification");
  assert.ok(verify && verify.source === "credential");
});

test("derive: every baseline names its gaps (a guess is never a fact)", () => {
  const f = deriveFlow(
    base({ value_type: "credits", max_value: 5000, audience: ["startup"] }),
  );
  assert.ok(f.gaps.length >= 3);
  assert.ok(f.gaps.some((g) => g.includes("automatability")));
  assert.ok(f.gaps.some((g) => g.includes("action_url")));
  assert.equal(f.source, "derived");
});

test("derive: unknown value_type → unknown automatability/redemption", () => {
  const f = deriveFlow(base({}));
  assert.equal(f.automatability, "unknown");
  assert.equal(f.redemption.type, "unknown");
});

test("validator: a well-formed curated overlay has no errors", () => {
  const overlay = {
    "anthropic/anthropic": {
      automatability: "api",
      danger_level: 0,
      submission: {
        method: "oauth_signup",
        action_url: "https://console.anthropic.com/",
      },
      redemption: { type: "auto" },
      required_inputs: [
        { key: "email", type: "email", required: true, source: "profile" },
      ],
      gaps: [],
      source: "https://www.anthropic.com/",
      verified: "2026-06-27",
    },
  };
  assert.deepEqual(collectCuratedFlowErrors(overlay), []);
});

test("validator: catches bad enum/shape values", () => {
  const bad = {
    "p/q": {
      automatability: "sorta",
      danger_level: 9,
      submission: { method: "carrier-pigeon" },
      redemption: { type: "vibes" },
      required_inputs: [{ key: "x", type: "blob", required: "yes", source: "nowhere" }],
    },
  };
  const errs = collectCuratedFlowErrors(bad);
  assert.ok(errs.some((e) => e.includes("automatability")));
  assert.ok(errs.some((e) => e.includes("danger_level")));
  assert.ok(errs.some((e) => e.includes("submission/method")));
  assert.ok(errs.some((e) => e.includes("redemption/type")));
  assert.ok(errs.some((e) => e.includes("required_inputs")));
});

test("validator: rejects a non-object overlay", () => {
  assert.ok(collectCuratedFlowErrors([]).length > 0);
});

test("validator: accepts valid submission.oauth_providers, rejects an unknown one (#103)", () => {
  const good = {
    "p/q": {
      submission: { method: "oauth_signup", oauth_providers: ["github", "google"] },
    },
  };
  assert.deepEqual(collectCuratedFlowErrors(good), []);
  const bad = {
    "p/q": {
      submission: { method: "oauth_signup", oauth_providers: ["github", "myspace"] },
    },
  };
  const errs = collectCuratedFlowErrors(bad);
  assert.ok(errs.some((e) => e.includes("oauth_providers")));
});

test("validator: rejects oauth_providers on a non-oauth_signup method (#103)", () => {
  const bad = {
    "p/q": {
      submission: { method: "web_form", oauth_providers: ["github"] },
    },
  };
  const errs = collectCuratedFlowErrors(bad);
  assert.ok(
    errs.some((e) => e.includes("oauth_providers") && e.includes("oauth_signup")),
  );
});

// --- §2: curated overlay + merge ---

test("merge: no overlay → derived unchanged", () => {
  const derived = deriveFlow(base({ value_type: "free_tier" }));
  assert.equal(mergeFlow(derived, undefined), derived);
});

test("merge: curated wins per field, confidence flips, identity preserved", () => {
  const derived = deriveFlow(
    base({
      slug: "p/q",
      value_type: "credits",
      max_value: 100000,
      audience: ["startup"],
    }),
  );
  const merged = mergeFlow(derived, {
    automatability: "api",
    redemption: { type: "auto" },
    source: "https://p.example.com/",
    verified: "2026-06-27",
  });
  assert.equal(merged.confidence, "curated");
  assert.equal(merged.automatability, "api"); // overridden
  assert.equal(merged.redemption.type, "auto"); // overridden
  assert.equal(merged.source, "https://p.example.com/");
  assert.equal(merged.verified, "2026-06-27");
  assert.equal(merged.slug, "p/q"); // identity from baseline
  assert.deepEqual(merged.required_inputs, derived.required_inputs); // not overridden → baseline
});

test("the shipped curated overlay (flows.json) is valid", () => {
  assert.deepEqual(collectCuratedFlowErrors(flows.all()), []);
});

test("getApplicationFlow: a seeded slug returns the curated (api) flow", () => {
  const f = getApplicationFlow(
    base({
      slug: "deepgram/deepgram-pricing-startup-credits",
      provider: "deepgram",
      title: "Deepgram",
      value_type: "credits",
      max_value: 200,
      audience: ["startup"],
    }),
    flows,
  );
  assert.equal(f.confidence, "curated");
  assert.equal(f.automatability, "api");
  assert.equal(f.redemption.type, "auto");
  assert.equal(f.submission.action_url, "https://console.deepgram.com/signup");
  // #103: the curated Deepgram flow advertises its OAuth buttons
  assert.deepEqual(f.submission.oauth_providers, ["google", "github", "azure"]);
});

test("getApplicationFlow: an unseeded slug returns the derived baseline", () => {
  const f = getApplicationFlow(
    base({ slug: "nobody/nothing", value_type: "discount" }),
    flows,
  );
  assert.equal(f.confidence, "derived");
  assert.equal(f.automatability, "web_only");
});

test("freshness: recent verified is fresh, old is stale, none is not stale", () => {
  const now = Date.parse("2026-06-28T00:00:00Z");
  const fresh = freshness({ verified: "2026-06-20" }, now);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.age_days, 8);

  const old = freshness({ verified: "2026-01-01" }, now);
  assert.equal(old.stale, true); // > 90 days

  const none = freshness({}, now); // a derived baseline has no verified date
  assert.equal(none.stale, false);
  assert.equal(none.age_days, null);
});
