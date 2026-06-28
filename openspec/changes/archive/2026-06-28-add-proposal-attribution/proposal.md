## Why

The proposed-flow queue is shared across all authenticated users (by design — a discovered fix
bubbles out to everyone), but a proposal records **nothing about who created it**. Attribution is
the missing handle for accountability and for the per-user abuse controls in #73 (ban / per-user
write limits can only target an identity if proposals carry one). It is also just good hygiene for
an operator reviewing a shared queue.

## What Changes

- The `Proposal` model gains **`proposed_by`** — the authenticated identity (the OAuth subject)
  that created it, **set by the server** from the session identity (never a caller-supplied
  value — there is no such param, so it cannot be spoofed).
- `propose_flow` stamps `proposed_by` from the session's authenticated subject (threaded from the
  stateful worker's `this.props.userId`). Local single-user mode stamps a constant local subject.
- `list_proposed_flows` surfaces `proposed_by`. Revising a proposal (`update_proposed_flow`)
  **preserves** the original `proposed_by`.
- The proposals remain **shared/visible to all** authenticated users — attribution is
  informational + the identity handle for #73, not an access-control change.

## Impact

- **Affected specs:** `flow-acceptance` (a new requirement — proposal attribution).
- **Affected code:** `Proposal.proposed_by` in `session/flow-registry.ts`; `propose_flow` stamps it
  + `proposalView` surfaces it (`operations/flow-acceptance.ts`); a `proposer` option threaded
  through `buildRouter` (`app.ts`) from the stateful worker's authenticated `userId`
  (`worker-stateful.ts`). No change to the accepted overlay, serving, or the dial.
- **Non-goals / tracked follow-up:** per-user ban + write rate-limits + queue caps (#73, which this
  unblocks); operator-only gating of `accept_flow`; storing a human-readable login alongside the
  subject (the subject is the stable handle).
