// Wires the transport-agnostic core: a DataSource + a Router with READ, the flow ops, and
// (when a SessionStore is provided) the EXECUTE pipeline, plus mandatory introspection.
// `buildRouter` is split out so the stateful Worker can cache the DataSource per isolate and
// rebuild a cheap per-session router bound to that session's store (#17).

import { Router } from "./core/router.js";
import { registerIntrospect } from "./core/introspect.js";
import { registerReadOperations } from "./operations/read.js";
import { registerFlowOperations } from "./operations/flows.js";
import { registerExecuteOperations } from "./operations/execute.js";
import { registerProfileOperations } from "./operations/profile.js";
import { registerVaultOperations } from "./operations/vault.js";
import { registerFlowHealthOperations } from "./operations/flow-health.js";
import { registerFlowDiscoveryOperations } from "./operations/flow-discovery.js";
import { registerFlowAcceptanceOperations } from "./operations/flow-acceptance.js";
import { registerFlowExportOperations } from "./operations/flow-export.js";
import { registerStatusOperations } from "./operations/status.js";
import { DataSource, type DataSourceOptions } from "./data/source.js";
import { FlowSource } from "./data/flow-source.js";
import type { SessionStore } from "./session/state.js";
import type { ProfileStore } from "./session/profile.js";
import type { VaultCrypto } from "./session/vault.js";
import type { FlowRegistry } from "./session/flow-registry.js";
import type { AcceptedOverlay } from "./session/overlay-mirror.js";

export interface AppOptions extends DataSourceOptions {
  /** A flows.json URL or file path for the curated overlay (#47). Unset = the bundled default. */
  flowsSource?: string;
  /** When present, the EXECUTE pipeline is registered, bound to this session's store. */
  sessionStore?: SessionStore;
  /** When present, the CRUDE maker-profile surface is registered, bound to this user's store. */
  profileStore?: ProfileStore;
  /** With a profileStore, registers the encrypted credential vault (needs a key to seal/open). */
  vaultCrypto?: VaultCrypto;
  /** When present, the shared proposed-flow review queue + acceptance dial is registered (#47 D). */
  flowRegistry?: FlowRegistry;
  /**
   * A serving-only accepted overlay (#87) for a deployment WITHOUT a registry — the read-only worker
   * passes a KV-mirror-backed overlay so it serves operator-blessed flows. Ignored when a
   * `flowRegistry` is wired (the live registry is the overlay).
   */
  acceptedOverlay?: AcceptedOverlay;
  /** The authenticated subject, stamped onto proposals as `proposed_by` (#73 attribution). */
  proposer?: string;
  /**
   * Whether this session's principal is an operator (#90). Gates accept_flow / set_acceptance_mode.
   * Local/stdio is implicitly an operator (true); a hosted session resolves it from the operator
   * policy; the read-only worker never registers acceptance so it is moot there. Defaults to false
   * (fail safe) when a registry is wired but no operator status was resolved.
   */
  operator?: boolean;
}

interface RouterStores {
  sessionStore?: SessionStore;
  profileStore?: ProfileStore;
  vaultCrypto?: VaultCrypto;
  flowRegistry?: FlowRegistry;
  acceptedOverlay?: AcceptedOverlay;
  proposer?: string;
  operator?: boolean;
}

/** Assemble a router over already-loaded data + flow overlay. EXECUTE/CRUDE ops need a store. */
export function buildRouter(
  data: DataSource,
  flows: FlowSource,
  options: RouterStores = {},
): Router {
  const router = new Router();
  // The accepted overlay the SERVING ops consult: the live registry when wired (#47 piece D), else a
  // serving-only overlay (#87 — the read-only worker's KV mirror). The registry wins when both are
  // present (it is the live layer); the read-only worker passes only the mirror.
  const servingOverlay = options.flowRegistry ?? options.acceptedOverlay;
  // The listing ops honor the per-user status policy when a profile store is wired (#36); absent it
  // (the read-only endpoint) the DEFAULT policy excludes nothing.
  registerReadOperations(router, data, options.profileStore);
  // The flow-serving ops consult the accepted overlay so blessed flows are served (live on the
  // stateful side, the published mirror on the read-only side); absent it, serving is unchanged.
  registerFlowOperations(router, data, flows, servingOverlay, options.profileStore);
  // Flow-discovery toolkit (#47 piece C) — model-free READ ops over data + flows; available on
  // every deployment (the agent above supplies the model + web). The optional profile store lets
  // the entry point also consult per-user flow health (piece B); the overlay lets it serve accepted
  // flows (piece D / #87).
  registerFlowDiscoveryOperations(
    router,
    data,
    flows,
    options.profileStore,
    servingOverlay,
  );
  // Flow-export (#84 / #85) — the read-out half of the flows.json round-trip; emits the effective
  // overlay (loaded flows.json ⊕ accepted overlay). Read-only and available on every deployment;
  // without an overlay (a bare deployment) it exports just the loaded overlay.
  registerFlowExportOperations(router, flows, servingOverlay);
  // Flow-acceptance toolkit (#47 piece D) — the shared proposed-flow review queue + acceptance
  // dial; registered only where a shared FlowRegistry is wired (local + the stateful endpoint).
  if (options.flowRegistry) {
    registerFlowAcceptanceOperations(
      router,
      data,
      flows,
      options.flowRegistry,
      options.proposer,
      options.profileStore,
      options.operator ?? false, // fail safe: no resolved operator status => not an operator
    );
  }
  if (options.sessionStore) {
    // The pipeline assembles from the maker profile when one is wired (§4); the profile store
    // is optional, so the pipeline still works (without profile fill) without it.
    registerExecuteOperations(
      router,
      data,
      flows,
      options.sessionStore,
      options.profileStore,
    );
  }
  if (options.profileStore) {
    registerProfileOperations(router, options.profileStore);
    // Per-user flow health (#47 piece B) — needs the flow overlay + the per-user store.
    registerFlowHealthOperations(router, data, flows, options.profileStore);
    // Per-user directory status policy (#36 add-directory-status) — the personal view/proposal knobs.
    registerStatusOperations(router, options.profileStore);
    // The vault needs both a per-user store and a key to seal/open; register only with both.
    if (options.vaultCrypto) {
      registerVaultOperations(router, options.profileStore, options.vaultCrypto);
    }
  }
  registerIntrospect(router);
  return router;
}

export async function buildApp(
  options: AppOptions = {},
): Promise<{ router: Router; data: DataSource; flows: FlowSource }> {
  const {
    flowsSource,
    sessionStore,
    profileStore,
    vaultCrypto,
    flowRegistry,
    acceptedOverlay,
    proposer,
    operator,
    ...dataOptions
  } = options;
  const data = new DataSource(dataOptions);
  const flows = new FlowSource(flowsSource ? { source: flowsSource } : {});
  await Promise.all([data.ensureLoaded(), flows.ensureLoaded()]);
  const router = buildRouter(data, flows, {
    sessionStore,
    profileStore,
    vaultCrypto,
    flowRegistry,
    acceptedOverlay,
    proposer,
    operator,
  });
  return { router, data, flows };
}
