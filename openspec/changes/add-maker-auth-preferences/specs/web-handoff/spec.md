## ADDED Requirements

### Requirement: The handoff package surfaces a preferred auth method

When a flow advertises `oauth_providers`, the handoff package SHALL echo that list and SHALL surface a
resolved `preferred_method`: the first of the maker's `auth_preferences` that is supported by the
flow, where the supported set is the flow's advertised OAuth providers plus the universally-available
`email_password`. The maker's stated order SHALL be honored (first match wins). When the maker has no
stated preference, or none of their stated methods is supported, `preferred_method` SHALL be omitted
(the package never invents a preference) and the agent falls back to the surfaced `oauth_providers`.
For a flow that advertises no `oauth_providers`, neither field SHALL appear. This is a non-secret
projection only — the OAuth consent step remains a human handoff.

#### Scenario: The maker's top supported provider is chosen

- **WHEN** a flow advertises `oauth_providers: ["google", "github"]` and the maker's `auth_preferences`
  are `["github", "google", "email_password"]`
- **THEN** the package surfaces `preferred_method: "github"` and echoes the `oauth_providers`

#### Scenario: email_password is the fallback when no OAuth choice is offered

- **WHEN** a flow advertises `oauth_providers: ["azure"]` and the maker's `auth_preferences` are
  `["github", "email_password"]`
- **THEN** the package surfaces `preferred_method: "email_password"`

#### Scenario: No preference is invented

- **WHEN** a flow advertises `oauth_providers: ["azure"]` and the maker's `auth_preferences` are
  `["github"]` (no email_password, no match)
- **THEN** `preferred_method` is omitted and the `oauth_providers` list is still surfaced

#### Scenario: Non-OAuth flows carry neither field

- **WHEN** a flow advertises no `oauth_providers`
- **THEN** the package omits both `oauth_providers` and `preferred_method`
