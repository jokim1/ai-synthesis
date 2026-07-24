import type { CouncilReportStrategy, CouncilRole, CouncilRosterConfigV1, CouncilRosterValidationResultV1, CouncilValidateRosterInputV1 } from "./types.js";
import { isCouncilEffort, nearestEffort } from "./effort.js";
import { routeFitsInput } from "./context-fit.js";

const roles = new Set<CouncilRole>(["chair", "architect", "implementation-critic", "risk-critic", "evidence-auditor", "steelman", "product-operator", "adversary"]);
export const COUNCIL_ROSTER_ENTRY_ID_PATTERN = /^entry_[a-z2-7]{26}$/;

function validateStrategy(strategy: CouncilReportStrategy | undefined): strategy is CouncilReportStrategy {
  return strategy?.kind === "deterministic" || strategy?.kind === "structured_disagreement" || (strategy?.kind === "chair" && typeof strategy.chairEntryId === "string");
}

function entryShapeError(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "entry must be an object";
  const value = entry as Record<string, unknown>;
  if (typeof value.id !== "string" || !COUNCIL_ROSTER_ENTRY_ID_PATTERN.test(value.id)) return "entry id must match entry_<26 lowercase base32 chars>";
  if (!roles.has(value.role as CouncilRole)) return "entry role is invalid";
  if (!isCouncilEffort(value.effort)) return "entry effort is invalid";
  if (typeof value.enabled !== "boolean") return "entry enabled must be boolean";
  if (!value.route || typeof value.route !== "object" || Array.isArray(value.route)) return "entry route is required";
  const route = value.route as Record<string, unknown>;
  if (
    route.executor !== "provider-invoke"
    || typeof route.provider !== "string"
    || route.provider.length === 0
    || typeof route.model !== "string"
    || route.model.length === 0
    || typeof route.routeId !== "string"
    || route.routeId.length === 0
  ) return "entry route must contain a complete provider-invoke tuple";
  return undefined;
}

export function validateRoster(input: CouncilValidateRosterInputV1): CouncilRosterValidationResultV1 {
  const routes = new Map(input.routes.map((route) => [route.ref.routeId, route]));
  const reconciliationDiagnostics: string[] = [];
  const reconciledEntries = input.config.entries.map((entry) => {
    if (entryShapeError(entry)) return entry;
    const routeById = routes.get(entry.route.routeId);
    if (routeById) {
      if (
        routeById.ref.executor !== entry.route.executor
        || routeById.ref.provider !== entry.route.provider
        || routeById.ref.model !== entry.route.model
      ) {
        reconciliationDiagnostics.push(`route_tuple_mismatch: ${entry.id} ${entry.route.routeId}`);
        return { ...entry, route: routeById.ref };
      }
      return entry;
    }
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
    const shapeError = entryShapeError(entry);
    if (shapeError) {
      blockingProblems.push({ kind: "stale_dogfood_roster_shape", entryId: typeof entry?.id === "string" ? entry.id : undefined, message: shapeError });
      continue;
    }
    if (seen.has(entry.id)) {
      blockingProblems.push({ kind: "duplicate_entry_id", entryId: entry.id, message: `duplicate roster entry id: ${entry.id}` });
      continue;
    }
    seen.add(entry.id);
    if (!entry.id || !COUNCIL_ROSTER_ENTRY_ID_PATTERN.test(entry.id) || !roles.has(entry.role) || !isCouncilEffort(entry.effort)) {
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
  for (const rawEntry of roster.entries as unknown[]) {
    const shapeError = entryShapeError(rawEntry);
    if (shapeError) throw new Error(shapeError);
    const entry = rawEntry as Record<string, unknown>;
    if ("chair" in entry) throw new Error("entry-level chair is stale dogfood; use reportStrategy.kind=chair");
  }
}
