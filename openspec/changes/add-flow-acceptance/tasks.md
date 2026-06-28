# Tasks — Flow acceptance autonomy + proposed-flow review queue (#47 piece D)

> **Scope:** a shared, operator-curated proposed-flow review queue (CRUDE over proposals, generic
> over entity kind) backed by a `FlowRegistry` seam (in-memory locally; a registry Durable Object
> hosted); an acceptance autonomy dial (review_each / auto_low_risk / full_auto; `verify` always
> runs; eligibility never auto-asserted; danger ≥ 3 always human); and accepted flows served live
> via a third, highest-precedence merge layer. Publishing the accepted overlay to KV for the public
> worker, the committed-`flows.json` reconcile + the MIT `steps_to_apply` extract, the `service`
> kind (#35), maintenance (#36), and a D1 backing are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-flow-acceptance --strict` passes;
> typecheck/lint/both test layers green; a proposed → reviewed → accepted → served round trip works
> with the dial (incl. the never-auto-assert-eligibility + danger ≥ 3 floors); the read-only
> endpoint is unchanged. One commit per section, closing its issue; push on `main`.

## 1. The FlowRegistry seam + the proposal queue (CRUD over proposals)

- [x] 1.1 `session/flow-registry.ts`: the `Proposal` model (`id`, `kind: "flow"`, `slug`,
  `candidate`, `attestation?`, `verdict`, `status`, `reason?`, timestamps), the `AcceptanceMode`
  type, the `FlowRegistry` interface, and an `inMemoryFlowRegistry()` impl — runtime-free +
  unit-testable like `session/profile.ts`
- [x] 1.2 `operations/flow-acceptance.ts`: `propose_flow` (CREATE) — re-runs piece-C
  `collectProposalFindings` authoritatively (ignores any caller verdict), stores `pending`;
  `NOT_FOUND_RESOURCE` for an unknown slug
- [x] 1.3 `list_proposed_flows` (READ) — proposals + their verdict + the diff vs the served flow;
  filter by status / provider / danger. `update_proposed_flow` (UPDATE, re-verifies) +
  `reject_flow` (DELETE, with reason)
- [x] 1.4 `buildRouter` registers the queue ops only when a `FlowRegistry` is wired
- [x] 1.5 Tests: a proposal enters pending and lists with its verdict + diff; a caller-claimed
  "ready" but actually-not-ready candidate stores a not-ready server verdict; revise re-verifies;
  reject records a reason; the ops are absent without a registry

## 2. The acceptance dial + accept + live serving

- [ ] 2.1 `set_acceptance_mode` / `get_acceptance_mode` (default `review_each`); invalid mode → a
  validation error
- [ ] 2.2 `accept_flow` (+ the propose-time auto-accept per the dial): re-checks the server verdict
  is `ready_for_proposal`; applies the danger floors (auto-accept only `≤ 1` / `≤ 2` by mode;
  `≥ 3` never auto, explicit human only); atomically marks accepted + writes the accepted overlay
- [ ] 2.3 The flow-serving merge gains the accepted overlay as a third, highest-precedence layer:
  `getApplicationFlow(program, flows, accepted?)`; the serving ops (`get_application_flow`,
  `list_application_flows`, `start_flow_discovery`) pass the registry's accepted overlay when wired;
  no registry → byte-identical to today
- [ ] 2.4 Tests: review_each keeps a proposal pending; auto_low_risk auto-accepts a ready danger ≤ 1
  and escalates ≥ 2 / not-ready; full_auto auto-accepts danger ≤ 2 but never ≥ 3; a not-ready
  proposal can't be accepted in any mode; an accepted flow is served as `confidence: curated`; with
  no registry the served flow is unchanged

## 3. Hosted wiring — the registry Durable Object

- [ ] 3.1 A single named registry Durable Object backing the `FlowRegistry` on the stateful worker
  (atomic accept = move pending→accepted + publish in one DO txn); `buildRouter`/worker wiring
- [ ] 3.2 A workers/vitest test proving the shared registry's consistency (a proposal accepted via
  the DO is served on a subsequent read) using the minimal `wrangler.test.jsonc` harness
- [ ] 3.3 Confirm the read-only worker registers no acceptance ops and serves committed `flows.json`
  unchanged

## 4. Validate + archive

- [ ] 4.1 `openspec validate add-flow-acceptance --strict`; typecheck/lint/both test layers green
- [ ] 4.2 Archive into `openspec/specs/` (`flow-acceptance` created; the `application-flows` delta
  applied); note the #47 arc complete (A–D done)
