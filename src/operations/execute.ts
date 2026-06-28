// CRUDE EXECUTE family — the (simulated) application pipeline. Registered ONLY when a
// SessionStore is wired (stateful endpoint = Durable Object; stdio = in-memory; live
// READ-only worker = not registered). Reachable via the `mcp_aql_execute` tool.
//
// §1 (this commit): start_application + get_status over the per-session store. submit_step
// (the stage machine), confirmation tokens/halting, and the safety loop come in §2–§4.
// See openspec/changes/add-application-pipeline (capability `application-pipeline`, #17).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource } from "../data/source.js";
import type { FlowSource } from "../data/flow-source.js";
import { getApplicationFlow } from "../data/flows.js";
import { AUTONOMY_MODES, autonomyDecision } from "../session/state.js";
import type {
  AutonomyMode,
  ConfirmationToken,
  Execution,
  ExecutionStage,
  SessionStore,
} from "../session/state.js";
import { appendAudit } from "../session/profile.js";
import type { ProfileStore, UserRecord } from "../session/profile.js";
import { buildHandoff, profileInputs } from "./handoff.js";

// The simulated lifecycle: each submit_step processes the current stage and advances one.
const NEXT_STAGE: Record<Exclude<ExecutionStage, "done">, ExecutionStage> = {
  eligibility: "assemble",
  assemble: "submission",
  submission: "verification",
  verification: "redeem",
  redeem: "done",
};

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/** A stable, key-sorted serialization used to bind a confirmation token to its inputs. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function registerExecuteOperations(
  router: Router,
  data: DataSource,
  flows: FlowSource,
  store: SessionStore,
  profileStore?: ProfileStore,
): void {
  router.register({
    name: "start_application",
    semanticCategory: "EXECUTE",
    description:
      "Begin a (simulated) application for a perk. Creates a session-scoped execution at " +
      "the eligibility stage; advance it with submit_step and watch it with get_status.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug to apply for.",
      },
    },
    returns:
      "An object with `execution_id`, `slug`, `stage`, `status`, and the `next_step`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const slug = params.slug as string;
      const program = data.programs().find((p) => p.slug === slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }

      const execution: Execution = {
        id: crypto.randomUUID(),
        slug,
        stage: "eligibility",
        status: "pending",
        inputs: {},
        log: [`started application for ${slug}`],
        createdAt: Date.now(),
      };

      const state = store.get();
      await store.set({
        ...state,
        executions: { ...state.executions, [execution.id]: execution },
      });

      return ok({
        execution_id: execution.id,
        slug,
        stage: execution.stage,
        status: execution.status,
        next_step:
          "call submit_step to advance: eligibility → assemble → submission → verification → redeem",
      });
    },
  });

  router.register({
    name: "submit_step",
    semanticCategory: "EXECUTE",
    description:
      "Advance an application by one stage (eligibility → assemble → submission → " +
      "verification → redeem). Submission is SIMULATED (no external calls); web-only/manual " +
      "providers produce a prepared handoff instead. Optionally pass `inputs` to assemble.",
    params: {
      execution_id: {
        type: "string",
        required: true,
        description: "The id returned by start_application.",
      },
      inputs: {
        type: "object",
        required: false,
        description:
          "Key/value inputs to assemble into the application (merged per call).",
      },
      confirmation_token: {
        type: "string",
        required: false,
        description:
          "The token returned by a CONFIRMATION_REQUIRED halt, to proceed past a gated step.",
      },
      credential_id: {
        type: "string",
        required: false,
        description:
          "At submission, a vault credential id to use. SIMULATED — the plaintext is never " +
          "decrypted or returned; the use is recorded by label and audited (#19).",
      },
    },
    returns:
      "An object with the new `stage`, `status`, what this step `did` (`simulated: true`), " +
      "any `missing_inputs`, and the `next_step`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const executionId = params.execution_id as string;
      const inputs = (params.inputs as Record<string, unknown> | undefined) ?? {};

      const state = store.get();
      const execution = state.executions[executionId];
      if (!execution) {
        return err("NOT_FOUND_RESOURCE", `no execution: ${executionId}`, {
          execution_id: executionId,
        });
      }
      if (execution.stage === "done" || execution.status === "completed") {
        return ok({
          execution_id: executionId,
          stage: execution.stage,
          status: execution.status,
          note: "already completed",
        });
      }
      const program = data.programs().find((p) => p.slug === execution.slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `program gone: ${execution.slug}`, {
          slug: execution.slug,
        });
      }
      await flows.ensureLoaded();
      const flow = getApplicationFlow(program, flows);
      // §4: assemble from the maker profile — profile-derived values sit UNDER the per-call
      // and accumulated inputs, so explicit inputs always win and `missing_inputs` reflects
      // only what the profile genuinely lacks.
      const userRecord = profileStore ? await profileStore.get() : undefined;
      const fromProfile = profileInputs(userRecord?.profile);
      const mergedInputs = { ...fromProfile, ...execution.inputs, ...inputs };

      // Batch-with-halting: a gated step pauses for a single-use, param-bound confirmation
      // token. `consumed` carries the token to mark used in the same write that advances.
      let consumed: ConfirmationToken | undefined;
      const mode = state.autonomy ?? "review_each";
      const decision = autonomyDecision(mode, flow.danger_level);
      if (execution.stage === "submission" && decision !== "go") {
        const now = Date.now();
        const paramsHash = stableStringify(mergedInputs);
        const provided = params.confirmation_token as string | undefined;

        if (!provided) {
          const ct: ConfirmationToken = {
            token: crypto.randomUUID(),
            executionId,
            stage: "submission",
            paramsHash,
            issuedAt: now,
            expiresAt: now + CONFIRMATION_TTL_MS,
            used: false,
          };
          await store.set({
            ...state,
            executions: {
              ...state.executions,
              [executionId]: { ...execution, inputs: mergedInputs, status: "halted" },
            },
            confirmationTokens: { ...state.confirmationTokens, [ct.token]: ct },
          });
          return ok({
            execution_id: executionId,
            stage: "submission",
            status: "halted",
            confirmation_required: true,
            challenge_required: decision === "stop",
            decision,
            mode,
            confirmation_token: ct.token,
            danger_level: flow.danger_level,
            reason:
              decision === "stop"
                ? `submission for ${execution.slug} is danger ${flow.danger_level} — out-of-band challenge required`
                : `submission for ${execution.slug} is danger ${flow.danger_level} (mode ${mode}) — confirm to proceed`,
            expires_at: ct.expiresAt,
            next_step: "resume submit_step with the confirmation_token to proceed",
          });
        }

        const ct = state.confirmationTokens[provided];
        const reject = (message: string) =>
          err("CONFIRMATION_REJECTED", message, {
            execution_id: executionId,
            stage: "submission",
          });
        if (!ct) return reject("unknown confirmation token");
        if (ct.used) return reject("confirmation token already used");
        if (ct.expiresAt < now) return reject("confirmation token expired");
        if (ct.executionId !== executionId || ct.stage !== "submission") {
          return reject("confirmation token does not match this step");
        }
        if (ct.paramsHash !== paramsHash) {
          return reject("inputs changed since the token was issued");
        }
        consumed = ct;
      }

      // §4: at submission, an optional vault credential may be referenced by id. The use is
      // SIMULATED — the plaintext is never decrypted or returned; we record it by label and
      // append a per-user audit entry. Resolved here (after the gate) so it only happens on a
      // real advance.
      let credentialLabel: string | undefined;
      let auditRecord: UserRecord | undefined;
      const credentialId = params.credential_id as string | undefined;
      if (execution.stage === "submission" && credentialId) {
        if (!profileStore) {
          return err("NOT_FOUND_RESOURCE", "no credential vault in this deployment", {
            credential_id: credentialId,
          });
        }
        const rec: UserRecord = userRecord ?? {};
        const entry = (rec.vault ?? []).find((c) => c.id === credentialId);
        if (!entry) {
          return err("NOT_FOUND_RESOURCE", `no credential with id: ${credentialId}`, {
            credential_id: credentialId,
          });
        }
        credentialLabel = `${entry.kind}:${entry.label}`;
        auditRecord = appendAudit(
          rec,
          "use_credential",
          `${credentialLabel} (simulated, not decrypted)`,
        );
      }

      let missing: string[] = [];
      let filledFromProfile: string[] = [];
      let handoffAvailable = false;
      let did: string;
      switch (execution.stage) {
        case "eligibility":
          did =
            "eligibility is the maker's to assert and is NOT auto-asserted (see flow.gaps)";
          break;
        case "assemble": {
          missing = flow.required_inputs
            .filter((ri) => ri.required && !(ri.key in mergedInputs))
            .map((ri) => ri.key);
          filledFromProfile = flow.required_inputs
            .filter((ri) => ri.key in fromProfile)
            .map((ri) => ri.key);
          did =
            `assembled ${Object.keys(mergedInputs).length} input(s)` +
            (filledFromProfile.length
              ? ` (${filledFromProfile.length} from profile)`
              : "") +
            (missing.length ? `; still missing: ${missing.join(", ")}` : "");
          break;
        }
        case "submission": {
          let base;
          if (flow.automatability === "api") {
            base =
              `SIMULATED submission to ${flow.submission.action_url ?? "?"} ` +
              `(method ${flow.submission.method}) with [${Object.keys(mergedInputs).join(", ")}]`;
          } else {
            // web_only / manual_review: not submitted in-pipeline — prepare a web handoff.
            handoffAvailable = true;
            base =
              `prepared web handoff for ${flow.automatability} provider ` +
              `${flow.submission.action_url ?? "?"} — call get_handoff for the package ` +
              `(no in-pipeline submit; hand off to a browser-automation agent)`;
          }
          did = credentialLabel
            ? `${base}; would inject credential ${credentialLabel} (simulated, not decrypted)`
            : base;
          break;
        }
        case "verification":
          did = "SIMULATED verification (the provider would confirm)";
          break;
        default: // redeem
          did = "SIMULATED redeem + track";
      }

      const nextStage = NEXT_STAGE[execution.stage];
      const status = nextStage === "done" ? "completed" : "running";
      const updated: Execution = {
        ...execution,
        inputs: mergedInputs,
        stage: nextStage,
        status,
        log: [...execution.log, did],
      };
      await store.set({
        ...state,
        executions: { ...state.executions, [executionId]: updated },
        confirmationTokens: consumed
          ? {
              ...state.confirmationTokens,
              [consumed.token]: { ...consumed, used: true },
            }
          : state.confirmationTokens,
      });
      // Persist the per-user audit of the simulated credential use (separate from session state).
      if (auditRecord && profileStore) await profileStore.set(auditRecord);

      return ok({
        execution_id: executionId,
        stage: nextStage,
        status,
        did,
        // A non-API submission is a prepared handoff, not a simulated in-pipeline submission.
        simulated: !handoffAvailable,
        ...(handoffAvailable ? { handoff_available: true } : {}),
        missing_inputs: missing,
        filled_from_profile: filledFromProfile,
        next_step: handoffAvailable
          ? "call get_handoff for the prepared package, then hand off to a browser-automation agent"
          : nextStage === "done"
            ? "completed"
            : `call submit_step again to process ${nextStage}`,
      });
    },
  });

  router.register({
    name: "get_status",
    semanticCategory: "EXECUTE",
    description:
      "Get the current state of an application execution in this session, plus its flow " +
      "context (automatability, confidence, danger level, and the gaps an agent must resolve).",
    params: {
      execution_id: {
        type: "string",
        required: true,
        description: "The id returned by start_application.",
      },
    },
    returns:
      "An object with the `execution` record, a `flow` summary, and the `next_step`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const executionId = params.execution_id as string;
      const execution = store.get().executions[executionId];
      if (!execution) {
        return err("NOT_FOUND_RESOURCE", `no execution: ${executionId}`, {
          execution_id: executionId,
        });
      }
      await flows.ensureLoaded();
      const program = data.programs().find((p) => p.slug === execution.slug);
      const flow = program ? getApplicationFlow(program, flows) : undefined;
      return ok({
        execution,
        flow: flow
          ? {
              automatability: flow.automatability,
              confidence: flow.confidence,
              danger_level: flow.danger_level,
              gaps: flow.gaps,
            }
          : undefined,
        next_step:
          execution.stage === "done"
            ? "completed"
            : `call submit_step to process ${execution.stage}`,
      });
    },
  });

  // Web-only / manual-review handoff (#21): prepare a structured package an EXTERNAL
  // browser-automation agent can act on. Read-only — the adapter never drives a browser; it
  // assembles from the profile, marks credential fields pending (no secret), and surfaces
  // eligibility without deciding it.
  router.register({
    name: "get_handoff",
    semanticCategory: "EXECUTE",
    description:
      "Prepare a structured web handoff package for an execution (especially web_only / " +
      "manual_review perks): the apply URL, instructions, assembled vs pending inputs (no " +
      "secrets — credential fields stay pending for out-of-band supply), danger level, gaps, " +
      "and an eligibility notice. For an external browser-automation agent; the adapter never " +
      "drives a browser. Read-only.",
    params: {
      execution_id: {
        type: "string",
        required: true,
        description: "The id returned by start_application.",
      },
    },
    returns: "An object with the `handoff` package.",
    handler: async (params) => {
      await data.ensureLoaded();
      const executionId = params.execution_id as string;
      const execution = store.get().executions[executionId];
      if (!execution) {
        return err("NOT_FOUND_RESOURCE", `no execution: ${executionId}`, {
          execution_id: executionId,
        });
      }
      const program = data.programs().find((p) => p.slug === execution.slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `program gone: ${execution.slug}`, {
          slug: execution.slug,
        });
      }
      await flows.ensureLoaded();
      const flow = getApplicationFlow(program, flows);
      const userRecord = profileStore ? await profileStore.get() : undefined;
      return ok({ handoff: buildHandoff(flow, execution, userRecord?.profile) });
    },
  });

  // Opt-in Execution Safety Loop (MCP-AQL spec §8.6): the agent reports an intended next
  // action and gets a go/pause/stop directive. Evaluate-only — it manages NO state, so any
  // agent (Dollhouse's bimodal pipeline or anyone's) can drive it. The thresholds here are
  // fixed; the configurable autonomy switch is #18.
  router.register({
    name: "record_execution_step",
    semanticCategory: "EXECUTE",
    description:
      "Report an intended next action and receive an AutonomyDirective (go / pause / stop) " +
      "by danger level. Opt-in and stateless — the agent-agnostic safety substrate.",
    params: {
      hint: {
        type: "string",
        required: false,
        description: "A short description of the intended next action.",
      },
      danger_level: {
        type: "number",
        required: false,
        description: "The action's assessed danger (0–4).",
      },
      slug: {
        type: "string",
        required: false,
        description: "Optionally derive danger from a perk's application flow.",
      },
    },
    returns:
      "An object with a `directive` { decision: go|pause|stop, danger_level, reason }.",
    handler: async (params) => {
      const hint = (params.hint as string | undefined) ?? null;
      let danger = Math.max(
        0,
        Math.min(4, Math.floor((params.danger_level as number | undefined) ?? 0)),
      );
      const slug = params.slug as string | undefined;
      if (slug) {
        await data.ensureLoaded();
        await flows.ensureLoaded();
        const program = data.programs().find((p) => p.slug === slug);
        if (program) {
          danger = Math.max(danger, getApplicationFlow(program, flows).danger_level);
        }
      }

      const mode = store.get().autonomy ?? "review_each";
      const decision = autonomyDecision(mode, danger);
      const reason =
        decision === "go"
          ? `below the gate for ${mode}`
          : decision === "stop"
            ? "highest-risk action (payment / real identity) — requires an out-of-band challenge-response"
            : `at or above the gate for ${mode} — confirm before proceeding`;
      return ok({ directive: { decision, danger_level: danger, mode, reason, hint } });
    },
  });

  // The autonomy switch (#18): the maker's dial over the gate. Ask up front, report intent.
  router.register({
    name: "set_autonomy",
    semanticCategory: "EXECUTE",
    description:
      "Set this session's autonomy mode — ASK the maker up front and report intent. " +
      "review_each = pause every submission; auto_low_risk = auto danger 0–1, pause ≥ 2; " +
      "full_auto = auto danger 0–2, stop ≥ 3 (payment / real identity).",
    params: {
      mode: {
        type: "string",
        required: true,
        enum: AUTONOMY_MODES,
        description: "review_each | auto_low_risk | full_auto.",
      },
    },
    returns: "An object with the set `autonomy` mode.",
    handler: async (params) => {
      const mode = params.mode as AutonomyMode;
      const state = store.get();
      await store.set({ ...state, autonomy: mode });
      return ok({ autonomy: mode });
    },
  });

  router.register({
    name: "get_autonomy",
    semanticCategory: "EXECUTE",
    description: "Get this session's current autonomy mode.",
    params: {},
    returns: "An object with the current `autonomy` mode.",
    handler: async () => ok({ autonomy: store.get().autonomy ?? "review_each" }),
  });
}
