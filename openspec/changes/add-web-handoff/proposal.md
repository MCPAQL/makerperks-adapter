## Why

Stage 1 (#21), the last open item under epic #22. Many high-value perks have **no API** —
they are `web_only` (e.g. `gcp/google-ai-startup-program`) or `manual_review` (e.g. the
Anthropic startup program). The pipeline (#17) can't submit those in-process and today emits
only a string stub at submission (`"prepared handoff … see #21"`). This change turns that stub
into a **structured handoff package**: the pipeline pre-assembles everything an external
**browser-automation agent** (computer-use / browser-use) needs — the apply URL, the
profile-filled inputs, what's still pending, the exact instructions, the danger level, and an
explicit eligibility notice — and hands it off. The adapter still **never drives a headless
browser itself**. No plaintext secret ever enters the package, and eligibility is never
auto-asserted.

## What Changes

- **`get_handoff(execution_id)`** — a new read-only EXECUTE op that builds a structured handoff
  package for an in-flight execution from its accumulated inputs + the maker profile + the
  program's flow. It is the primary surface (discoverable, re-fetchable).
- **The handoff package** carries: `provider` / `slug` / `title`, `automatability`,
  `action_url`, `method`, `instructions`, `assembled_inputs` (non-secret, profile-filled
  field values), `pending_inputs` (still-missing or credential-sourced fields, each with a
  reason — **never a secret value**), `danger_level`, `confidence`, `gaps`, and an
  `eligibility_notice`.
- **`submit_step` at submission for non-`api` flows** stops claiming a simulated submission:
  it reports `handoff_available: true`, points to `get_handoff`, and its `did` reflects a
  prepared web handoff (not an in-pipeline submit). `api` flows are unchanged.
- **Security & posture:** `source: "credential"` fields go to `pending_inputs` with an
  out-of-band note (the secret is supplied to the browser agent / maker directly, never emitted
  by the adapter). Eligibility is **surfaced, not decided** — the `eligibility_notice` + `gaps`
  inform the maker, but the adapter neither auto-asserts nor auto-denies eligibility and never
  hard-blocks proceeding (the only hard stop remains `danger >= 3`). A maker who judges their
  project eligible may proceed (including simulating a follow-through).

## Capabilities

### New Capabilities

- `web-handoff`: a prepared, structured handoff package for `web_only` / `manual_review` perks
  that an external browser-automation agent can act on, carrying no secrets and never
  auto-asserting eligibility.

## Impact

- **Affected specs:** `web-handoff` (new); `application-pipeline` (MODIFIED — non-`api`
  submission produces a handoff pointer instead of a simulated submission).
- **Affected code:** new handoff builder + `get_handoff` op in `src/operations/execute.ts`
  (bound to the existing session + optional profile store); the `submit_step` submission
  branch for non-`api` flows; tests. The READ surface, the vault, and `api`-flow behaviour are
  unchanged.
- **Non-goals / tracked follow-up:** the adapter driving a browser; a specific browser-agent
  protocol/transport; real credential injection; expanding `web_only` provider-flow coverage
  (#48).
