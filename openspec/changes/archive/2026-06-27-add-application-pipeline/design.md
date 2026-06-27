# Design — Application pipeline (EXECUTE, fully simulated) (#17)

The Stage 1 payoff: an agent drives a perk application through a simulated lifecycle, gated
for safety. Builds on the flow data (#16) and the per-session DO state (#20).

## Decisions

### 1. EXECUTE category + a second tool `mcp_aql_execute`

The Router's `SemanticCategory` gains `EXECUTE`. Following the MCP-AQL per-category tool
convention, `createMcpServer` exposes a second tool `mcp_aql_execute` (the unchanged
`mcp_aql_read` stays). Both route to the same `router.dispatch`; `introspect` already
reflects all registered ops, so discovery is automatic. Keeping two tools (rather than one
catch-all) matches the reference adapters and keeps the READ token-efficiency story intact.

### 2. Per-session state, threaded — the real structural change

READ handlers are pure. EXECUTE handlers must read and mutate *this session's* state, so:

- A minimal **`SessionStore`**: `{ get(): SessionState; set(next): void | Promise<void> }`.
- The **Router is built per session**, with EXECUTE ops closed over that session's store;
  the **`DataSource` stays cached per isolate** (the expensive part). So in
  `worker-stateful.ts` we stop caching the *router* per isolate and instead cache the
  *data*, rebuilding a cheap router per agent `init()` bound to a DO-backed store
  (`{ get: () => this.state, set: (s) => this.setState(s) }`).
- **stdio** (single process = single session) uses an in-memory store — which is exactly
  the local personal-tool mode (#34): executions never leave the machine.
- The live stateless **`worker.ts`** passes **no** store, so EXECUTE ops are not registered
  there — it stays READ-only and untouched (no cutover).

This keeps the core transport-agnostic: the store is an injected capability, not a transport
dependency.

### 3. The simulated lifecycle

`start_application(slug)` creates an execution in `SessionState.executions` keyed by a fresh
id (`crypto.randomUUID()`), at stage `eligibility`, status `pending`. `submit_step` advances
it: `eligibility → assemble → submission → verification → redeem` (status
`pending → running → completed`). `get_status` returns the current stage, status, the next
required step, and the flow's `gaps`. **Submission is simulated** — it records what *would*
be sent (to the flow's `action_url`/`endpoint`, with the assembled inputs) and returns a
clearly-marked `simulated: true` result. No `fetch`, no side effects.

Inputs arrive **per call** (`submit_step(..., inputs)`); the persistent profile/vault is
#19/#34. `web_only`/`manual_review` flows produce a **prepared handoff** at the submission
stage instead of a simulated API submit (the browser agent is #21).

### 4. Batch-with-halting + confirmation tokens

Before a step whose `danger_level` meets/exceeds the gate **threshold** (fixed default:
`>= 1` — anything beyond a free, no-assertion signup), the pipeline **halts**: it returns
`CONFIRMATION_REQUIRED` plus a **confirmation token** stored in
`SessionState.confirmationTokens`. Tokens are **single-use**, **time-limited** (`Date.now()`
+ TTL), and **param-bound** (bound to `execution_id` + stage + a hash of the inputs). The
agent resumes by replaying `submit_step` with the token; the server verifies it (exists,
unexpired, unused, params match), consumes it, and proceeds. A wrong/expired/replayed token
is rejected. The *configurable* threshold (review-each / auto-low-risk / full-auto) is the
autonomy switch (#18) — this change ships the mechanism with one sensible default.

### 5. Opt-in Execution Safety Loop

`record_execution_step(nextActionHint)` evaluates an intended action against its danger
level and returns an `AutonomyDirective` (`{ decision: "go" | "pause" | "stop", reason }`).
It is **opt-in** and independent of the lifecycle ops — the agent-agnostic monitoring
substrate (MCP-AQL spec §8.6) that Dollhouse's bimodal pipeline, or anyone's, can drive. It
manages **no** agent state/personas — purely evaluate-and-advise.

## Risks & boundaries

- **Per-session router** adds a tiny per-init cost on the stateful endpoint — acceptable and
  confined there; data stays cached.
- **Simulated** is a deliberate non-goal of real submission; every simulated result is
  marked so it can never be mistaken for a real one.
- Confirmation-token storage rides on the `SessionState` substrate (#20); no new persistence.

## Out of scope (tracked)

Autonomy switch (#18), profile/credential vault (#19/#34), `web_only` browser automation
(#21), real submission, service Create/Update/Delete (#35/#36), live cutover.
