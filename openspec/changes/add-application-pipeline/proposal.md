## Why

This is the Stage 1 payoff (#17): the first capability where an agent **acts** — driving a
perk application through its lifecycle so the maker reviews a queue instead of navigating
bespoke sites. It sits directly on what we already built: it executes against the **flow
data** (#16) and uses the **per-session state substrate** (#20's Durable Object +
`SessionState`).

**Fully simulated, end to end.** No external provider calls and no real-world side effects:
the value being proven here is the *machinery* — the EXECUTE lifecycle, **batch-with-halting**,
**confirmation tokens**, danger gating, and the opt-in **Execution Safety Loop** — not real
account creation (almost no provider exposes a signup API anyway, and the risky part is
exactly what we don't want to automate yet). A simulated pipeline is safe, demoable, and is
the same engine the local personal-tool mode will run on.

## What Changes

- **A new `EXECUTE` semantic category** on the Router (today it is `READ`-only), exposed as a
  second MCP tool **`mcp_aql_execute`** (the MCP-AQL per-category convention), alongside the
  unchanged `mcp_aql_read`.
- **Per-session execution, threaded cleanly.** EXECUTE handlers need *this session's* state,
  so the Router is built **per session** bound to a small `SessionStore` abstraction, while
  the expensive `DataSource` stays cached per isolate. The store is backed by the Durable
  Object's `SessionState` on the stateful endpoint, by an **in-memory** store over stdio
  (the local personal-tool path), and is **absent** on the live stateless Stage 0 worker —
  which therefore stays READ-only and untouched.
- **The application lifecycle (simulated):** `start_application(slug)` →
  `submit_step(execution_id, inputs?)` → `get_status(execution_id)`, walking
  `eligibility → assemble inputs → submission (simulated) → verification → redeem+track`
  (`pending → running → completed`). Executions live in `SessionState.executions`.
- **Batch-with-halting + confirmation tokens:** a step whose danger exceeds the threshold
  halts with `CONFIRMATION_REQUIRED` and a **single-use, time-limited, param-bound** token
  (in `SessionState.confirmationTokens`); the agent resumes by replaying with the token.
- **Opt-in Execution Safety Loop:** `record_execution_step(nextActionHint)` →
  `AutonomyDirective` (`go` / `pause` / `stop`), the agent-agnostic safety substrate any
  pipeline (Dollhouse's or anyone's) can drive. Opt-in; off by default.

## Capabilities

### New Capabilities

- `application-pipeline`: a simulated CRUDE **EXECUTE** surface (`mcp_aql_execute`) driving
  the per-perk application lifecycle with batch-with-halting, session-scoped confirmation
  tokens, danger gating, and the opt-in Execution Safety Loop.

## Impact

- **Affected specs:** `application-pipeline` (new).
- **Affected code:** Router gains the `EXECUTE` category and a per-call session context; a
  `SessionStore` interface; `src/operations/execute.ts` (lifecycle ops + safety loop);
  `createMcpServer` exposes `mcp_aql_execute`; `buildApp`/the Worker entries wire the store
  (DO-backed in `worker-stateful.ts`, in-memory for stdio, none for the live `worker.ts`).
  The READ surface and the flow data are unchanged.
- **Boundaries (kept clean):** inputs are passed **per call** for now — the persistent
  maker profile/credential vault is #19/#34; the danger gate uses a **fixed default**
  threshold — the *configurable* autonomy switch is #18; `web_only` providers surface a
  prepared handoff but the browser-automation agent is #21.
- **Non-goals / tracked follow-up:** real provider submission (intentionally simulated),
  the autonomy switch (#18), the profile/vault (#19/#34), the web-only browser handoff
  (#21), and cutting the live endpoint over to the stateful build.
