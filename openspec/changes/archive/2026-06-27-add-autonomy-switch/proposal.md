## Why

Stage 1 (#18). The application pipeline (#17) gates risky steps with a **fixed** danger
threshold (`>= 1`). The autonomy switch makes that threshold the **user's dial** — chosen up
front, changeable anytime — without adding new machinery: it is a configured threshold over
the confirmation tokens + Execution Safety Loop we already built.

Three modes, keeping the maker in control:
- **review-each** — every submission pauses for approval (gate at danger 0).
- **auto-low-risk** — auto-submit danger 0–1; escalate (halt) at danger ≥ 2.
- **full-auto** — submit within policy; the highest-risk steps (payment / real identity,
  danger ≥ 3) still stop for an out-of-band challenge.

Across all modes, **danger ≥ 3 always stops** (challenge-response), and the agent always
reports intent. The default is the safest mode, **review-each**.

## What Changes

- **Per-session autonomy** in `SessionState` (`autonomy`, default `review_each`), set via a
  new `set_autonomy(mode)` and read via `get_autonomy()` (EXECUTE ops; both report intent).
- **One policy function** `autonomyDecision(mode, danger) → go | pause | stop` mapping a mode
  to a gate threshold (review_each 0 / auto_low_risk 2 / full_auto 3) with `danger ≥ 3 → stop`
  in every mode.
- **`submit_step` gating reads the session mode** instead of the fixed constant: `go` →
  proceed, `pause`/`stop` → halt with a confirmation token (a `stop` halt is flagged
  `challenge_required` — real out-of-band Challenge-Response is a tracked follow-on).
- **`record_execution_step` reflects the session mode** so its directive matches what
  `submit_step` would do.

## Capabilities

### New Capabilities

- `autonomy-switch`: a user-selectable per-session autonomy mode (review-each / auto-low-risk
  / full-auto) that configures the application-pipeline gate, defaulting to review-each.

## Impact

- **Affected specs:** `autonomy-switch` (new).
- **Affected code:** `SessionState.autonomy` + `AutonomyMode` + `autonomyDecision` (session
  module); `set_autonomy`/`get_autonomy` ops; `submit_step` + `record_execution_step` consult
  the mode (replacing the fixed `GATE_THRESHOLD`). The READ surface and flow data are unchanged.
- **Non-goals / tracked follow-up:** real out-of-band **Challenge-Response** (LLM-invisible
  code) for `stop` steps; the profile/credential vault (#19/#34); the web-only handoff (#21).
