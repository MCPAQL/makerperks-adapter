## ADDED Requirements

### Requirement: Maker identity carries ordered auth-method preferences

The maker profile identity SHALL support an optional, ordered, non-secret `auth_preferences` list
that ranks the maker's preferred signup/auth methods (e.g. `["github", "google", "azure",
"email_password"]`, most-preferred first). `update_profile` SHALL accept and persist it and
`get_profile` SHALL return it. Each entry SHALL be validated against the known method set; an unknown
method SHALL be rejected rather than silently stored, and duplicate entries SHALL be collapsed to
their first occurrence with order otherwise preserved. The field holds no secret and SHALL live in
the profile, never the credential vault.

#### Scenario: A maker records and reads back an ordered preference

- **WHEN** `update_profile` is called with `identity.auth_preferences: ["github", "google", "email_password"]`
- **THEN** the value is persisted in order and `get_profile` returns the same ordered list

#### Scenario: An unknown method is rejected

- **WHEN** `update_profile` is called with an `auth_preferences` entry that is not a known method
- **THEN** the call fails validation and nothing is persisted
