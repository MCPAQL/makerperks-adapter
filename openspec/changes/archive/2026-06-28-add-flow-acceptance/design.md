# Design — Flow acceptance autonomy + proposed-flow review queue (#47 piece D)

D is the acceptance layer over piece-C proposals: a **shared, operator-curated** review queue + an
**acceptance autonomy dial**, with accepted flows **served live**. The server stays the substrate —
it re-runs the model-free `verify` gate authoritatively and publishes accepted flows; the *semantic*
adversarial refutation remains the agent's (an attestation a human reviews). No provider SDK.

```
  propose_flow ──▶ [server re-runs verify] ──▶ Proposal{pending, verdict}
                                                    │
              dial: review_each → wait for human ───┤
                    auto_low_risk → auto if ready && danger≤1
                    full_auto     → auto if ready (danger≥3 never auto)
                                                    │
                    accept_flow ──▶ publish to accepted overlay ──▶ served live
                    reject_flow ──▶ discard(reason)
```

## Decisions

### 1. Storage — a registry DO for the queue, KV later for the public overlay

The two access patterns differ and were evaluated on their merits (per the `add-flow-documents`
note, which deferred the write-store choice to here):

- **Queue** (write a proposal; list *pending by status/provider/danger*; **accept atomically**):
  query- and transaction-heavy, operator-paced, low volume. → a **single named registry Durable
  Object**: strongly consistent, transactional (atomic move pending→accepted + publish in one DO
  txn), trivial in-DO filtering at this volume, and it **reuses the `MakerProfileDO` pattern** — no
  new infra/migrations. (D1 is the equal-merit alternative — real SQL — but adds a primitive +
  migrations; the seam keeps it swappable if the queue ever needs scale.)
- **Accepted overlay** (read-mostly `slug→CuratedFlow`, served per request): the registry DO *is*
  the cache (serves from its own memory), and only the **stateful** worker consults it, so it is
  never on the public firehose. To reach the **public read-only worker** without redeploy, a
  follow-up publishes the accepted overlay to **KV** (read-mostly is KV's sweet spot; load-once +
  TTL, the `DataSource`/`FlowSource` pattern — the incident's lesson, not its veto).

**KV is not excluded** — it is the right tool for the read-mostly *published overlay*; it is the
wrong tool for the *queue* (no server-side query; eventual consistency breaks atomic accept).

### 2. The `FlowRegistry` seam + the `Proposal` model

A runtime-free store (in-memory shared impl for local + tests; a registry DO hosted), mirroring
`ProfileStore`. Generic over `kind` so #35 services reuse it:

```ts
type ProposalStatus = "pending" | "accepted" | "rejected";
interface Proposal {
  id: string;
  kind: "flow";                 // "service" later (#35) — the queue is generic
  slug: string;
  candidate: CuratedFlow;       // the proposed Flow Document
  attestation?: string;         // the agent's semantic adversarial result — metadata a human reviews
  verdict: ProposalVerdict;     // RE-RUN by the server (piece C), not trusted from the caller
  status: ProposalStatus;
  reason?: string;              // rejection reason
  proposedAt: number;
  decidedAt?: number;
}
interface FlowRegistry {
  mode(): Promise<AcceptanceMode>;          // the dial
  setMode(m: AcceptanceMode): Promise<void>;
  put(p: Proposal): Promise<void>;          // CREATE / UPDATE a pending proposal
  get(id: string): Promise<Proposal | undefined>;
  list(filter?: ProposalFilter): Promise<Proposal[]>;
  decide(id: string, status, reason?): Promise<Proposal>;  // accept/reject; on accept, publish
  accepted(): Promise<CuratedFlows>;        // the accepted overlay (slug → CuratedFlow)
}
```

`accept` (`decide(id, "accepted")`) atomically marks the proposal accepted **and** writes its
`candidate` into the accepted overlay (highest precedence) — one transaction, no cross-store race.

### 3. The acceptance dial acts at propose-time; `accept_flow` is the explicit human path

The dial mirrors #18 but governs **auto-acceptance on submission**, not execution steps:

| Mode | On `propose_flow`, auto-accept when… | Else |
|---|---|---|
| `review_each` (default) | never | stays `pending` for a human |
| `auto_low_risk` | `ready_for_proposal` **and** `danger_level ≤ 1` | `pending` (danger ≥ 2 or not-ready) |
| `full_auto` | `ready_for_proposal` **and** `danger_level ≤ 2` | `pending` (danger ≥ 3 → always human) |

In **every** mode: the server-recomputed `verify` runs (a not-ready proposal **cannot** be
accepted in any path — fix it via `update_proposed_flow`); **eligibility is never auto-asserted**
(eligibility findings ⇒ not ready ⇒ no auto-accept); and **`danger_level ≥ 3` is never
auto-accepted** — it requires an explicit `accept_flow` (the human). `accept_flow(id)` is the
explicit accept for everything the dial left `pending` (and the only path for danger ≥ 3); it
re-checks `ready_for_proposal` + the danger floor before publishing. This keeps the
"surfaced-never-decided" eligibility rule and the #18 challenge floor intact across the whole dial.

### 4. Serving accepted flows — a third merge layer, additive

Precedence becomes **derived baseline ⊕ `flows.json` overlay ⊕ accepted overlay**, the accepted
layer winning. `getApplicationFlow(program, flows, accepted?)` gains an optional accepted-overlay
argument; when a registry is wired, the flow-serving ops (`get_application_flow`,
`list_application_flows`, and `start_flow_discovery`, which calls it) pass the registry's accepted
overlay. When no registry is wired (the read-only worker), behavior is byte-identical to today.
`mergeFlow` already flips `confidence` to `curated` for any overlay record, so an accepted flow
reports `confidence: curated` like any curated one.

### 5. Where the ops register

The acceptance ops (`propose_flow` / `list_proposed_flows` / `accept_flow` /
`update_proposed_flow` / `reject_flow` / `set_acceptance_mode` / `get_acceptance_mode`) need the
`FlowRegistry`, so they register only when one is wired — local mode (in-memory shared) and the
authed stateful dev endpoint (the registry DO). The read-only public worker gets none of them and
serves committed `flows.json` unchanged. `propose_flow` / `accept_flow` are **EXECUTE** (they
record shared state, like `report_flow_outcome`); the rest are READ/CREATE/UPDATE/DELETE per CRUDE.

## Out of scope (tracked)

Publishing the accepted overlay to KV for the public worker; the committed-`flows.json` reconcile +
the MIT-safe `steps_to_apply` extract for Nate (a dev script); the **service** entity kind (#35) +
maintenance (#36) over the same queue; a D1 backing if the queue needs SQL at scale; per-user
(vs operator-shared) queues.
