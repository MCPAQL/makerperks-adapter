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

- [x] 1.1 Added `EXECUTE` to the Router `SemanticCategory`; `SessionStore` interface +
  `inMemorySessionStore` in `src/session/state.ts`; typed `Execution` / `ConfirmationToken`
- [x] 1.2 `buildRouter(data, {sessionStore?})` split from `buildApp`; EXECUTE ops register
  only when a store is present (data-load is separable for the per-isolate cache)
- [x] 1.3 `createMcpServer` adds `mcp_aql_execute` **iff** the router has EXECUTE ops;
  `mcp_aql_read` + introspect unchanged. Stores wired: in-memory (`index.ts`, the local
  mode), DO-backed in `worker-stateful.ts` (caches data, rebuilds router per agent bound to
  `this.state`/`setState`), **none** in the live `worker.ts` (stays READ-only)
- [x] 1.4 `src/operations/execute.ts` (start_application + get_status for §1); tests:
  EXECUTE registers only with a store, lifecycle create→status, unknown-slug/id 404,
  per-session isolation, and an http end-to-end (`mcp_aql_execute` exposed + dispatches).
  Transport parity updated to the 8-op read+execute surface. 51 green

## 2. Simulated application lifecycle

- [x] 2.1 `start_application(slug)` → execution in `SessionState.executions` (uuid, stage
  `eligibility`, status `pending`) — from §1
- [x] 2.2 `submit_step(execution_id, inputs?)` advances `eligibility → assemble → submission
  → verification → redeem` one stage/call; **submission simulated** (`simulated: true`,
  records the would-be target + inputs; `web_only`/`manual_review` → a prepared `#21`
  handoff); merges inputs + reports `missing_inputs`. No `fetch`. Added an `object` ParamType
  to the Router for typed `inputs`
- [x] 2.3 `get_status(execution_id)` → execution + flow summary (automatability, confidence,
  danger_level, `gaps`) + `next_step`; unknown id → `NOT_FOUND_RESOURCE`
- [x] 2.4 Tests: full lifecycle to `completed`, simulated-submission vs prepared-handoff,
  missing-inputs, flow context, already-completed, unknown id. Verified live (Deepgram drives
  start→…→done). 56 green

## 3. Batch-with-halting + confirmation tokens

- [x] 3.1 The submission step gates when `flow.danger_level >= 1` (fixed default): halts with
  a `status: halted` + `confirmation_required` result carrying a single-use token in
  `SessionState.confirmationTokens` (TTL 5 min via `Date.now()`, param-bound by a stable
  hash of the merged inputs); the execution does not advance
- [x] 3.2 Resume: `submit_step` with the token verifies (exists / unexpired / unused /
  execution+stage match / inputs match), consumes it in the advancing write, and proceeds.
  Invalid tokens → a `CONFIRMATION_REJECTED` error (new wire code)
- [x] 3.3 Tests: halt-without-advancing, resume-once, used/expired/unknown/tampered-inputs
  all rejected, low-danger does not halt; the §2 handoff test now confirms past the gate.
  Verified live (GCP danger 2 halts → resumes). 63 green

## 4. Opt-in Execution Safety Loop

- [ ] 4.1 `record_execution_step(nextActionHint)` → `AutonomyDirective`
  (`{ decision: go|pause|stop, reason }`) by danger level; opt-in, no agent state
- [ ] 4.2 Tests: low danger → go; gated danger → pause/stop with a reason; introspectable

## 5. Validate + archive

- [ ] 5.1 `openspec validate add-application-pipeline --strict` passes
- [ ] 5.2 typecheck/build/lint/tests green; lifecycle runs over stdio (in-memory) and the dev
  Worker (DO-backed); live endpoint confirmed READ-only/untouched
- [ ] 5.3 Archive into `openspec/specs/`
