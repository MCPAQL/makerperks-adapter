## Context

The threat is over-exposure of stored secrets / unapproved actions, not financial fraud (payment is
not storable). The two structurally-knowable levers are credential **presence** (does a flow use a
`source: "credential"` input?) and credential **kind** (`scoped_token` vs `password` vs
`identity_document`) — used instead of trying to infer risk from a flow's self-declared danger.

## Key decisions

- **scoped_token vs everything else.** Only rotatable API tokens auto-fill (the legitimate "apply
  for me" path). Passwords (reusable account access) and identity documents (irreplaceable PII) are
  never auto-exposed — and in practice are rarely needed (providers log in via OAuth; a fresh
  password is `source: "generated"`, not a vault credential).
- **Floor, don't block.** A credential-using step floors the autonomy gate to `CREDENTIAL_DANGER_FLOOR
  = 2` rather than hard-stopping, so `auto_low_risk` pauses but `full_auto` (the explicit "do
  everything" choice) still proceeds for a `scoped_token`. The host prompt remains the per-call gate.
- **Host gate primary, token fallback (Fork 2).** We do **not** remove the confirmation token —
  removing it would leave non-gating hosts with no human checkpoint. Instead the host's
  tool-permission prompt on the mutating endpoint is the real gate (broadly available, precise after
  #98), the token is a host-independent fallback, and we stop *claiming* the token is an out-of-band
  human challenge. The server-enforced credential floor (#95) is the hard backstop under both.
- **Layering.** Host-permission answers "did the human approve this action"; #95 answers "the
  irreplaceable secret never auto-flows regardless of host config." Destination control (`action_url`
  allowlist) is #97 and completes the chain.
