# Tasks — Web-only provider handoff (#21)

> **Scope:** turn the non-`api` submission stub into a structured `get_handoff` package for an
> external browser-automation agent. The adapter never drives a browser, never emits a secret,
> and never auto-asserts eligibility. The adapter driving a browser, a concrete browser-agent
> protocol, real credential injection, and broader provider coverage (#48) are **out of scope**.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-web-handoff --strict` passes,
> typecheck/lint/both test layers green, `get_handoff` returns a complete package for a
> `web_only` flow (assembled vs pending, no secrets, eligibility notice), `submit_step` points
> to it for non-`api` flows, `api` flows unchanged, and the live endpoints stay correct. One
> commit per section, closing its issue.

## 1. Handoff package builder + `get_handoff` op — #54

- [x] 1.1 Pure `buildHandoff(flow, execution, profile?)` (`src/operations/handoff.ts`, with the
  shared `profileInputs` projection) splits `required_inputs` into `assembled_inputs` (non-secret,
  value known) vs `pending_inputs` (missing or `source: "credential"`, with a `reason` and **no
  value**), and assembles the package (action_url / method / instructions / danger / confidence /
  gaps / eligibility_notice)
- [x] 1.2 `eligibility_notice` surfaces (does not decide): for `manual_review` / danger ≥ 2 it
  states eligibility is the maker's (neither auto-asserted nor auto-denied, "you may proceed"),
  neutral for self-serve. No hard lock — the package is always returned
- [x] 1.3 `get_handoff(execution_id)` EXECUTE op (read-only, in `execute.ts`): NOT_FOUND for an
  unknown execution / missing program; builds the package from the execution + maker profile +
  program flow
- [x] 1.4 Tests (`test/handoff.test.mjs`): profile fields assemble + a credential field stays
  pending with no value + out-of-band note; per-call inputs override; gated flow surfaces
  eligibility without blocking; api flow gets a neutral notice; `get_handoff` over the curated
  manual_review flow + unknown execution → NOT_FOUND. 116 node:test + 6 vitest green
  (`transports.test` op count 21 → 22)

## 2. `submit_step` web-only integration — #55

- [x] 2.1 At submission, for `flow.automatability !== "api"`: `did` reads as a prepared web
  handoff (not a simulated submission), `simulated` is `false`, the response adds
  `handoff_available: true`, and `next_step` → `get_handoff`. `api` flows unchanged (still
  `simulated: true`)
- [x] 2.2 Tests (`test/handoff.test.mjs`): a manual_review submission flags the handoff +
  points to `get_handoff` + `simulated: false`; the api path still returns the simulated
  submission with no `handoff_available`. Updated the existing execute.test handoff-wording
  assertions. 118 node:test + 6 vitest green

## 3. Validate + archive — #56

- [ ] 3.1 `openspec validate add-web-handoff --strict`; typecheck/lint/both test layers green
- [ ] 3.2 Archive into `openspec/specs/` (`web-handoff` created; the `application-pipeline`
  delta applied)
