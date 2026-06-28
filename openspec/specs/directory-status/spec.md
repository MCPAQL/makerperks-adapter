# directory-status Specification

## Purpose
Read + apply the published program `status` (Active / Discontinued / Beta / Upcoming) through an
operator/per-user-configurable policy. Because the adapter is general infrastructure (any publisher
can point it at a `perks.json`-shaped opportunity feed), status handling is configurable knobs, not
a hardcoded policy: per status, a `listing` (include/exclude) and `proposal` (allow/flag/block)
switch, defaulting to surface/flag only. The policy is **per-user** (how you view the directory by
status is personal; the accepted flows stay shared), stored in `UserRecord.statusPolicy`; anonymous
/ read-only deployments use the default. Status is surfaced on the flow read surface; the
directory/flow listings honor `exclude` (opt-in `include_inactive`); proposals honor `flag`/`block`.
A first slice of #36 (service maintenance — drift/retire).

## Requirements
### Requirement: Published program status is surfaced

The adapter SHALL surface each program's published `status` (`Active` / `Discontinued` / `Beta` /
`Upcoming`, defaulting to `Active` when absent or unrecognized) on the flow read surface —
`get_application_flow`, `get_discovery_brief`, and the `list_application_flows` summaries — so a
consumer can see whether an opportunity is active, discontinued, in beta, or upcoming.

#### Scenario: A flow carries its program's status

- **WHEN** a client calls `get_application_flow` for a program
- **THEN** the result includes that program's `status` (or `Active` when the directory omits it)

### Requirement: Operator-configurable status policy

The adapter SHALL apply program status through a configurable `StatusPolicy` that maps each status
to a `listing` (`include` | `exclude`) and a `proposal` (`allow` | `flag` | `block`) setting. The
**default** policy SHALL be surface/flag only — `Active` is `{include, allow}` and `Discontinued`,
`Beta`, and `Upcoming` are each `{include, flag}` — so out of the box no program is hidden or
blocked. The policy is **per user** (a personal view/preference, unlike the shared accepted flows):
it SHALL be readable via `get_status_policy` and changeable via `set_status_policy` against the
per-user store (`UserRecord.statusPolicy`), registered where a per-user store is wired. Where there
is no authenticated user (the anonymous read-only endpoint), the default policy SHALL apply.

#### Scenario: The default policy hides and blocks nothing

- **WHEN** the policy has not been changed
- **THEN** every status is `listing: include`, `Active` is `proposal: allow`, and the others are
  `proposal: flag`

#### Scenario: A user can tighten a status for themselves

- **WHEN** a user calls `set_status_policy` setting `Discontinued` to `{listing: exclude, proposal:
  block}`
- **THEN** their `get_status_policy` reflects it, and that user's subsequent listings + proposals
  honor it

#### Scenario: An invalid policy value is rejected

- **WHEN** `set_status_policy` is given a value outside the allowed `listing` / `proposal` sets
- **THEN** it returns a validation error

### Requirement: Listings honor the status policy

`list_programs`, `search_programs`, and `list_application_flows` SHALL omit programs whose status is
configured `listing: exclude`, unless the caller passes `include_inactive: true`. Under the default
policy (nothing excluded), these listings SHALL behave exactly as before.

#### Scenario: An excluded status is omitted from listings by default

- **WHEN** `Discontinued` is configured `listing: exclude` and a client lists programs/flows
- **THEN** discontinued programs are omitted

#### Scenario: include_inactive surfaces them on request

- **WHEN** the same client passes `include_inactive: true`
- **THEN** the discontinued programs are included

#### Scenario: Default listing behavior is unchanged

- **WHEN** the policy is the default (nothing excluded)
- **THEN** the listings return the same set as before this capability

### Requirement: Proposals honor the status policy

`propose_flow` and `verify_flow_proposal` SHALL apply the program status's `proposal` setting:
`flag` SHALL add a non-blocking status finding (surfaced, the agent decides — consistent with the
eligibility-surfaced rule); `block` SHALL refuse the proposal with a clear error; `allow` SHALL do
neither. A `flag` SHALL NOT prevent proposing or accepting — it is a surfaced caveat, not a gate.

#### Scenario: A flagged status surfaces a finding but does not block

- **WHEN** a program's status is `proposal: flag` (e.g. default `Discontinued`) and a flow is
  proposed/verified for it
- **THEN** the verdict carries a status finding, and the proposal still enters the queue

#### Scenario: A blocked status refuses the proposal

- **WHEN** a program's status is configured `proposal: block` and a flow is proposed for it
- **THEN** the proposal is refused with a clear error and nothing is queued

#### Scenario: An active program is unaffected

- **WHEN** a program's status is `Active` (`proposal: allow`)
- **THEN** proposing/verifying carries no status finding and is not blocked

