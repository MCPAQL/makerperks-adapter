# Design — Web-only provider handoff (#21)

Turn the submission-stage stub for non-`api` flows into a structured package an external
browser-automation agent can act on. The adapter prepares and hands off; it never drives a
browser. Built on what already exists: the flow dataset (#16) classifies automatability and
names `required_inputs` with a `source`; the pipeline (#17) + profile (#19) already assemble
inputs; this change projects all of that into a handoff view.

## Decisions

### 1. A dedicated `get_handoff(execution_id)` op is the primary surface (not a buried field)

Two options were considered:

- **A — fold the package into the `submit_step` submission response.** No new op, but the
  package is large, only relevant for non-`api` flows, and not re-fetchable without re-running
  the step.
- **B — a dedicated `get_handoff(execution_id)` op** (CHOSEN). Discoverable via `introspect`,
  re-fetchable, idempotent, and reads cleanly as a first-class capability ("the server prepares
  a handoff package for browser automation"). `submit_step` keeps a thin pointer to it.

`get_handoff` is an EXECUTE op (it is execution-scoped, like `get_status`) and is **read-only**
— preparing a view is not an action, so it neither gates nor mutates session state. It reads
the execution's accumulated `inputs`, the maker profile, and the program's flow.

### 2. The handoff package shape

```ts
interface HandoffPackage {
  slug: string; provider: string; title: string;
  automatability: "web_only" | "manual_review" | "unknown"; // never "api"
  action_url?: string;          // where to apply
  method: SubmissionMethod;     // web_form | oauth_signup | …
  instructions?: string;        // human-readable steps from the flow
  assembled_inputs: { key: string; value: unknown; source: InputSource }[];
  pending_inputs: {
    key: string; type: InputType; required: boolean; source: InputSource;
    note?: string; reason: "missing" | "credential" | "sensitive";
  }[];
  danger_level: DangerLevel; confidence: Confidence; gaps: string[];
  eligibility_notice: string;
}
```

- **`assembled_inputs`** = flow `required_inputs` (plus any extra supplied) whose value is known
  and **non-secret** — i.e. `source` is `profile` / `generated` and a value exists (from the
  profile or per-call inputs already accumulated on the execution).
- **`pending_inputs`** = everything not in `assembled_inputs`: a required field with no value
  (`reason: "missing"`), or a `source: "credential"` field (`reason: "credential"`, with a note
  to supply it out-of-band). The value is **never** included.

### 3. No secrets in the package, ever

A `source: "credential"` field is always `pending` with an out-of-band note — even if the maker
has a matching vault entry, the adapter does not decrypt or emit it (consistent with #19/#4:
the agent never sees plaintext). The browser agent or the maker supplies the secret directly at
the form. The package names *what* is needed, not the value.

### 4. Eligibility is surfaced, not decided — neither auto-asserted nor auto-denied, never blocked

We do not auto-assert eligibility, but we also do not auto-**deny** it or hard-lock the path.
These programs have wiggle room, and a maker (or their agent) who has read the criteria may
reasonably judge their project eligible better than our flow data does — they get to proceed
(including simulating a follow-through) on that judgement. So the handoff *surfaces* eligibility
and leaves the call to the maker: for `manual_review` or `danger_level >= 2` flows the
`eligibility_notice` states that eligibility (funding stage, prior-credit history, etc.) is the
maker's to assert — neither auto-asserted nor auto-denied — and the flow's `gaps` enumerate the
specifics so the maker can decide informed. For self-serve flows the notice is a short neutral
reminder. **Nothing here is a hard lock:** `get_handoff` and `submit_step` never refuse to
proceed on eligibility grounds. (The only hard stop in the system remains `danger >= 3` —
payment / real identity — via Challenge-Response, which is a different concern.)

### 5. `submit_step` points to the handoff for non-`api` flows

At the submission stage, when `flow.automatability !== "api"`, `submit_step` no longer frames the
step as a simulated submission. Its `did` reads as a prepared web handoff and the response adds
`handoff_available: true` with `next_step` pointing at `get_handoff`. `api` flows keep the
existing simulated-submission behaviour unchanged. (The lifecycle state machine is otherwise
untouched — keeping this change small; a dedicated terminal "handed_off" state is a possible
later refinement.)

## Out of scope (tracked)

The adapter driving a browser; a concrete browser-agent protocol/handshake; real credential
injection; broader `web_only` provider-flow coverage (#48).
