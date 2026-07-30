# Handoff — MakerPerks adapter security work

Self-contained breakdown of remaining work from the 2026-06-30 security review of
`MCPAQL/makerperks-adapter`. Pick up in priority order.

## Context & conventions (read first)

- **Repo:** `MCPAQL/makerperks-adapter`, local at `/Users/mick/Developer/Organizations/MCPAQL/makerperks-adapter`.
- **PRs target `main`** (there is no `develop` branch on the remote). Branch `fix/*`.
- **OpenSpec is the source of truth.** Every non-trivial code change MUST ship a matching
  `openspec/changes/<name>/` (proposal.md + tasks.md + design.md + delta specs under
  `specs/<capability>/spec.md`), then: `npx openspec validate <name> --strict` → `npx openspec
  archive <name> -y` (applies deltas to `openspec/specs/` and moves the change to
  `openspec/changes/archive/`). Skipping this gets flagged by the reviewers — do it as part of the
  change, not after.
- **Before every push:** `npm run build && npm run test:unit` (node:test against `dist/`),
  `npm run typecheck`, `npm run lint` (eslint + prettier --check). Format new files with
  `npx prettier --write`.
- **After every push:** post a review request. Claude is the `claude-review` GitHub Action +
  an `@claude please review …` comment with specific questions. Codex (`chatgpt-codex-connector`)
  must be triggered by a **standalone** `@codex review` comment (it ignores the mention if buried
  in a larger comment). Loop: fix findings → push → re-trigger → repeat until both are clean.
- Conventional commits; end commit messages with the Co-Authored-By + Claude-Session trailers used
  on existing commits. `gh auth setup-git` is configured for pushing.
- Full review report + running notes: the assistant's memory at
  `~/.claude/projects/-Users-mick-Developer-Organizations-MCPAQL/memory/project_makerperks_security_review.md`.

## Already landed on `main`
- **#93 / PR #94** — CRUDE endpoint binding enforced (`Router.dispatchFromEndpoint`,
  `VALIDATION_ENDPOINT_MISMATCH`).
- **#98 / PR #99** — operations classification audit + `update_project` (EXECUTE now = only
  `start_application` + `submit_step`).

## 1. (IN FLIGHT) PR #102 — #95 credential floor + #96 honest approval gate
Branch `fix/credential-floor-and-approval`. Implements: scoped_token-only credential exposure
(`handoff.ts`), no auto-accept for credential-bearing flows (`flow-acceptance.ts`), autonomy floor
for credential use + honest `human_gate` messaging (`execute.ts`). Two review findings already
fixed (P1: token now bound to `credential_id`; P2: auto-accept check now on the merged served
flow). **Closes #95, #96.**

**Action:** loop until **both** Claude and Codex are clean (address any new findings the same way —
verify against the code first, fix, sync specs, re-trigger), then **merge to `main` and delete the
branch** (`gh pr merge 102 --merge --delete-branch`). Sync local `main` after.

## 2. (NEXT) #97 — V6 prompt injection + `action_url` allowlist
**Status:** filed, labeled `needs-design-review`, NOT yet designed or implemented. This is the last
link in the credential-exfil chain: #95 controls *which* secret can flow, #96 controls *whether a
human approved*, **#97 controls *where data can go***.

Two parts (from the issue):
- **`action_url` allowlist** — `submission.action_url` (and feed/flow source URLs) are never
  validated; an accepted poisoned flow can point the agent at an attacker URL. Add scheme/host
  validation so the application package only ever targets a legitimate provider destination.
- **Untrusted feed/flow text** — `title`/`instructions`/`gaps`/`action_url` from feeds + proposals
  flow verbatim into agent-facing packages (`handoff.ts`, `discovery.ts`). Wrap/label them as
  untrusted (not instructions), strip control chars, cap lengths.

**Do a design review with the human before coding** (it's `needs-design-review`): the allowlist
policy (per-provider? operator-managed? derived from the program's known `url`?) is a product
decision. Record the agreed design as an issue comment, then implement with specs + tests.

## 3. (FOLLOW-UPS, lower priority)
- **#101** — rename `record_execution_step` (it's a stateless READ but the name reads like a
  write). Client-facing; consider a transitional alias. Small, isolated.
- **V7–V15 (not filed yet)** — lower-severity items from the original report worth filing as
  issues: shared `FlowRegistryDO` is unbounded (cross-tenant DoS), OAuth `state` has no HMAC/nonce
  (CSRF — verify the `@cloudflare/workers-oauth-provider` PKCE binding first), single global
  `VAULT_KEY` (no per-user derivation/rotation), `search_programs` rebuilds the Fuse index per call
  (unauth CPU burn), no per-principal rate limiting, `introspect` exposes the full privileged op
  catalog. Triage + file; none are P1.

## 4. (SEPARATE, cross-repo) endpoint-binding prevention initiative
So other implementers don't reintroduce the #93 class of bug. Already filed, not implemented:
- `MCPAQL/spec#263` — register canonical `VALIDATION_ENDPOINT_MISMATCH` in `error-codes.md`
  (+ tighten a SHOULD→MUST). **This is the hub — do first; everything asserts the canonical code.**
- `MCPAQL/tools#28` — add an executable endpoint-binding conformance check to the existing runner
  (`tools/src/conformance.ts`; it already connects to any adapter — realize the line-69 TODO).
- `MCPAQL/adapter-generator#40` — generated adapters emit `VALIDATION_WRONG_ENDPOINT`; change to the
  canonical `VALIDATION_ENDPOINT_MISMATCH`; regenerate examples.
- `MCPAQL/spec#264` — foreground endpoint binding as a security invariant in README/overview +
  add an Endpoint Binding conformance category.

## Suggested order
1. Get **PR #102** clean + merged.
2. **#97** design review → implement (completes the security chain).
3. File **V7–V15**; do **#101** rename.
4. Cross-repo prevention initiative (#263 → #28/#40 → #264).
