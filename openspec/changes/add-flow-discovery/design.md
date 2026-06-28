# Design — Generalized flow-discovery toolkit (#47 piece C)

Discovery is the agent-layer research→generate→verify→propose loop. The corrected architecture
(steered 2026-06-28): the **server provides the toolkit, the connected LLM agent provides the
intelligence**. The server is the substrate — no web, no `eval`, runs on Workers — so it cannot
itself search the web or run a model. It instead exposes the **model-free** parts of the loop as
read-family operations, and hands the model-dependent parts (research, generation, adversarial
refutation) to whatever MCP client is driving. No provider SDK is a dependency of this repo.

```
        get_discovery_brief ──▶  [ AGENT: research (web) + generate ]  ──▶  candidate
                                            │
                          verify_flow_proposal  (schema + provenance + eligibility gates)
                                            │            + adversarial checklist
                          [ AGENT: execute the checklist — refute against sources ]
                                            │
                          diff_flow_proposal  ──▶  proposal + delta  ──▶  (piece D queue)
```

## Decisions

### 1. The division of labor — model-free server, model-bearing agent

| Step | Who | Why |
|---|---|---|
| Gather context (brief) | **server** `get_discovery_brief` | pure: perks.json + derived baseline + gaps + target/verification contract |
| Research the provider (web) | **agent** | the server has no web access (Workers, read-only) |
| Generate a schema-shaped draft | **agent** | needs a model |
| Schema + provenance + eligibility gates | **server** `verify_flow_proposal` | pure, deterministic — reuses `collectCuratedFlowErrors` |
| Adversarial refutation (semantic) | **agent** | needs a model; server hands it the static checklist |
| Diff vs the current overlay | **server** `diff_flow_proposal` | pure |
| Decide use-cached vs discover | **server** `start_flow_discovery` | pure (freshness) + optional per-user health |

Everything the server does is a pure function of `perks.json` + `flows.json` + the candidate —
so all four ops are **READ** (no state mutation) and run on every deployment, **including the
hardened read-only endpoint**: the public MCP server offers the discovery toolkit to any client.

### 2. `get_discovery_brief(slug)` — the scaffold

A READ op returning what the agent investigates against:

```jsonc
{
  "slug": "neon/neon-startup-program",
  "program": { /* the perks.json record: provider, url, value_type, audience, … */ },
  "baseline": { /* deriveFlow() output: heuristic automatability/inputs/redemption */ },
  "gaps": [ /* the baseline's explicit unknowns — what to confirm */ ],
  "target": { /* the CuratedFlow contract: field names + allowed enums, from data/flows.ts */ },
  "verification_contract": {
    "provenance": "every non-derived claim cites a source URL; unknowns go to gaps",
    "eligibility": "criteria are surfaced in gaps, never asserted satisfied, never auto-denied",
    "adversarial_checklist": [ /* the refutations the agent must run — see §4 */ ]
  }
}
```

The `target` contract is a machine-readable descriptor of the same enums the validator enforces,
exported from `data/flows.ts` so there is **one source of truth** (no schema drift between what
the brief promises and what `verify` accepts).

### 3. `verify_flow_proposal(slug, candidate)` — the model-free gates

Returns a structured verdict; never mutates state:

```jsonc
{
  "slug": "neon/neon-startup-program",
  "schema_valid": true,
  "schema_errors": [],                 // from collectCuratedFlowErrors (the eval-free validator)
  "provenance_findings": [ /* curated claims missing a sources[] entry; missing `verified` */ ],
  "eligibility_findings": [ /* anything that records an eligibility criterion as satisfied */ ],
  "adversarial_checklist": [ /* the refutations still owed by the agent */ ],
  "ready_for_proposal": false          // true only when schema_valid && no provenance/eligibility findings
}
```

`ready_for_proposal` is the **structural** bar (schema + provenance + eligibility-surfaced). It
is **not** an acceptance decision — acceptance (the autonomy dial + review queue) is piece D, and
even then eligibility is surfaced, never auto-asserted. The semantic adversarial pass is the
agent's; the server only certifies the gates it can check deterministically.

### 4. Eligibility is surfaced, never decided — and never mistake a guess for a fact

Two invariants, enforced structurally where possible and stated in the contract otherwise:

- **Eligibility surfaced:** the candidate MUST place eligibility criteria in `gaps`. The server
  flags any attempt to encode "the maker is eligible" as data (e.g. a satisfied-eligibility
  field). It also never *auto-denies* — a flagged criterion is a gap to verify, not a hard block
  (these programs have wiggle room; consistent with `web-handoff`).
- **No guess-as-fact:** every curated (non-derived) field must carry `sources[]`; anything the
  agent could not source belongs in `gaps`, not in the field. `verify` reports curated claims
  with no provenance.

The **adversarial checklist** the server returns is a static contract the agent executes:
re-fetch each `sources[]` URL and confirm it supports the claim; confirm `submission.action_url`
is the real apply/signup page (not the provider homepage from the baseline); confirm no
eligibility criterion is recorded as satisfied; confirm `danger_level` is justified.

### 5. `start_flow_discovery(slug)` — the entry point / demo driver

One call that drives the cache→discover loop, model-agnostically:

```jsonc
// fresh (and healthy, where a store is wired):
{ "slug": "…", "action": "use", "flow": { /* merged ApplicationFlow */ }, "freshness": { … } }
// missing / stale / flagged:
{ "slug": "…", "action": "discover", "reason": "stale" | "rediscover" | "uncurated",
  "brief": { /* get_discovery_brief output */ } }
```

It composes freshness (always available) and, when a `ProfileStore` is present, the piece-B
health/`rediscover` signal — then attaches the brief so the agent can act immediately. This is
the funder demo: *no fresh flow → here's how to discover one; fresh flow → use it.* The driver
itself calls no model.

### 6. The fidelity oracle (de-risking) — `scoreFidelity(candidate, knownGood)`

A pure measure of how close a candidate is to a known-good flow (field-level agreement over the
overlay fields, weighting the load-bearing ones: `automatability`, `submission.method/action_url`,
`required_inputs`, `redemption.type`, `danger_level`). The 3 spikes are the oracle: a regenerated
candidate is scored against its known-good `flows.json` entry. The **scorer and the gates are
unit-tested with the spikes as fixtures** — feeding the known-good entry scores ~1.0, a degraded
or fabricated candidate scores lower and trips the gates. **No model is called in tests.** The
live regeneration of the 3 spikes (a real agent driving the ops) is the manual DoD demo.

## Out of scope (tracked)

The proposed-flow **review queue** + acceptance autonomy dial + the dynamic write store (D1 /
flow-registry DO) — **piece D (#64)**; auto-merge of an accepted proposal into the served overlay
(D / a human PR + the MIT-safe `steps_to_apply` extract for Nate); hand-curated coverage
expansion (#48, which C automates); MCP **sampling** as an alternative driver (a possible later
enhancement — the agent-driven toolkit is the baseline); and any provider-SDK dependency.
