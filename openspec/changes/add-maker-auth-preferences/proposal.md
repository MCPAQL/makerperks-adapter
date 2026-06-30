## Why

When a maker applies for an `oauth_signup` perk (surfaced live during the Deepgram $200-credits
application — the signup page offered Google / GitHub / Azure OAuth **and** email+password), the
agent can only fill the email; password entry, CAPTCHA, and account creation are human-handoff by
policy. Steering the maker to a one-click OAuth provider they already use is a cleaner handoff than
inventing a throwaway password — but there is nowhere to record that the maker prefers OAuth, and
nothing in the flow consumes such a preference. (The profile schema silently strips unknown identity
keys, and the credential vault is for secrets, not a non-secret preference.)

## What Changes

- **Maker profile gains an ordered, non-secret `auth_preferences` field (`maker-profile`).** A
  first-class identity field, e.g. `["github", "google", "azure", "email_password"]`, where order is
  preference order. `update_profile` accepts and persists it; `get_profile` returns it. Validated
  against a known method set; it holds no secret.
- **An `oauth_signup` flow can advertise its OAuth providers (`application-flows`).** `submission`
  gains an optional `oauth_providers` list (e.g. `["google", "github", "azure"]`) — the OAuth buttons
  the signup page offers. Carried through the curated overlay and validated.
- **The handoff package surfaces a resolved `preferred_method` (`web-handoff`).** When a flow
  advertises `oauth_providers`, the package resolves the maker's `auth_preferences` against the
  flow's supported methods (the advertised OAuth providers plus the universally-available
  `email_password`) and surfaces the first match as `preferred_method`, alongside the flow's
  `oauth_providers`, so the agent steers the maker to their preferred button. No intersection (or no
  stated preference) → `preferred_method` is omitted and the agent falls back to the providers list.

## Capabilities

### Modified Capabilities

- `maker-profile`: identity carries an ordered, non-secret `auth_preferences` method list.
- `application-flows`: a flow's `submission` may advertise `oauth_providers`.
- `web-handoff`: the package surfaces `oauth_providers` and a resolved `preferred_method`.

## Impact

- **Affected specs:** `maker-profile`, `application-flows`, `web-handoff` (MODIFIED via ADDED reqs).
- **Affected code:** new `src/data/auth-methods.ts` (the method/provider enums + `resolvePreferredMethod`);
  `src/session/profile.ts` (`ProfileIdentity.auth_preferences`); `src/operations/profile.ts`
  (`cleanIdentity` whitelists + validates it); `src/data/flows.ts` (`Submission.oauth_providers` +
  curated validation + merge); `src/operations/handoff.ts` (surface `oauth_providers` /
  `preferred_method`). Introspection/param descriptions updated.
- **Boundary (unchanged):** OAuth still hands off to the human at the consent screen — the agent
  never authenticates or approves consent. The win is UX (preferred button, no throwaway password),
  not unattended automation.
