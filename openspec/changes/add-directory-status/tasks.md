# Tasks — Directory status knobs (#36 first slice)

> **Scope:** read + apply the published program `status` via an operator-configurable `StatusPolicy`
> (per-status `listing` + `proposal` knobs; default surface/flag only), surface `status` on the
> flow read surface, honor `exclude` in the directory/flow listings (opt-in `include_inactive`), and
> honor `flag`/`block` on proposals. Drift detection + retire (#36 proper), a feed-embedded policy,
> and per-status TTLs are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-directory-status --strict` passes;
> typecheck/lint/both test layers green; default policy changes no existing behavior; an operator
> can flip a status to exclude/block and listings + proposals honor it. One commit per section,
> closing its issue; push on `main`.
>
> **Storage (decided 2026-06-28):** the policy is **per-user** — stored in the existing
> `ProfileStore` (`UserRecord.statusPolicy`); anonymous / read-only → `DEFAULT`. See design.md §3.

## 1. Status model + surfacing + the policy knobs

- [ ] 1.1 `data/status.ts`: `ProgramStatus`, `StatusPolicy`, the `DEFAULT` policy (surface/flag
  only), and a pure helper to resolve a program's status (default `Active`) + its policy entry
- [ ] 1.2 Surface `status` on `get_application_flow`, `get_discovery_brief`, and the
  `list_application_flows` summaries
- [ ] 1.3 `UserRecord.statusPolicy` + `get_status_policy` / `set_status_policy(status, listing?,
  proposal?)` ops on the per-user `ProfileStore` (registered with the profile surface); invalid
  `listing`/`proposal` → a validation error
- [ ] 1.4 Tests: status is surfaced (default `Active`); the default policy excludes/blocks nothing;
  set/get round-trips per-user; an invalid value is rejected

## 2. Listings honor `exclude`

- [ ] 2.1 `list_programs` / `search_programs` / `list_application_flows` omit `listing: exclude`
  programs unless `include_inactive: true`
- [ ] 2.2 Tests: with `Discontinued → exclude`, the listings omit them; `include_inactive` includes
  them; the default policy returns the prior set unchanged

## 3. Proposals honor `flag` / `block`

- [ ] 3.1 `propose_flow` / `verify_flow_proposal` apply the program's `proposal` gate: `flag` → a
  non-blocking status finding; `block` → refuse with a clear error; `allow` → neither
- [ ] 3.2 Tests: default `Discontinued` (`flag`) surfaces a finding but still queues; a configured
  `block` refuses; an `Active` program is unaffected

## 4. Validate + archive

- [ ] 4.1 `openspec validate add-directory-status --strict`; typecheck/lint/both test layers green
- [ ] 4.2 Archive into `openspec/specs/` (`directory-status` created)
