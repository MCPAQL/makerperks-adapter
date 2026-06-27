import { test } from "node:test";
import assert from "node:assert/strict";
import { freshSessionState, autonomyDecision } from "../dist/session/state.js";

test("autonomyDecision maps mode × danger (danger ≥ 3 always stops)", () => {
  assert.equal(autonomyDecision("review_each", 0), "pause"); // pauses everything
  assert.equal(autonomyDecision("review_each", 2), "pause");
  assert.equal(autonomyDecision("auto_low_risk", 1), "go"); // auto 0–1
  assert.equal(autonomyDecision("auto_low_risk", 2), "pause"); // escalate ≥ 2
  assert.equal(autonomyDecision("full_auto", 2), "go"); // auto 0–2
  assert.equal(autonomyDecision("full_auto", 3), "stop"); // riskiest always stops
  assert.equal(autonomyDecision("review_each", 4), "stop");
});

test("freshSessionState has the substrate shape, empty (READ never fills it)", () => {
  const s = freshSessionState();
  assert.deepEqual(s, {
    confirmationTokens: {},
    executions: {},
    autonomy: "review_each",
  });
});

test("each session gets an independent state — no shared reference leaks", () => {
  const a = freshSessionState();
  const b = freshSessionState();
  assert.notEqual(a, b);
  assert.notEqual(a.confirmationTokens, b.confirmationTokens);
  assert.notEqual(a.executions, b.executions);

  // Mutating one session's substrate must not leak into another.
  a.confirmationTokens["tok_1"] = { paramHash: "abc", expiresAt: 1 };
  a.executions["exec_1"] = { status: "running" };
  assert.deepEqual(b, {
    confirmationTokens: {},
    executions: {},
    autonomy: "review_each",
  });
});
