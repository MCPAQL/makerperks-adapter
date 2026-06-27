# Tasks — Autonomy switch (#18)

> **Scope:** a user-selectable per-session autonomy mode (review-each / auto-low-risk /
> full-auto) configuring the #17 pipeline gate. Reuses the confirmation tokens + safety loop;
> no new mechanism. Real out-of-band Challenge-Response, the vault (#19), and the web-only
> handoff (#21) are **out of scope**.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-autonomy-switch --strict`
> passes, typecheck/build/lint/tests green, modes change gating behavior end to end, and the
> live endpoint stays untouched.

## 1. Modes + policy + set/get ops

- [x] 1.1 `AutonomyMode` + `AUTONOMY_MODES` + pure `autonomyDecision(mode, danger)` (`danger ≥
  3 → stop` always; else gate 0/2/3) in `session/state.ts`; `SessionState.autonomy` defaults
  to `review_each`
- [x] 1.2 `set_autonomy(mode)` (enum-validated) + `get_autonomy()` EXECUTE ops; descriptions
  tell the agent to ask up front + report intent
- [x] 1.3 Unit-tested `autonomyDecision` (mode × danger), set/get round-trip + default +
  invalid-rejected; session-state shape updated. 68 green

## 2. Apply the mode in the pipeline

- [x] 2.1 `submit_step` gates via `autonomyDecision(session.autonomy, flow.danger_level)`
  (fixed `GATE_THRESHOLD` removed); the halt carries `decision`, `mode`, and
  `challenge_required` (`= decision === "stop"`)
- [x] 2.2 `record_execution_step` now returns `autonomyDecision(session.autonomy, danger)` +
  `mode`, so its directive matches what `submit_step` would do
- [x] 2.3 Tests: review-each halts danger-0; auto-low-risk passes danger-0 / halts danger-2;
  full-auto runs danger-2; safety loop reflects the mode. Updated the danger-0 happy-path
  tests to set a mode (default review-each now gates everything). 71 green

## 3. Validate + archive

- [ ] 3.1 `openspec validate add-autonomy-switch --strict`; typecheck/build/lint/tests green
- [ ] 3.2 Archive into `openspec/specs/`
