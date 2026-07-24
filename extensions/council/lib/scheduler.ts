import type { CouncilMvpLanePlanV1, CouncilRosterEntryV1, CouncilRoute } from "./types.js";

const MAX_CONCURRENCY_GLOBAL_CEILING = 4;

export function buildPhaseLanePlan(
  phase: CouncilMvpLanePlanV1["phase"],
  entries: CouncilRosterEntryV1[],
  routes: CouncilRoute[],
  memberTimeoutMs: number,
  options: {
    selectionMode?: CouncilMvpLanePlanV1["selectionMode"];
    candidateEntryIds?: string[];
  } = {}
): CouncilMvpLanePlanV1 {
  const routeMap = new Map(routes.map((route) => [route.ref.routeId, route]));
  const laneFor = (entry: CouncilRosterEntryV1) => {
    const route = routeMap.get(entry.route.routeId);
    return {
      key: route?.executionLaneKey ?? `provider-invoke:${entry.route.provider}:unknown`,
      width: Math.min(
        MAX_CONCURRENCY_GLOBAL_CEILING,
        Math.max(1, Math.floor(route?.executionLaneMaxConcurrency ?? 1))
      )
    };
  };
  const remaining = [...entries];
  const executionBatches: string[][] = [];
  while (remaining.length > 0) {
    const laneCounts = new Map<string, number>();
    const batch: CouncilRosterEntryV1[] = [];
    for (let index = 0; index < remaining.length && batch.length < MAX_CONCURRENCY_GLOBAL_CEILING;) {
      const entry = remaining[index];
      const lane = laneFor(entry);
      if ((laneCounts.get(lane.key) ?? 0) < lane.width) {
        batch.push(entry);
        laneCounts.set(lane.key, (laneCounts.get(lane.key) ?? 0) + 1);
        remaining.splice(index, 1);
      } else {
        index += 1;
      }
    }
    executionBatches.push(batch.map((entry) => entry.id));
  }
  const lanes = new Map<string, { memberCount: number; maxConcurrency: number }>();
  for (const entry of entries) {
    const lane = laneFor(entry);
    const current = lanes.get(lane.key);
    lanes.set(lane.key, {
      memberCount: (current?.memberCount ?? 0) + 1,
      maxConcurrency: lane.width
    });
  }
  const providerInvokeLanes = [...lanes.entries()].map(([laneKey, lane]) => ({
    laneKey,
    memberCount: lane.memberCount,
    maxConcurrency: lane.maxConcurrency,
    budgetMs: Math.ceil(lane.memberCount / lane.maxConcurrency) * memberTimeoutMs
  }));
  const expectedPhaseMs = executionBatches.reduce((total, batch) => total + Math.max(
    0,
    ...batch.map((entryId) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      const route = entry ? routeMap.get(entry.route.routeId) : undefined;
      return Math.min(memberTimeoutMs, Math.max(0, route?.expectedLatencyMs ?? 90000));
    })
  ), 0);
  return {
    phase,
    selectionMode: options.selectionMode ?? "fixed",
    candidateEntryIds: options.candidateEntryIds ?? entries.map((entry) => entry.id),
    selectedEntryIds: entries.map((entry) => entry.id),
    executionBatches,
    memberTimeoutMs,
    maxConcurrencyGlobalCeiling: MAX_CONCURRENCY_GLOBAL_CEILING,
    providerInvokeLanePolicy: "serial_same_account_by_default",
    providerInvokeLanes,
    portableProviderInvokeMemberCount: entries.length,
    phaseBudgetMs: executionBatches.length * memberTimeoutMs,
    expectedPhaseMs,
    effectiveConcurrency: Math.max(0, ...executionBatches.map((batch) => batch.length))
  };
}

export async function executePhaseLanePlan<T>(
  plan: CouncilMvpLanePlanV1,
  entries: CouncilRosterEntryV1[],
  worker: (entry: CouncilRosterEntryV1) => Promise<T>
): Promise<Array<{ entry: CouncilRosterEntryV1; value: T }>> {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const authorizedEntryIds = new Set(plan.candidateEntryIds);
  for (const entry of entries) {
    if (!authorizedEntryIds.has(entry.id)) throw new Error(`lane plan does not authorize entry: ${entry.id}`);
  }
  const results = new Map<string, T>();
  for (const batch of plan.executionBatches) {
    await Promise.all(batch.filter((entryId) => entriesById.has(entryId)).map(async (entryId) => {
      const entry = entriesById.get(entryId);
      if (!entry) throw new Error(`lane plan references unknown entry: ${entryId}`);
      results.set(entryId, await worker(entry));
    }));
  }
  return entries.map((entry) => {
    if (!results.has(entry.id)) throw new Error(`lane plan omitted entry: ${entry.id}`);
    return { entry, value: results.get(entry.id) as T };
  });
}
