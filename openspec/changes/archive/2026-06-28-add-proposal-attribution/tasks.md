# Tasks — Proposal attribution (#47 piece D follow-up)

> **Scope:** record the authenticated OAuth subject as `proposed_by` on every proposal (server-set,
> not caller-supplied), surface it in `list_proposed_flows`, preserve it across revisions, and
> thread the subject from the stateful worker. Per-user ban / rate-limits / queue caps (#73),
> operator-only accept gating, and a login/display-name are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-proposal-attribution --strict`
> passes; typecheck/lint/both test layers green; a proposal carries its creator's subject, surfaced
> in the list and preserved on revise. One commit per section, closing its issue; push on `main`.

## 1. Attribution end to end

- [x] 1.1 `Proposal.proposed_by?: string` in `session/flow-registry.ts`
- [x] 1.2 `propose_flow` stamps `proposed_by` from a `proposer` passed to
  `registerFlowAcceptanceOperations`; `proposalView` surfaces it; `update_proposed_flow` preserves
  it (it spreads the existing proposal)
- [x] 1.3 Thread `proposer` through `buildRouter` (`app.ts` `AppOptions`/`RouterStores`) from the
  stateful worker's `this.props.userId` (`worker-stateful.ts`); local mode → unattributed
- [x] 1.4 Tests: a proposal records the configured subject and lists it; a revised proposal keeps
  the original `proposed_by`; a `proposed_by` param is rejected (server-set); unattributed when no
  proposer is wired

## 2. Validate + archive

- [x] 2.1 `openspec validate add-proposal-attribution --strict`; typecheck/lint/both test layers green
- [x] 2.2 Archive into `openspec/specs/` (the `flow-acceptance` attribution requirement applied)
