# Tasks — Operation classification audit (#98)

> **Scope:** correct the CRUDE semantic category of 8 mis-classified operations and add
> `update_project`, in code and in the canonical OpenSpec specs. No behavioral change beyond the
> new `update_project`. The "simulated submission" wording in `application-pipeline` and a
> possible `record_execution_step` rename are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate fix-operation-classification
> --strict` passes; typecheck/lint/tests green; EXECUTE holds only `start_application` +
> `submit_step`; specs match code; `ARCHITECTURE.md` §1 updated. Implemented in #98 / PR #99.

## 1. Code reclassification

- [x] 1.1 `execute.ts`: `get_status`, `get_handoff`, `get_autonomy`, `record_execution_step`
  → READ; `set_autonomy` → UPDATE
- [x] 1.2 `flow-health.ts`: `report_flow_outcome` → UPDATE
- [x] 1.3 `profile.ts`: `add_project` → CREATE, `remove_project` → DELETE

## 2. New update_project operation

- [x] 2.1 `profile.ts`: `cleanProjectPatch` (all fields optional) + `update_project` (UPDATE) —
  merge fields into an existing project by id, omitted fields kept, NOT_FOUND on unknown id,
  audited
- [x] 2.2 Tests: merge-in-place (id stable), unknown-id NOT_FOUND

## 3. Spec + docs sync

- [x] 3.1 MODIFIED `maker-profile`, `application-pipeline`, `web-handoff`, `autonomy-switch`,
  `flow-health` deltas (categories + `update_project`)
- [x] 3.2 `docs/ARCHITECTURE.md` §1: EXECUTE pipeline no longer lists `get_status`
- [x] 3.3 Update category-map / op-count / tool-exposure test assertions for the new placement
