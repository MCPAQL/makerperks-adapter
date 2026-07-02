# Design — maker auth-method preferences for oauth_signup flows (#103)

## Method / provider vocabulary

A single shared module `src/data/auth-methods.ts` owns the canonical vocabulary (no circular import
between profile and flows):

- `OAUTH_PROVIDERS = ["github", "google", "gitlab", "microsoft", "azure"]` — OAuth buttons a signup
  page can offer. Validates `submission.oauth_providers`.
- `AUTH_METHODS = [...OAUTH_PROVIDERS, "email_password"]` — the full set a maker may rank in
  `auth_preferences` (email_password is a method, not an OAuth provider).

The set is intentionally a small known enum (faithful to the issue's github/google/azure plus the
other common dev-perk providers). Adding a provider is a one-line change; unknown values are rejected
rather than silently stored, so a typo doesn't masquerade as a real preference.

## Resolution

```js
resolvePreferredMethod(authPreferences, oauthProviders):
  supported = new Set([...(oauthProviders ?? []), "email_password"]) // email/pw always available on a signup
  return (authPreferences ?? []).find(p => supported.has(p))         // first stated preference that's offered
```

- Honors the maker's stated ORDER (first match wins).
- `email_password` is always in the supported set (every signup page has it), so a maker who ranks it
  gets it as their fallback when none of their OAuth choices are offered.
- Returns `undefined` when the maker stated no preference, or none of their stated methods are
  supported (they didn't list email_password and no OAuth matched) — the agent then falls back to the
  surfaced `oauth_providers` list. The package never *invents* a preference the maker didn't state.

Computed only when the flow advertises `oauth_providers` (i.e. it's a real OAuth signup) — other
flows carry no `preferred_method`. This scoping is deliberate: `email_password` is a *heuristic*
default assumed available alongside the curated OAuth buttons, so it is only applied to a page a
human has curated with `oauth_providers` (an inspected page), never to an un-curated `oauth_signup`
baseline whose actual signup methods are unknown. An un-curated `oauth_signup` flow surfaces neither
field — the agent keeps its existing default behavior.

## Profile field

`ProfileIdentity.auth_preferences?: string[]` (ordered). `cleanIdentity` whitelists it like the other
identity fields: must be a `string[]`, each entry in `AUTH_METHODS`, order preserved, duplicates
dropped (first occurrence wins). `mergeIdentity`'s `{...base, ...patch}` already replaces the list
wholesale on a partial update — correct for an ordered preference (you re-state the whole order).
Non-secret, so it lives in the profile, never the vault.

## Flow field

`Submission.oauth_providers?: string[]`. Set on a curated Flow Document (the derived baseline doesn't
know a provider's OAuth buttons). `collectCuratedFlowErrors` validates each entry against
`OAUTH_PROVIDERS`. `mergeFlow` already replaces `submission` wholesale from the overlay, so it carries
through with no change.

## Handoff surface

`HandoffPackage` gains `oauth_providers?: string[]` (echoed from the flow) and `preferred_method?:
string` (resolved). Both omitted for non-OAuth flows. This is pure projection — no secret, no new
authority; it only tells the agent which button to steer the human toward. The OAuth consent step
remains a human handoff (the project boundary is unchanged).
