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

- [ ] 1.1 `AutonomyMode` (`review_each` | `auto_low_risk` | `full_auto`) + `autonomyDecision(mode,
  danger) → go|pause|stop` (`danger ≥ 3 → stop` always; else mode gate threshold 0/2/3) in the
  session module; `SessionState.autonomy` defaults to `review_each`
- [ ] 1.2 `set_autonomy(mode)` (validated enum) and `get_autonomy()` EXECUTE ops; descriptions
  tell the agent to ask up front + report intent
- [ ] 1.3 Unit-test `autonomyDecision` across modes × danger 0–4; set/get round-trip; default

## 2. Apply the mode in the pipeline

- [ ] 2.1 `submit_step` gates via `autonomyDecision(session.autonomy, flow.danger_level)`
  (replacing the fixed threshold); `stop` halts with `challenge_required: true`
- [ ] 2.2 `record_execution_step` returns `autonomyDecision(session.autonomy, danger)` so its
  directive matches the pipeline
- [ ] 2.3 Tests: review-each halts a danger-0 perk; auto-low-risk lets danger-0 through but
  halts danger-2; full-auto auto-runs danger-2 and stops danger-3+ (`challenge_required`)

## 3. Validate + archive

- [ ] 3.1 `openspec validate add-autonomy-switch --strict`; typecheck/build/lint/tests green
- [ ] 3.2 Archive into `openspec/specs/`
