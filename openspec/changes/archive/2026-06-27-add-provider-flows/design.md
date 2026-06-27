# Design — Provider application-flow dataset (#16)

The first Stage 1 *data* change: make application flow discoverable over the directory, as
the read-only substrate the #17 EXECUTE tools and any consuming agent build on.

## Decisions

### 1. Two layers: derived (all providers) + curated (a few), merged curated-over-derived

The directory has 207 perks and no flow data. Hand-encoding all of them is neither feasible
nor the point (this is a PoC, not a moat — see project intent). So:

- **Derived** is computed in code from `perks.json`. Every perk gets a baseline flow, so the
  server always answers "what does it take to apply to X?" with *something* — and marks what
  it doesn't know. This is the "as much generalized discoverable flow as the data allows."
- **Curated** is a small repo-owned JSON overlay keyed by slug. Where present, it wins.

`getFlow(slug) = mergeFlow(derive(program), curated[slug])`. The merge is shallow-by-field
with curated taking precedence; `confidence` becomes `curated` iff a curated record exists.

### 2. The schema is "pragmatic middle" — enough to drive #17/#18, honest about gaps

Fields: `automatability`, `required_inputs[]`, `submission{method, action_url?, endpoint?,
instructions?}`, `redemption{type, note?}`, `danger_level` (0–4, consumed by the autonomy
switch #18), `confidence`, `gaps[]`, plus identity (`slug`/`provider`/`title`) and provenance
(`source`, `verified?`). `gaps` is load-bearing: it is the explicit contract of what the
agent must still discover (e.g. "action_url is the provider homepage, not a verified apply
URL"; "required_inputs are generic defaults").

### 3. Derivation heuristics (honest, not clever)

From each program: `action_url ← url`; `automatability ← value_type`/`audience`
(`free_tier` → likely `api`/self-serve; high-value `credits` + `startup` → likely
`manual_review`; `discount` → often `code`/`web_only`; else `unknown`); generic
`required_inputs` (email, name; company when `audience` includes `startup`; a verification
hint when `students`); `redemption ← value_type`; conservative `danger_level` (signup-only
→ 0). Every derived field that isn't certain is named in `gaps`. The heuristics are
deliberately simple and transparent — an agent (or a reviewer) should never mistake a
*guess* for a *fact*, which is exactly why `confidence: derived` + `gaps` ride on every
derived record.

### 4. Read-only, additive ops — no change to the existing READ surface

`get_application_flow(slug)` and `list_application_flows(automatability?, limit?)` are new
operations on the same transport-agnostic Router; `introspect` surfaces them automatically.
The existing `list_programs`/`get_program`/`search_programs` are untouched, so nothing about
the live read surface changes. EXECUTE stays out of scope (#17).

### 5. Curated overlay is AGPL; only prose flows back to Nate

`provider-flows.json` is our IP. The license boundary holds: improved human-readable
`steps_to_apply` derived during research may be contributed back to `natea/makerperks` as
MIT data (the "I made your thing better" gift), but the structured flow records do not cross
back.

### 6. Spike providers (curated seeds) chosen for value × *likely* automatability

- **anthropic** — self-serve console signup; on-brand; cleanest `api` candidate.
- **deepgram** — instant API key + free credits on self-serve signup; the strongest fully
  in-pipeline story.
- **gcp** (or aws) — a gated startup-credit program, tagged `web_only`/`manual_review`, to
  exercise the handoff path (#21) and prove the schema models *both* shapes.

Each curated record is **researched against the provider's real signup/docs** before it is
trusted; until then it stays `derived`. (Research uses web tools; this is where the per-
provider issues from the generator get worked.)

## Out of scope (tracked elsewhere)

EXECUTE pipeline + opt-in Execution Safety Loop (#17), autonomy switch (#18), credential
vault (#19), `web_only` browser-automation handoff (#21), and the generalized agent-driven
flow-discovery/scaffolding tool — an **agent-layer** follow-on, spec'd once the spikes show
where the bumps are.
