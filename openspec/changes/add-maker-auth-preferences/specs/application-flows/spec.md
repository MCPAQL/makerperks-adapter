## ADDED Requirements

### Requirement: An oauth_signup flow can advertise its OAuth providers

A flow's `submission` SHALL support an optional `oauth_providers` list naming the OAuth providers the
signup page offers (e.g. `["google", "github", "azure"]`). It SHALL be authored on a curated Flow
Document (the derived baseline does not know a provider's OAuth buttons) and SHALL carry through the
curated overlay merge unchanged. Each entry SHALL be validated against the known OAuth-provider set;
an unknown provider SHALL be rejected. The list is descriptive (which buttons exist) and grants no
new authority.

#### Scenario: A curated flow declares its OAuth providers

- **WHEN** a curated Flow Document sets `submission.oauth_providers: ["github", "google"]` on an
  `oauth_signup` flow
- **THEN** the merged flow served for that program carries those providers

#### Scenario: An unknown OAuth provider is rejected

- **WHEN** a curated overlay declares an `oauth_providers` entry that is not a known provider
- **THEN** the overlay fails validation
