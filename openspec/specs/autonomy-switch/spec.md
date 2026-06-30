# autonomy-switch Specification

## Purpose
TBD - created by archiving change add-autonomy-switch. Update Purpose after archive.
## Requirements
### Requirement: User-selectable per-session autonomy mode

The adapter SHALL support three per-session autonomy modes — **review-each**,
**auto-low-risk**, and **full-auto** — settable via `set_autonomy` and readable via
`get_autonomy`. The mode SHALL default to **review-each** (the safest) for a new session and
SHALL be changeable at any time. The mode SHALL configure the application-pipeline gate; it
SHALL NOT add a new gating mechanism. `set_autonomy` SHALL carry the **UPDATE** semantic
category (it writes session state) and `get_autonomy` SHALL carry **READ**; because
`set_autonomy` is an UPDATE, a deployment that gates only the EXECUTE endpoint SHALL also gate
`mcp_aql_update`, since `set_autonomy` controls the EXECUTE gate's own threshold.

#### Scenario: Default is review-each

- **WHEN** a new session reads `get_autonomy`
- **THEN** the mode is `review_each`

#### Scenario: Mode is changeable

- **WHEN** `set_autonomy` is called with a valid mode
- **THEN** subsequent steps gate according to that mode, and `get_autonomy` reflects it

#### Scenario: Invalid mode is rejected

- **WHEN** `set_autonomy` is called with a value that is not one of the three modes
- **THEN** it returns a validation error

### Requirement: Modes map to a danger threshold, with the riskiest always stopped

Each mode SHALL map danger levels to a `go` / `pause` / `stop` decision: **review-each** gates
every submission (danger ≥ 0 → pause), **auto-low-risk** auto-runs danger 0–1 and pauses at
≥ 2, **full-auto** auto-runs danger 0–2. In **every** mode, danger ≥ 3 (payment / real
identity) SHALL `stop` for an out-of-band challenge. `record_execution_step` SHALL return the
same decision the pipeline would apply for the session's mode.

#### Scenario: review-each pauses even a danger-0 step

- **WHEN** the mode is `review_each` and a submission step is reached
- **THEN** it halts for confirmation regardless of danger level

#### Scenario: auto-low-risk auto-runs low danger but escalates

- **WHEN** the mode is `auto_low_risk`
- **THEN** a danger 0–1 submission proceeds without halting, and a danger ≥ 2 submission halts

#### Scenario: full-auto stops only the riskiest

- **WHEN** the mode is `full_auto`
- **THEN** a danger 0–2 submission proceeds, and a danger ≥ 3 submission stops for an
  out-of-band challenge

#### Scenario: the safety loop matches the mode

- **WHEN** `record_execution_step` reports an action's danger under a given mode
- **THEN** its directive (`go`/`pause`/`stop`) matches what `submit_step` would do in that mode

