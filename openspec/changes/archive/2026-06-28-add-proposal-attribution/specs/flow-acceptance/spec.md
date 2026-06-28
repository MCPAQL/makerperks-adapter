## ADDED Requirements

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
