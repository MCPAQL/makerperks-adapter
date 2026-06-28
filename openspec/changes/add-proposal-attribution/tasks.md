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

- [ ] 1.1 `Proposal.proposed_by?: string` in `session/flow-registry.ts`
- [ ] 1.2 `propose_flow` stamps `proposed_by` from a `proposer` passed to
  `registerFlowAcceptanceOperations`; `proposalView` surfaces it; `update_proposed_flow` preserves
  it (it spreads the existing proposal)
- [ ] 1.3 Thread `proposer` through `buildRouter` (`app.ts` `AppOptions`/`RouterStores`) from the
  stateful worker's `this.props.userId` (`worker-stateful.ts`); local mode → a constant `"local"`
- [ ] 1.4 Tests: a proposal records the configured subject and lists it; a revised proposal keeps
  the original `proposed_by`; with no proposer wired, `proposed_by` is absent (or the local
  constant)

## 2. Validate + archive

- [ ] 2.1 `openspec validate add-proposal-attribution --strict`; typecheck/lint/both test layers green
- [ ] 2.2 Archive into `openspec/specs/` (the `flow-acceptance` attribution requirement applied)
