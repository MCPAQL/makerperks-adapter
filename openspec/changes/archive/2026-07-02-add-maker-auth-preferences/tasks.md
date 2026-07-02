# Tasks — maker auth-method preferences (#103)

## 1. Vocabulary + resolution
- [x] 1.1 `src/data/auth-methods.ts`: `OAUTH_PROVIDERS`, `AUTH_METHODS`, `resolvePreferredMethod`.
- [x] 1.2 Unit tests: order-respecting resolution, email_password fallback, no-intersection → undefined.

## 2. Profile field
- [x] 2.1 `ProfileIdentity.auth_preferences?: string[]` in `src/session/profile.ts`.
- [x] 2.2 `cleanIdentity` whitelists + validates against `AUTH_METHODS` (order kept, dupes dropped).
- [x] 2.3 Tests: `update_profile` persists it; `get_profile` returns it; an invalid method is rejected.

## 3. Flow field
- [x] 3.1 `Submission.oauth_providers?: string[]` in `src/data/flows.ts`.
- [x] 3.2 `collectCuratedFlowErrors` validates each entry against `OAUTH_PROVIDERS`; merge carries it.
- [x] 3.3 Tests: a curated flow declares `oauth_providers`; an invalid provider is rejected.

## 4. Handoff surface
- [x] 4.1 `HandoffPackage` gains `oauth_providers?` + `preferred_method?`; `buildHandoff` computes them.
- [x] 4.2 Tests: preferred provider chosen on intersection; email_password fallback; omitted for
      non-OAuth flows / no preference.

## 5. Descriptions + docs
- [x] 5.1 `update_profile` param description mentions `auth_preferences`; handoff/flow doc text updated.

## 6. Gates
- [x] 6.1 `npm run build && npm run test:unit && npm run test:workers` green.
- [x] 6.2 `typecheck` + `lint` clean.
- [x] 6.3 `spec:validate -- add-maker-auth-preferences --strict` passes; archive on merge.
