## Why

The published directory carries a `status` per program (`Active` / `Discontinued` / `Beta` /
`Upcoming`), but **nothing in the adapter reads or applies it** — a discontinued/defunct perk is
served, discoverable, and proposable exactly like an active one (the gap surfaced while testing:
`propose_flow` happily queues a flow for a defunct perk). And because this server is **general
infrastructure** — anyone can publish a `perks.json`-shaped opportunity feed (grants, college
programs, camping slots, …) and point an MCP-AQL server at it — status handling can't be one
hardcoded policy. It needs **operator-configurable knobs**.

## What Changes

- **Surface status.** The program `status` (defaulting to `Active` when absent) is surfaced on the
  flow read surface — `get_application_flow`, `get_discovery_brief`, and the list summaries.
- **A configurable `StatusPolicy`.** Per status, two switches: `listing: include | exclude` and
  `proposal: allow | flag | block`. **Default = surface/flag only:** `Active {include, allow}`;
  `Discontinued` / `Beta` / `Upcoming` → `{include, flag}`. So out of the box nothing is hidden or
  blocked — a non-`Active` perk is merely surfaced + flagged, and the agent decides.
- **Knobs (per user).** The policy is a **per-user preference** — how *you* view the directory by
  status is personal, unlike the shared accepted flows. `get_status_policy` /
  `set_status_policy(status, listing?, proposal?)` read/write the user's own policy (stored with
  their profile, `UserRecord.statusPolicy`), so a user can flip, say, `Discontinued → {exclude,
  block}` for themselves — without redeploy. No user / anonymous (the read-only worker) → the
  **defaults**.
- **Listings honor `exclude`.** `list_programs` / `search_programs` / `list_application_flows` omit
  status-`exclude` programs, with an opt-in `include_inactive` param to include them. (Default
  excludes nothing, so default listing behavior is unchanged.)
- **Proposals honor the gate.** `propose_flow` / `verify_flow_proposal` apply the program's
  `proposal` setting: `flag` → a non-blocking finding (surfaced, agent decides); `block` → refuse.
  (Default flags non-`Active`, blocks nothing.)

## Capabilities

### New Capabilities

- `directory-status`: read + apply the published program `status` via an operator-configurable
  policy (per-status `listing` + `proposal` knobs; default surface/flag only), surfaced on the flow
  read surface, honored by the directory/flow listings and by proposals.

## Impact

- **Affected specs:** `directory-status` (new). The default policy changes no existing behavior, so
  `directory-query` / `application-flows` / `flow-acceptance` keep their contracts unless an
  operator opts into `exclude`/`block`.
- **Affected code:** a `StatusPolicy` model + defaults + an eval-free policy applier
  (`data/status.ts`); `status` surfaced via `getApplicationFlow` / `buildDiscoveryBrief` / the list
  summaries; the listing ops gain `include_inactive` + the exclusion filter; `propose_flow` /
  `verify_flow_proposal` apply the gate; `get_status_policy` / `set_status_policy` ops on the
  per-user `ProfileStore` (`UserRecord.statusPolicy`); the listing/proposal ops resolve the
  session's per-user policy (defaults when there is no user).
- **Non-goals / tracked follow-up:** drift detection + retire / the `service` maintenance pipeline
  (#36, of which this is a first slice); a publisher-supplied policy embedded in the feed itself;
  per-status TTLs.
