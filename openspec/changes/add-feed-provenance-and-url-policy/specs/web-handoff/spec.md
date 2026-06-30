## ADDED Requirements

### Requirement: Untrusted directory text is normalized and labeled with provenance

Every feed/flow-derived free-text field that reaches the agent SHALL be normalized before it is
included in the handoff package — `title`, `instructions`, each `gaps` entry, and each pending input
`note`: Unicode NFC, removal of C0/C1 control characters (except newline and tab), removal of
zero-width and bidirectional-override characters, and a per-field length cap. The package SHALL carry
a `provenance` block that names the untrusted fields and states that they are third-party directory
data to be treated as data, never as instructions. Normalization SHALL remove only invisible or
structural content; it SHALL NOT alter the wording of legitimate text.

#### Scenario: Control and bidi characters are stripped from agent-facing text

- **WHEN** a flow's `instructions` or `gaps` contain control, zero-width, or bidirectional-override
  characters
- **THEN** those characters are removed from the handoff package while the visible wording is
  preserved

#### Scenario: The package names its untrusted fields

- **WHEN** a handoff package is built from feed/flow data
- **THEN** it includes a `provenance` block listing the untrusted fields and a notice that they are
  third-party data, not instructions

### Requirement: action_url is constrained to a safe scheme

The handoff package's `action_url` SHALL be parsed and constrained to a safe scheme (`https` or
`mailto`); a URL that is unparseable or uses any other scheme (for example `javascript:`, `data:`,
or `file:`) SHALL be dropped from the package and surfaced as a gap rather than passed to the agent.

#### Scenario: A non-https action_url is dropped and surfaced

- **WHEN** a flow's `action_url` is unparseable or uses a scheme other than `https`/`mailto`
- **THEN** the package omits `action_url` and records a gap noting the apply URL was rejected
