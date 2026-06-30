// #103: maker auth-method preferences for `oauth_signup` flows. The single home for the canonical
// method/provider vocabulary (shared by the profile, the flow model, and the handoff builder — kept
// here to avoid a circular import between session/profile and data/flows) and the resolution that
// picks which signup button the agent should steer the maker toward. Non-secret throughout; OAuth
// still hands off to the human at the consent screen — this only changes which button, not authority.

/** OAuth providers a signup page can offer (validates a flow's `submission.oauth_providers`). */
export const OAUTH_PROVIDERS = [
  "github",
  "google",
  "gitlab",
  "microsoft",
  "azure",
] as const;

/** Methods a maker may rank in `auth_preferences` — the OAuth providers plus email/password. */
export const AUTH_METHODS = [...OAUTH_PROVIDERS, "email_password"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export type AuthMethod = (typeof AUTH_METHODS)[number];

const OAUTH_PROVIDER_SET: ReadonlySet<string> = new Set(OAUTH_PROVIDERS);
const AUTH_METHOD_SET: ReadonlySet<string> = new Set(AUTH_METHODS);

export function isOAuthProvider(v: unknown): v is OAuthProvider {
  return typeof v === "string" && OAUTH_PROVIDER_SET.has(v);
}

export function isAuthMethod(v: unknown): v is AuthMethod {
  return typeof v === "string" && AUTH_METHOD_SET.has(v);
}

/**
 * Resolve which signup method the agent should steer the maker toward: the FIRST of the maker's
 * stated `authPreferences` (preference order) that the flow supports, where "supported" = the flow's
 * advertised OAuth providers plus the universally-available `email_password` (every signup page has
 * it). Returns `undefined` when the maker stated no preference, or none of their stated methods is
 * supported — the package never invents a preference the maker didn't state.
 */
export function resolvePreferredMethod(
  authPreferences: readonly string[] | undefined,
  oauthProviders: readonly string[] | undefined,
): AuthMethod | undefined {
  if (!authPreferences || authPreferences.length === 0) return undefined;
  const supported = new Set<string>([...(oauthProviders ?? []), "email_password"]);
  const match = authPreferences.find((p) => supported.has(p));
  return isAuthMethod(match) ? match : undefined;
}
