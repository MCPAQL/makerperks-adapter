## ADDED Requirements

### Requirement: Operator-gated reconcile publishes the accepted overlay to a shared mirror

The adapter SHALL expose a `reconcile_flows` operation that flushes the registry's accepted overlay
into a shared overlay mirror, so the accepted flows become a durable artifact both the stateful and
the read-only deployments can read. It SHALL require operator authority (per the
`operator-authorization` capability): a non-operator caller SHALL receive a `FORBIDDEN` error and the
mirror SHALL be unchanged. On success it SHALL write the current `registry.accepted()` map to the
mirror and return the published `count` and `slugs`. It SHALL be registered only where both a
registry (to read) and a mirror (to write) are wired — the stateful deployment — and never on the
read-only endpoint. Reconcile SHALL be an explicit operation, not an automatic side effect of
accepting (the Durable Object remains the always-live layer; reconcile is the deliberate publish).

#### Scenario: A non-operator cannot reconcile

- **WHEN** a non-operator session calls `reconcile_flows`
- **THEN** it is refused with `FORBIDDEN` and the mirror is not written

#### Scenario: An operator reconcile publishes the accepted overlay

- **WHEN** an operator calls `reconcile_flows` and the registry has accepted flows
- **THEN** the mirror is written with the accepted overlay, and the result reports the published
  `count` and `slugs`

### Requirement: The read-only endpoint serves the published overlay

The flow-serving operations SHALL depend on an `AcceptedOverlay` (an `accepted()` provider that the
registry already satisfies), so a deployment without a registry can supply a mirror-backed overlay
and serve operator-blessed flows. The read-only endpoint SHALL read the shared mirror as its accepted
overlay and serve those flows with no redeploy, layered as the highest-precedence overlay (derived ⊕
flows.json ⊕ accepted), exactly as the stateful endpoint serves its live registry overlay. It SHALL
read the mirror at most once per isolate (TTL-refreshed), not per request.

#### Scenario: A blessed flow is served without a registry

- **WHEN** the mirror contains an accepted Flow Document for a slug and a registry-less deployment is
  given a mirror-backed accepted overlay
- **THEN** `get_application_flow` for that slug returns the accepted flow (it wins over the base
  flows.json), and `export_flows` includes it sourced `accepted`

#### Scenario: An empty mirror changes nothing

- **WHEN** the mirror is empty (nothing reconciled yet)
- **THEN** the read-only endpoint serves exactly its base flows.json overlay, unchanged

### Requirement: The upstream PR is operator-run, never server-initiated

The adapter SHALL NOT open a pull request or hold any GitHub write credential. Publishing accepted
flows upstream SHALL be performed by the operator using their own tooling: the documented workflow is
accept → `reconcile_flows` (the public endpoint serves it) → `export_flows` → an MIT-safe extract →
one `gh pr create`. The export tooling SHALL be able to emit an MIT-safe, data-only subset of the
Flow Documents (the application steps), so only MIT-licensable data crosses into the upstream MIT
directory.

#### Scenario: The server performs no upstream write

- **WHEN** an operator reconciles and later publishes upstream
- **THEN** the server's only write is the internal mirror write; the PR is created by the operator's
  own `gh`, not the server

#### Scenario: An MIT-safe extract is available for the upstream directory

- **WHEN** the operator produces the upstream artifact with the MIT extract
- **THEN** it contains only the MIT-safe application-step data, not the adapter's AGPL code
