# Design — Autonomy switch (#18)

Not new machinery: a per-session policy over the #17 confirmation + safety-loop primitives.

## Decisions

### 1. One policy function maps mode → decision

`autonomyDecision(mode, danger): "go" | "pause" | "stop"`:

- `danger >= 3` → **stop** in every mode (payment / real identity always hit an out-of-band
  challenge).
- else `danger >= gateThreshold(mode)` → **pause** (confirm before proceeding).
- else → **go**.

`gateThreshold`: `review_each` = 0 (everything pauses), `auto_low_risk` = 2 (0–1 auto, ≥2
pauses), `full_auto` = 3 (0–2 auto; only ≥3, which is always stop). Pure and unit-testable;
it owns the entire policy so `submit_step` and `record_execution_step` stay thin.

### 2. Mode lives in SessionState; default is the safest

`SessionState.autonomy: AutonomyMode` defaults to `review_each` (fresh sessions are
maximally cautious). `set_autonomy(mode)` changes it; `get_autonomy()` reads it. Both are
EXECUTE ops (they touch session state) and their descriptions instruct the agent to ask the
maker up front and to report intent — the server defaults safe but cannot force the ask.

### 3. The pipeline consults the mode instead of a constant

`submit_step` replaces `flow.danger_level >= GATE_THRESHOLD` with
`autonomyDecision(session.autonomy, flow.danger_level) !== "go"`. A `stop` decision still
halts with a confirmation token but flags `challenge_required: true` (the real out-of-band
Challenge-Response — an LLM-invisible code — is a tracked follow-on; the token is the
interim gate). `record_execution_step` returns the same `autonomyDecision`, so the safety
loop's advice matches what the pipeline would actually do.

## Out of scope (tracked)

Real Challenge-Response for `stop`; the profile/credential vault (#19/#34); the web-only
browser handoff (#21).
