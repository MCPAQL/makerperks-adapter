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
import { getApplicationFlow } from "../data/flows.js";
import type { Execution, ExecutionStage, SessionStore } from "../session/state.js";

// The simulated lifecycle: each submit_step processes the current stage and advances one.
const NEXT_STAGE: Record<Exclude<ExecutionStage, "done">, ExecutionStage> = {
  eligibility: "assemble",
  assemble: "submission",
  submission: "verification",
  verification: "redeem",
  redeem: "done",
};

export function registerExecuteOperations(
  router: Router,
  data: DataSource,
  store: SessionStore,
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
      const flow = getApplicationFlow(program);
      const mergedInputs = { ...execution.inputs, ...inputs };

      let missing: string[] = [];
      let did: string;
      switch (execution.stage) {
        case "eligibility":
          did =
            "eligibility is the maker's to assert and is NOT auto-asserted (see flow.gaps)";
          break;
        case "assemble":
          missing = flow.required_inputs
            .filter((ri) => ri.required && !(ri.key in mergedInputs))
            .map((ri) => ri.key);
          did =
            `assembled ${Object.keys(mergedInputs).length} input(s)` +
            (missing.length ? `; still missing: ${missing.join(", ")}` : "");
          break;
        case "submission":
          did =
            flow.automatability === "api"
              ? `SIMULATED submission to ${flow.submission.action_url ?? "?"} ` +
                `(method ${flow.submission.method}) with [${Object.keys(mergedInputs).join(", ")}]`
              : `prepared handoff to ${flow.submission.action_url ?? "?"} ` +
                `(${flow.automatability}); no in-pipeline submit — see #21`;
          break;
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
      });

      return ok({
        execution_id: executionId,
        stage: nextStage,
        status,
        did,
        simulated: true,
        missing_inputs: missing,
        next_step:
          nextStage === "done"
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
      const program = data.programs().find((p) => p.slug === execution.slug);
      const flow = program ? getApplicationFlow(program) : undefined;
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
}
