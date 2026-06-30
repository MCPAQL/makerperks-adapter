# flow-acceptance Specification

## Purpose
The acceptance layer over discovered Flow Documents (#47 piece C): a shared, operator-curated
review queue (CRUDE over proposals, generic over entity kind so #35 services reuse it) backed by a
`FlowRegistry` (in-memory locally; a single named registry Durable Object hosted), plus an
acceptance autonomy dial (review_each / auto_low_risk / full_auto). The server re-runs the
model-free verify gate authoritatively; eligibility is never auto-asserted; danger ≥ 3 always
waits for an explicit human accept. Accepted flows are published to a highest-precedence overlay
the server serves live, closing the cache → discover → verify → propose → accept → served loop.
(#47 piece D.)
## Requirements
### Requirement: Shared proposed-flow review queue

The adapter SHALL provide a shared, operator-curated review queue for proposed Flow Documents,
backed by a `FlowRegistry` store (in-memory locally; a single registry Durable Object hosted) and
generic over an entity `kind` (`flow` now; `service` later, #35). It SHALL expose a CRUDE surface
over proposals: `propose_flow` (CREATE) submits a candidate Flow Document and stores it `pending`;
`list_proposed_flows` (READ) returns proposals with their verdicts and the diff vs the
currently-served flow, filterable by status / provider / danger; `update_proposed_flow` (UPDATE)
revises a pending proposal; `reject_flow` (DELETE) discards a proposal with a reason. These
operations SHALL require the registry store and SHALL NOT be present on the anonymous read-only
endpoint.

#### Scenario: A proposal enters the queue pending

- **WHEN** `propose_flow` is called with a known slug and a candidate Flow Document under
  `review_each`
- **THEN** the proposal is stored with status `pending` and appears in `list_proposed_flows`

#### Scenario: Pending proposals are listable with their verdict and diff

- **WHEN** `list_proposed_flows` is called
- **THEN** each pending proposal carries its server-computed verdict and a diff against the
  currently-served flow, and the list can be filtered by status / provider / danger

#### Scenario: A proposal can be revised or rejected

- **WHEN** `update_proposed_flow` revises a pending proposal, or `reject_flow` discards it with a
  reason
- **THEN** the revised proposal is re-verified and remains pending, or the rejected proposal leaves
  the pending set with its reason recorded

#### Scenario: The queue ops require a registry

- **WHEN** no `FlowRegistry` is wired (the read-only endpoint)
- **THEN** none of the acceptance operations are registered

### Requirement: The server re-runs verification authoritatively

On `propose_flow` and `update_proposed_flow`, the adapter SHALL re-run the model-free verification
gate (piece C: schema + provenance + eligibility-surfaced) on the candidate itself and store that
verdict — it SHALL NOT trust a `ready_for_proposal` or verdict supplied by the caller. A proposal
SHALL be acceptable into the served overlay only when the server's own verdict is
`ready_for_proposal`.

#### Scenario: A caller-supplied verdict is ignored

- **WHEN** `propose_flow` is given a candidate whose caller claims it is ready but which actually
  has a schema, provenance, or eligibility finding
- **THEN** the stored verdict reflects the server's own re-run (not ready), and the proposal cannot
  be accepted until fixed

### Requirement: Acceptance autonomy dial

The adapter SHALL support three acceptance modes — **review_each** (default), **auto_low_risk**,
and **full_auto** — settable via `set_acceptance_mode` and readable via `get_acceptance_mode`,
governing whether an eligible proposal is auto-accepted at submission. In **review_each** no
proposal is auto-accepted (every one waits for an explicit `accept_flow`). In **auto_low_risk** a
proposal is auto-accepted only when it is `ready_for_proposal` **and** `danger_level ≤ 1`. In
**full_auto** a proposal is auto-accepted when it is `ready_for_proposal` **and** `danger_level ≤
2`. In **every** mode the verification gate runs, eligibility is never auto-asserted (an
eligibility finding makes a proposal not-ready, so it cannot auto-accept), and a proposal with
`danger_level ≥ 3` (payment / real identity) SHALL never be auto-accepted — it requires an explicit
human `accept_flow`. A proposal whose **effective served flow** requires a stored vault credential
SHALL **never** be auto-accepted in any mode — publishing it would put a stored secret in play for
every user — and SHALL wait for an explicit human `accept_flow`. The credential check SHALL be
evaluated on the served flow (the curated overlay merged over the derived baseline), so a
`source: "credential"` input the candidate **inherits** from the baseline (and does not itself
declare) still blocks auto-accept.

#### Scenario: Default is review_each

- **WHEN** a fresh registry reads `get_acceptance_mode`
- **THEN** the mode is `review_each`, and a new `propose_flow` stays pending

#### Scenario: auto_low_risk auto-accepts only ready low-danger proposals

- **WHEN** the mode is `auto_low_risk` and a `ready_for_proposal` candidate with `danger_level ≤ 1`
  is proposed
- **THEN** it is accepted automatically; a `danger_level ≥ 2` or not-ready candidate stays pending

#### Scenario: danger ≥ 3 is never auto-accepted

- **WHEN** the mode is `full_auto` and a `ready_for_proposal` candidate with `danger_level ≥ 3` is
  proposed
- **THEN** it stays pending for an explicit human `accept_flow` (the challenge floor), and is not
  served until then

#### Scenario: A credential-bearing flow is never auto-accepted

- **WHEN** the mode is `full_auto` and a `ready_for_proposal` candidate at `danger_level ≤ 2` whose
  `required_inputs` include a `source: "credential"` input is proposed
- **THEN** it stays pending for an explicit human `accept_flow`, and is not served until then

#### Scenario: An inherited credential input blocks auto-accept

- **WHEN** the mode is `full_auto` and a `ready_for_proposal`, danger-0 candidate omits
  `required_inputs` for a program whose derived baseline carries a `source: "credential"` input
- **THEN** the proposal stays pending (the inherited credential input is detected on the served
  flow), not auto-accepted

### Requirement: Accepted flows are published to the served overlay

Accepting a proposal (`accept_flow`, or an auto-accept per the dial) SHALL atomically mark it
accepted **and** write its candidate into the registry's accepted overlay, so the flow is served
live without redeploy. `accept_flow` SHALL re-check that the server's verdict is
`ready_for_proposal` and SHALL apply the `danger_level ≥ 3` floor (an explicit human accept is the
only path for those). A rejected proposal SHALL NOT be published.

#### Scenario: An accepted flow is served immediately

- **WHEN** a proposal for a slug is accepted
- **THEN** the registry's accepted overlay contains the slug's candidate, and a subsequent
  `get_application_flow` for that slug returns the accepted flow as `confidence: curated`

#### Scenario: Accept is atomic

- **WHEN** `accept_flow` succeeds
- **THEN** the proposal's status is `accepted` and the accepted overlay reflects the candidate in
  the same operation (no intermediate state where one is updated without the other)

#### Scenario: A not-ready proposal cannot be accepted

- **WHEN** `accept_flow` is called on a proposal whose server verdict is not `ready_for_proposal`
- **THEN** it is rejected with the findings and nothing is published

### Requirement: Proposal attribution

Each proposal SHALL record the authenticated identity that created it (`proposed_by`, the OAuth
subject), **set by the server** from the session identity — not from a caller-supplied value.
`list_proposed_flows` SHALL surface `proposed_by`. Revising a proposal (`update_proposed_flow`)
SHALL preserve the original `proposed_by`. Proposals remain shared/visible to all authenticated
users (attribution is informational and the identity handle for per-user abuse controls, #73, not
an access-control change). Where there is no authenticated identity (local single-user mode), a
constant local subject MAY be used.

#### Scenario: A proposal records its creator's identity

- **WHEN** `propose_flow` is called within an authenticated session
- **THEN** the stored proposal's `proposed_by` is that session's subject, and
  `list_proposed_flows` surfaces it

#### Scenario: Attribution is server-set, not caller-supplied

- **WHEN** a caller attempts to supply an identity for a proposal
- **THEN** it does not determine `proposed_by` — the server sets it from the session identity (the
  operation exposes no parameter for it)

#### Scenario: Revising a proposal preserves its proposer

- **WHEN** `update_proposed_flow` revises a pending proposal
- **THEN** `proposed_by` is unchanged

