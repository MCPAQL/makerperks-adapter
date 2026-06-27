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
import type { Execution, SessionStore } from "../session/state.js";

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
    name: "get_status",
    semanticCategory: "EXECUTE",
    description: "Get the current state of an application execution in this session.",
    params: {
      execution_id: {
        type: "string",
        required: true,
        description: "The id returned by start_application.",
      },
    },
    returns: "An object with the full `execution` record (stage, status, inputs, log).",
    handler: async (params) => {
      const executionId = params.execution_id as string;
      const execution = store.get().executions[executionId];
      if (!execution) {
        return err("NOT_FOUND_RESOURCE", `no execution: ${executionId}`, {
          execution_id: executionId,
        });
      }
      return ok({ execution });
    },
  });
}
