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

## 1. Handoff package builder + `get_handoff` op

- [ ] 1.1 A pure `buildHandoff(flow, execution, profile?)` that splits the flow's
  `required_inputs` into `assembled_inputs` (non-secret, value known) vs `pending_inputs`
  (missing or `source: "credential"`, with a `reason` and no value), and assembles the package
  (action_url / method / instructions / danger / confidence / gaps / eligibility_notice)
- [ ] 1.2 `eligibility_notice` surfaces (does not decide) eligibility: for `manual_review` /
  danger ≥ 2 it states the maker asserts it (neither auto-asserted nor auto-denied), neutral for
  self-serve. No hard lock — the package is always returned and proceeding is never refused on
  eligibility grounds
- [ ] 1.3 `get_handoff(execution_id)` EXECUTE op (read-only): NOT_FOUND for an unknown execution;
  returns the package built from the execution + maker profile + program flow
- [ ] 1.4 Unit tests: `web_only` (gcp) package has assembled profile inputs + pending credential
  field with **no secret**; `manual_review` carries the eligibility notice; an `api` flow either
  reports nothing-to-hand-off or a trivially-empty pending set; unknown execution → NOT_FOUND

## 2. `submit_step` web-only integration

- [ ] 2.1 At submission, for `flow.automatability !== "api"`: `did` reads as a prepared web
  handoff (not a simulated submission), and the response adds `handoff_available: true` +
  `next_step` → `get_handoff`. `api` flows unchanged
- [ ] 2.2 Tests: a `web_only` execution's submission response flags the handoff and points to
  `get_handoff`; the `api` path still returns the simulated-submission result

## 3. Validate + archive

- [ ] 3.1 `openspec validate add-web-handoff --strict`; typecheck/lint/both test layers green
- [ ] 3.2 Archive into `openspec/specs/` (`web-handoff` created; the `application-pipeline`
  delta applied)
