## MODIFIED Requirements

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
