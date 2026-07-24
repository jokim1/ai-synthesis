import type { CouncilReportStrategy, CouncilRole, CouncilRosterConfigV1, CouncilRosterValidationResultV1, CouncilValidateRosterInputV1 } from "./types.js";
import { isCouncilEffort, nearestEffort } from "./effort.js";
import { routeFitsInput } from "./context-fit.js";

const roles = new Set<CouncilRole>(["chair", "architect", "implementation-critic", "risk-critic", "evidence-auditor", "steelman", "product-operator", "adversary"]);

function validateStrategy(strategy: CouncilReportStrategy | undefined): strategy is CouncilReportStrategy {
  return strategy?.kind === "deterministic" || strategy?.kind === "structured_disagreement" || (strategy?.kind === "chair" && typeof strategy.chairEntryId === "string");
}

export function validateRoster(input: CouncilValidateRosterInputV1): CouncilRosterValidationResultV1 {
  const routes = new Map(input.routes.map((route) => [route.ref.routeId, route]));
  const reconciliationDiagnostics: string[] = [];
  const reconciledEntries = input.config.entries.map((entry) => {
    if (routes.has(entry.route.routeId)) return entry;
    const tupleMatch = input.routes.find((route) =>
      route.ref.executor === entry.route.executor
      && route.ref.provider === entry.route.provider
      && route.ref.model === entry.route.model
    );
    if (!tupleMatch) return entry;
    reconciliationDiagnostics.push(`route_id_mismatch: ${entry.id} ${entry.route.routeId} -> ${tupleMatch.ref.routeId}`);
    return { ...entry, route: tupleMatch.ref };
  });
  const reconciledConfig = { ...input.config, entries: reconciledEntries };
  const blockingProblems: CouncilRosterValidationResultV1["blockingProblems"] = [];
  const compositionFeedback: CouncilRosterValidationResultV1["compositionFeedback"] = [];
  const executableEntryIds: string[] = [];
  const unavailableEntryIds: string[] = [];
  const unsupportedEffortEntryIds: string[] = [];
  const seen = new Set<string>();
  const configuredCap = input.config.maxEnabledMembers ?? 6;

  if (!Number.isInteger(configuredCap) || configuredCap < 2 || configuredCap > 8) {
    blockingProblems.push({ kind: "invalid_roster_cap", message: "maxEnabledMembers must be an integer from 2 through 8" });
  } else {
    const enabledCount = reconciledConfig.entries.filter((entry) => entry.enabled).length;
    if (enabledCount > configuredCap) {
      blockingProblems.push({ kind: "too_many_enabled_members", message: `enabled roster has ${enabledCount} members; configured cap is ${configuredCap}` });
    }
  }

  for (const entry of reconciledConfig.entries) {
    if (seen.has(entry.id)) {
      blockingProblems.push({ kind: "duplicate_entry_id", entryId: entry.id, message: `duplicate roster entry id: ${entry.id}` });
      continue;
    }
    seen.add(entry.id);
    if (!entry.id || !roles.has(entry.role) || !isCouncilEffort(entry.effort)) {
      blockingProblems.push({ kind: "stale_dogfood_roster_shape", entryId: entry.id, message: `entry ${entry.id || "(missing)"} is not canonical v1` });
      continue;
    }
    const route = routes.get(entry.route.routeId);
    if (!route || !route.auth.runnable || !routeFitsInput(route, input.inputSnapshot)) {
      unavailableEntryIds.push(entry.id);
      if (entry.enabled) {
        blockingProblems.push({
          kind: route && !routeFitsInput(route, input.inputSnapshot) ? "input_context_overflow" : "unavailable_route",
          entryId: entry.id,
          routeId: entry.route.routeId,
          message: route?.auth.reason ?? `route unavailable: ${entry.route.routeId}`,
          suggestedRouteIds: input.routes.filter((candidate) => candidate.auth.runnable).map((candidate) => candidate.ref.routeId)
        });
      }
      continue;
    }
    if (!route.supportedEfforts.includes(entry.effort)) {
      unsupportedEffortEntryIds.push(entry.id);
      if (entry.enabled) {
        blockingProblems.push({
          kind: "unsupported_effort",
          entryId: entry.id,
          routeId: route.ref.routeId,
          message: `effort ${entry.effort} is not supported by ${route.displayName}`,
          suggestedEfforts: nearestEffort(entry.effort, route.supportedEfforts)
        });
      }
      continue;
    }
    if (entry.enabled) executableEntryIds.push(entry.id);
  }

  if (executableEntryIds.length < 2) {
    blockingProblems.push({ kind: "too_few_executable_members", message: "at least two executable council members are required" });
  }

  const providers = new Set(executableEntryIds.map((id) => reconciledConfig.entries.find((entry) => entry.id === id)?.route.provider));
  const routeIds = new Set(executableEntryIds.map((id) => reconciledConfig.entries.find((entry) => entry.id === id)?.route.routeId));
  if (routeIds.size === 1 && executableEntryIds.length >= 2) {
    compositionFeedback.push({ kind: "warning", message: "same-route council: outputs are correlated; readiness is capped at conditional", entryIds: executableEntryIds });
  } else if (providers.size === 1 && executableEntryIds.length >= 2) {
    compositionFeedback.push({ kind: "suggestion", message: "same-provider council is valid; add another model family when available", entryIds: executableEntryIds });
  } else if (providers.size > 1) {
    compositionFeedback.push({ kind: "suggestion", message: "cross-provider roster improves independence", entryIds: executableEntryIds });
  }

  const effective = input.reportStrategyOverride ?? input.config.reportStrategy;
  let reportStrategy: CouncilRosterValidationResultV1["reportStrategy"];
  if (!validateStrategy(effective)) {
    blockingProblems.push({ kind: "missing_report_strategy", message: "reportStrategy is required" });
    reportStrategy = { ok: false, source: input.reportStrategyOverride ? "cli" : "roster_file", message: "reportStrategy is required" };
  } else if (effective.kind === "chair") {
    const chair = reconciledConfig.entries.find((entry) => entry.id === effective.chairEntryId);
    if (!chair || chair.role !== "chair" || !executableEntryIds.includes(chair.id)) {
      blockingProblems.push({ kind: "invalid_chair_strategy", entryId: effective.chairEntryId, message: "chair strategy requires an enabled executable entry whose role is chair" });
      reportStrategy = { ok: false, source: input.reportStrategyOverride ? "cli" : "roster_file", message: "invalid chair strategy" };
    } else {
      reportStrategy = { ok: true, effective, source: input.reportStrategyOverride ? "cli" : "roster_file" };
    }
  } else {
    reportStrategy = { ok: true, effective, source: input.reportStrategyOverride ? "cli" : "roster_file" };
  }

  return {
    ok: blockingProblems.length === 0,
    executableEntryIds,
    unavailableEntryIds,
    unsupportedEffortEntryIds,
    blockingProblems,
    compositionFeedback,
    reconciliationDiagnostics,
    reconciledConfig,
    reportStrategy
  };
}

export function assertRosterShape(value: unknown): asserts value is CouncilRosterConfigV1 {
  if (!value || typeof value !== "object") throw new Error("roster must be an object");
  const roster = value as Record<string, unknown>;
  if (roster.version !== 1) throw new Error("roster version must be 1");
  if (!Array.isArray(roster.entries)) throw new Error("roster entries must be an array");
  if (
    roster.maxEnabledMembers !== undefined
    && (!Number.isInteger(roster.maxEnabledMembers) || (roster.maxEnabledMembers as number) < 2 || (roster.maxEnabledMembers as number) > 8)
  ) {
    throw new Error("maxEnabledMembers must be an integer from 2 through 8");
  }
  if (!roster.reportStrategy || typeof roster.reportStrategy !== "object") throw new Error("reportStrategy is required");
  for (const rawEntry of roster.entries as Array<Record<string, unknown>>) {
    if ("chair" in rawEntry) throw new Error("entry-level chair is stale dogfood; use reportStrategy.kind=chair");
    if (!rawEntry.id || typeof rawEntry.id !== "string") throw new Error("entry id is required");
    if (!rawEntry.route || typeof rawEntry.route !== "object" || typeof (rawEntry.route as Record<string, unknown>).routeId !== "string") {
      throw new Error("entry route.routeId is required");
    }
  }
}
