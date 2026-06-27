# Tasks — Application pipeline (EXECUTE, fully simulated) (#17)

> **Scope:** a simulated CRUDE **EXECUTE** surface over the flow data — `start_application`
> → `submit_step` → `get_status`, batch-with-halting, session-scoped confirmation tokens,
> danger gating (fixed default), and the opt-in Execution Safety Loop. **Fully simulated** —
> no external calls. The autonomy switch (#18), profile/vault (#19/#34), and web-only browser
> automation (#21) are **out of scope**.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-application-pipeline
> --strict` passes, typecheck/build/lint/tests green, the EXECUTE lifecycle runs end to end
> over stdio (in-memory) and the dev Worker (DO-backed), and the live `makerperks.mcpaql.com`
> stays READ-only/untouched.

## 1. EXECUTE category + session plumbing

- [ ] 1.1 Add `EXECUTE` to the Router `SemanticCategory`; add a `SessionStore` interface
  (`get(): SessionState; set(next): void | Promise<void>`)
- [ ] 1.2 Split data-load (cached per isolate) from router assembly; `buildApp` accepts an
  optional `sessionStore` and registers EXECUTE ops only when present
- [ ] 1.3 `createMcpServer` exposes a second tool `mcp_aql_execute` (route to `dispatch`);
  `mcp_aql_read` + introspect unchanged. Wire stores: in-memory for stdio (`index.ts`),
  DO-backed in `worker-stateful.ts` (rebuild router per agent; cache data only), **none** in
  the live `worker.ts`
- [ ] 1.4 Tests: `mcp_aql_execute` present only when a store is wired; READ surface unchanged

## 2. Simulated application lifecycle

- [ ] 2.1 `src/operations/execute.ts`: `start_application(slug)` → creates an execution in
  `SessionState.executions` (uuid, stage `eligibility`, status `pending`)
- [ ] 2.2 `submit_step(execution_id, inputs?)` advances `eligibility → assemble → submission
  → verification → redeem`; **submission is simulated** (`simulated: true`, records the
  would-be target + inputs; `web_only`/`manual_review` → a prepared handoff). No `fetch`
- [ ] 2.3 `get_status(execution_id)` → stage, status, next step, flow `gaps`; unknown id →
  `NOT_FOUND_RESOURCE`
- [ ] 2.4 Tests: full happy-path lifecycle to `completed`; per-session isolation of executions

## 3. Batch-with-halting + confirmation tokens

- [ ] 3.1 Gate steps with `danger_level >= 1` (fixed default): halt with `CONFIRMATION_REQUIRED`
  + a token in `SessionState.confirmationTokens` (single-use, TTL via `Date.now()`,
  param-bound to execution_id + stage + inputs hash)
- [ ] 3.2 Resume: `submit_step` with a valid token verifies (exists/unexpired/unused/params
  match), consumes it, proceeds; wrong/expired/replayed → rejected
- [ ] 3.3 Tests: halt → resume → complete; replay rejected; expired rejected; tampered inputs rejected

## 4. Opt-in Execution Safety Loop

- [ ] 4.1 `record_execution_step(nextActionHint)` → `AutonomyDirective`
  (`{ decision: go|pause|stop, reason }`) by danger level; opt-in, no agent state
- [ ] 4.2 Tests: low danger → go; gated danger → pause/stop with a reason; introspectable

## 5. Validate + archive

- [ ] 5.1 `openspec validate add-application-pipeline --strict` passes
- [ ] 5.2 typecheck/build/lint/tests green; lifecycle runs over stdio (in-memory) and the dev
  Worker (DO-backed); live endpoint confirmed READ-only/untouched
- [ ] 5.3 Archive into `openspec/specs/`
