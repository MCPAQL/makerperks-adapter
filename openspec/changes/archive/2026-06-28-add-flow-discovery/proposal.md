## Why

Piece C of the #47 arc — the funder "wow." Pieces A (`add-flow-documents`) and B
(`add-flow-health`) made flows **portable** and **self-aware about staleness/failure**; piece C
is what actually **discovers** a flow. Given any perk, an agent should be able to research the
provider's signup/docs, produce a schema-conformant Flow Document with honest provenance and
gaps, verify it, and propose it — turning a bare directory entry into an automatable (or
handoff-able) application.

The key architectural decision (steered 2026-06-28): discovery is a **model- and
provider-agnostic toolkit the MCP server gives to a connected LLM agent** — NOT a standalone
script that hard-wires a provider SDK. The server is the substrate (no web access, no `eval`,
runs on Workers); it provides the **scaffold** (a research brief), the **model-free gates**
(schema + provenance + eligibility verification), the **diff** against the current overlay, and a
single **discovery entry point**. The connected agent (any MCP-compatible client / tool-runner —
Claude Desktop, Cursor, a Dollhouse ensemble, …) brings the model + web tools and does the
research, generation, and adversarial refutation. No provider SDK is a dependency of this repo,
at runtime or in tests. This is consistent with the MCP-AQL thesis (intelligence lives in the
agents above the server) and keeps the toolkit usable by and for any MCP platform. Once a flow is
discovered-and-served, it also makes Stage-1 **execution** easier — the agent now has a defined
flow to act on.

## What Changes

- **`get_discovery_brief(slug)` (READ):** returns the research scaffold for a perk — the
  `perks.json` fields, the server's derived baseline + its explicit `gaps`, the target Flow
  Document **contract** (field names + allowed enums, from the same source as the validator), and
  the **verification contract** (provenance + eligibility-surfaced rules + an adversarial
  checklist). The agent researches against this; it is a starting point, not a blank page.
- **`verify_flow_proposal(slug, candidate)` (READ):** runs the **model-free** gates on a
  candidate Flow Document — schema (`collectCuratedFlowErrors`), **provenance** (every curated
  claim carries `sources[]`; `verified` present), and **eligibility-surfaced** (criteria belong
  in `gaps`, never asserted as satisfied, never auto-denied). Returns a structured verdict plus
  the **adversarial checklist** the agent must still execute semantically (re-fetch sources,
  confirm the real apply URL, …). The server gates; the agent refutes.
- **`diff_flow_proposal(slug, candidate)` (READ):** a field-level diff of the candidate against
  the current `flows.json` overlay entry (added / changed / removed), so a proposal's delta is
  reviewable.
- **`start_flow_discovery(slug)` (READ):** the discovery entry point / demo driver. When the
  cached flow is fresh (and, where a per-user store is wired, healthy) it returns
  `{action: "use", flow}`; when missing / stale / flagged-for-rediscovery it returns
  `{action: "discover", reason, brief}` — the cache → discover loop, in one call.
- **Fidelity oracle (dev):** a pure `scoreFidelity(candidate, knownGood)` measure, exercised by
  regenerating the 3 hand-curated spikes (`anthropic/…`, `deepgram/…`, `gcp/…`) and diffing
  against the known-good `flows.json` — the de-risking metric. The scorer + gates are unit-tested
  with the spikes as fixtures (no model call); the live regeneration is a manual demo driven by a
  connected MCP agent.

## Capabilities

### New Capabilities

- `flow-discovery`: a model-agnostic, server-side toolkit (research brief → model-free
  schema/provenance/eligibility verification → overlay diff → discovery entry point) that a
  connected LLM agent drives to investigate any perk and produce a verified, portable Flow
  Document, with a fidelity oracle over the 3 spikes.

## Impact

- **Affected specs:** `flow-discovery` (new). No existing spec is modified — discovery is a new
  read-family toolkit that *consumes* `flow-health`'s `rediscover` signal but does not change it.
- **Affected code:** a new `data/discovery.ts` (pure helpers: `buildDiscoveryBrief`,
  `collectProposalFindings`, `diffFlow`, `scoreFidelity`) reusing the existing
  `collectCuratedFlowErrors` + `CuratedFlow` contract from `data/flows.ts`; a contract descriptor
  next to the validator (single source of truth for the enums); a new
  `operations/flow-discovery.ts` registering the four READ ops on `data` + `flows` (optional
  `ProfileStore` for the health-aware entry point); `buildRouter` registration. The worker bundle,
  the pipeline, the vault, and `flows.json` are unchanged.
- **Non-goals / tracked follow-up:** the proposed-flow **review queue** + acceptance autonomy dial
  and the dynamic write store (D1 / DO) — **piece D (#64)**; auto-merging an accepted proposal
  into `flows.json` (piece D / a human PR); expanding curated coverage by hand (#48 — C automates
  it); and **any** provider-SDK dependency (the agent, not this repo, supplies the model).
