import { test } from "node:test";
import assert from "node:assert/strict";
import { freshSessionState } from "../dist/session/state.js";

test("freshSessionState has the substrate shape, empty (READ never fills it)", () => {
  const s = freshSessionState();
  assert.deepEqual(s, { confirmationTokens: {}, executions: {} });
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
  assert.deepEqual(b, { confirmationTokens: {}, executions: {} });
});
