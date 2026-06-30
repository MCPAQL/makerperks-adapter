## Why

A security review (#95, #96) found that the adapter's protection of stored credentials and its
human-approval story both leaned on inputs the server doesn't control: the credential-exposure
tier keyed only on a flow's self-declared `danger_level` and ignored the credential's **kind**, so
an `identity_document` or `password` could be decrypted into the agent on any danger ≤ 2 flow; an
auto-accept dial could publish a credential-bearing flow to every user; and the only human gate was
an in-band confirmation token the agent itself replays (presented, misleadingly, as an
"out-of-band challenge"). There is no payment data at risk (payment is not storable), so the harm
is over-exposure of irreplaceable PII / reusable account access, not fraud.

## What Changes

- **Credential exposure is kind- and danger-tiered (#95).** Only a **`scoped_token`** is ever
  auto-decrypted into the application package (and only at danger ≤ 2). A `password` or
  `identity_document` is **never** auto-exposed regardless of danger — it stays pending for
  out-of-band supply. (Rotatable API tokens are the legitimate auto-fill; reusable passwords and
  irreplaceable identity documents are not.)
- **Credential-bearing flows never auto-accept (#95).** A proposed flow whose `required_inputs`
  include a `source: "credential"` input always waits for an explicit human `accept_flow`,
  regardless of acceptance mode or declared danger — publishing it would put a stored secret in
  play for every user.
- **A credential-using submission floors the autonomy gate (#95).** When a `submit_step` will
  unseal a vault credential, the gate danger is floored to ≥ 2, so a credential is never used under
  `auto_low_risk` without the human in the loop. `full_auto` still auto-proceeds (the maker's
  explicit choice), and only `scoped_token` ever auto-fills.
- **The human gate is reframed honestly (#96).** The primary human approval is the **host's
  tool-permission prompt** on the mutating endpoint (`mcp_aql_execute`) — broadly available, and
  precise now that the endpoints are correctly classified (#98). The confirmation token is kept as
  a **host-independent fallback**, but is no longer presented as a standalone out-of-band human
  challenge (it is agent-replayable). At danger ≥ 3 the credential stays sealed regardless.

## Capabilities

### Modified Capabilities

- `live-application`: credential delivery is **kind- and danger-tiered** (was danger-only).
- `flow-acceptance`: credential-bearing flows are never auto-accepted.
- `application-pipeline`: the submission gate floors danger for credential use, and the confirmation
  token is documented as a host-independent fallback to the host's tool-permission prompt — not a
  standalone human challenge.

## Impact

- **Affected specs:** `live-application`, `flow-acceptance`, `application-pipeline` (MODIFIED).
- **Affected code:** `src/operations/handoff.ts` (kind gate), `src/operations/flow-acceptance.ts`
  (`autoAccepts` + `hasCredentialInput`), `src/operations/execute.ts` (`CREDENTIAL_DANGER_FLOOR`,
  the gate floor, honest `human_gate`/`reason` messaging). Docs: `docs/INSTALL.md` + `README.md`
  gain a host-config note (gate the mutating endpoints).
- **Out of scope / tracked:** the `action_url` allowlist + untrusted-feed-text labeling (#97); a
  genuine out-of-band challenge channel (deferred — too little host support for MCP elicitation).
