## Context

CRUDE semantic categories are not cosmetic: with the endpoint binding enforced (#93) and the
endpoint used as the human-approval boundary (#96), an op's category determines which
`mcp_aql_*` tool reaches it and therefore whether a host gates it. Reads must be on READ (cheap,
auto-approvable); mutations must be on the endpoint matching their effect. An audit found 8 ops
violating this and a missing `update_project`.

## Key decisions

- **Reads are READ, even when stateful subsystems own them.** `get_status` / `get_handoff` /
  `get_autonomy` inspect execution/session state without mutating it; `record_execution_step` is
  explicitly stateless (returns a directive, persists nothing). Category follows *effect*, not
  which file registers the op.
- **`set_autonomy` is UPDATE, not EXECUTE.** It writes session state. Consequence (intentional):
  a deployment wiring only the session store now also exposes `mcp_aql_update`. A host that gated
  only EXECUTE must now also gate `mcp_aql_update`, because `set_autonomy` controls the EXECUTE
  gate's own threshold — called out in the PR migration notes.
- **`report_flow_outcome` is UPDATE (upsert).** It modifies the evolving per-slug `flowHealth`
  aggregate; the default record on first touch is lazy-init, not a caller-visible "create".
- **Projects are first-class sub-resources:** add → CREATE, update → UPDATE, remove → DELETE,
  mirroring `add_credential`/`remove_credential` (the same "list of sub-records on the profile"
  shape). This is a pattern (two precedents), not over-fragmentation.
- **`update_project` replaces arrays, does not merge them.** `tags` (plain strings, no stable
  per-element identity) replace wholesale, matching `update_profile`'s `identity.links` handling.
  Additive tagging, if ever wanted, is a dedicated op — not implicit array-merge.
