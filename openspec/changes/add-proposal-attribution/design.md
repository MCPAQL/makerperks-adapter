# Design — Proposal attribution (#47 piece D follow-up)

A one-field addition with one piece of plumbing: thread the authenticated subject into
`propose_flow` so each proposal carries `proposed_by`.

## Decisions

### 1. Server-set from the session identity, never caller-supplied

`propose_flow` has **no** `proposed_by` param — the router would reject it as unknown anyway. The
server sets `proposed_by` from the session's authenticated subject, so a caller cannot spoof
another identity. The subject is the OAuth `userId` (the stable handle #73 will ban on), threaded
from the stateful worker's `this.props.userId` → `buildRouter({ proposer })` →
`registerFlowAcceptanceOperations(..., proposer)`. Local single-user mode (no auth) stamps a
constant `"local"` subject.

### 2. Preserve the proposer across revisions

`update_proposed_flow` keeps the original `proposed_by` (it spreads the existing proposal). Tracking
a separate editor identity is out of scope — the queue is shared and the proposer is the
accountable party for #73.

### 3. Subject, not login

We store the OAuth subject (`userId`), not the human-readable login — it is the stable identity the
abuse controls key on. Surfacing a login alongside it is a later nicety, not needed for #73.

## Out of scope (tracked)

Per-user ban / write rate-limits / queue caps (#73); operator-only `accept_flow` gating; a
login/display-name alongside the subject.
