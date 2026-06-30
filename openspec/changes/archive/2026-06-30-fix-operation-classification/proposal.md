## Why

An audit of all 40 operations found 8 carrying the wrong CRUDE semantic category, plus a
missing `update_project` that forced editing a project to be expressed as `remove_project` +
`add_project` (a delete+create). The mis-classification also let read-only inspection ops sit
on the EXECUTE endpoint, which both pollutes that endpoint's surface and — once the endpoint
binding is enforced (#93) and used as the human-approval boundary (#96) — makes endpoint-level
gating imprecise. The code was corrected in #98 / PR #99; this change brings the canonical
OpenSpec specs (the source of truth) back in line, since several archived specs now contradict
the code.

## What Changes

- **Reads off EXECUTE → READ:** `get_status`, `get_handoff`, `get_autonomy`, and
  `record_execution_step` (the last is stateless — it returns an `AutonomyDirective` and
  persists nothing).
- **Session/health writes off EXECUTE → UPDATE:** `set_autonomy` (writes the session autonomy
  mode) and `report_flow_outcome` (upserts the per-slug `flowHealth` aggregate).
- **Project sub-resource lifecycle aligned with credentials and the spec verb tables:**
  `add_project` UPDATE → **CREATE**, `remove_project` UPDATE → **DELETE**, and a new
  `update_project` (**UPDATE**) that merges fields into an existing project by id (omitted
  fields kept), so projects mirror `add_credential` (CREATE) / `remove_credential` (DELETE).
- **EXECUTE now holds exactly `start_application` + `submit_step`** — the two non-idempotent
  application-driving actions.

## Capabilities

### Modified Capabilities

- `maker-profile`: project ops re-categorized (add → CREATE, remove → DELETE) and a new
  `update_project` (UPDATE).
- `application-pipeline`: `get_status` and `record_execution_step` are READ, not EXECUTE; the
  EXECUTE family is `start_application` + `submit_step`.
- `web-handoff`: `get_handoff` is a READ operation (the spec previously called it a "read-only
  … EXECUTE operation").
- `autonomy-switch`: `set_autonomy` is UPDATE, `get_autonomy` is READ (made explicit).
- `flow-health`: `report_flow_outcome` is UPDATE (made explicit).

## Impact

- **Affected specs:** `maker-profile`, `application-pipeline`, `web-handoff`, `autonomy-switch`,
  `flow-health` (all MODIFIED — semantic categories only; no behavioral requirement changes
  beyond the new `update_project`).
- **Affected code (already landed in #98 / PR #99):** `src/operations/{execute,flow-health,
  profile}.ts`; `docs/ARCHITECTURE.md` §1 updated so the EXECUTE pipeline no longer lists
  `get_status`.
- **Migration:** reclassified ops move `mcp_aql_*` tools; agents re-introspect and adapt, and
  with #93 enforcement a client hard-coding an old endpoint gets `VALIDATION_ENDPOINT_MISMATCH`.
- **Out of scope:** the application-pipeline spec's "simulated submission" wording (superseded by
  the `live-application` capability, #91) is untouched here; a possible `record_execution_step`
  rename (its name reads like a write though it is now READ) is a tracked follow-up.
