# Tasks — feed provenance + url policy (#97)

## 1. Untrusted-text + URL policy module
- [x] 1.1 `src/data/untrusted.ts`: `normalizeUntrustedText`, `normalizeActionUrl`,
      `registrableDomain`, `sameRegistrableDomain`, `isExposureUrlAllowed`, provenance constants.
- [x] 1.2 Unit tests: control/zero-width/bidi stripping, NFC, length caps, scheme allowlist,
      registrable-domain matching (exact / subdomain / multi-part suffix / mismatch).

## 2. Handoff package
- [x] 2.1 Normalize untrusted fields (`title`, `instructions`, `gaps`, `pending.note`) and
      constrain `action_url` in `buildHandoff`; surface a dropped URL as a gap.
- [x] 2.2 Add the `provenance` envelope to `HandoffPackage`.
- [x] 2.3 Extend `buildApplicationPackage` exposure gate with `anchorUrl` / `feedTrust` / `formHosts`.
- [x] 2.4 Tests: injected redirect withholds the token (pending); same-domain apply URL still exposes
      it; untrusted feed never exposes; envelope present.

## 3. Feed provenance (data-source)
- [x] 3.1 `FeedConfig` gains `trust` / `integrity` (+ reserved `signature` / `publicKey`); `FeedStatus` gains `trust`.
- [x] 3.2 Classify trust on normalize; verify `integrity` on load (fail-soft on mismatch); signature reserved.
- [x] 3.3 Surface `trust` via `list_sources`.
- [x] 3.4 Tests: untrusted-by-default for extra feeds; integrity mismatch drops the feed fail-soft.

## 4. Discovery brief
- [x] 4.1 Normalize untrusted strings + add the provenance envelope to the brief.
- [x] 4.2 Test: envelope present; injected control chars stripped.

## 5. Wiring + docs
- [x] 5.1 Thread `program.url`, feed trust, and `ACTION_URL_FORM_HOSTS` env into the submission call
      in `execute.ts`.
- [x] 5.2 `docs/INSTALL.md`: `ACTION_URL_FORM_HOSTS` + feed-trust/integrity config notes.

## 6. Gates
- [x] 6.1 `npm run build && npm run test:unit && npm run test:workers` green.
- [x] 6.2 `npm run typecheck` + `npm run lint` clean.
- [x] 6.3 `npm run spec:validate -- add-feed-provenance-and-url-policy --strict` passes; archive on merge.
