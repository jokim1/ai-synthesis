import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CouncilAuthPolicy, CouncilInputSnapshotV1, CouncilMvpLanePlanV1, CouncilMvpRunPlanV1, CouncilReportStrategy, CouncilRosterConfigV1, CouncilRoute, CouncilRunIntentV1 } from "./types.js";
import { sha256, stableJson } from "./util.js";
import { rosterHash, writeJsonAtomic } from "./config.js";
import { selectPhaseEntries } from "./phase-selection.js";
import { buildPhaseLanePlan } from "./scheduler.js";

export function buildRunPlan(
  input: CouncilInputSnapshotV1,
  roster: CouncilRosterConfigV1,
  routes: CouncilRoute[],
  strategy: CouncilReportStrategy = roster.reportStrategy
): CouncilMvpRunPlanV1 {
  const routeMap = new Map(routes.map((route) => [route.ref.routeId, route]));
  const enabled = roster.entries.filter((entry) => entry.enabled);
  const chairId = strategy.kind === "chair" ? strategy.chairEntryId : undefined;
  const inputTokenCeiling = Math.ceil(((input.text.length + 24000) / 3) * 1.2);
  const retryInstructionTokenOverhead = 256;
  const phaseSelections = new Map((["initial_analysis", "critique", "steelman", "adversary", "chair"] as const).map((phase) => {
    const selected = selectPhaseEntries(phase, roster, strategy);
    const dynamicSteelman = phase === "steelman" && !enabled.some((entry) => entry.id !== chairId && entry.role === "steelman");
    const candidates = phase === "initial_analysis" || phase === "chair"
      ? selected
      : enabled.filter((entry) => entry.id !== chairId);
    return [phase, {
      selected,
      candidates,
      selectionMode: dynamicSteelman ? "least_supported_position_fallback" as const : "fixed" as const
    }];
  }));
  const phasePlans = [...phaseSelections.entries()].filter(([, selection]) => selection.selected.length > 0).map(([phase, selection]) => {
    const memberTimeoutMs = phase === "chair" ? 420000 : 300000;
    const candidatePlan = buildPhaseLanePlan(phase, selection.candidates, routes, memberTimeoutMs, {
      selectionMode: selection.selectionMode,
      candidateEntryIds: selection.candidates.map((entry) => entry.id)
    });
    return {
      ...candidatePlan,
      selectedEntryIds: selection.selected.map((entry) => entry.id),
      portableProviderInvokeMemberCount: selection.selected.length
    };
  });
  const retryCostInputs = phasePlans.flatMap((phase) => {
    const selection = phaseSelections.get(phase.phase);
    if (!selection) return [];
    const scheduled = phase.phase === "initial_analysis" || phase.phase === "chair";
    const entries = scheduled
      ? selection.selected.map((entry) => ({ entry, executionCase: "scheduled" as const }))
      : [
          ...selection.selected.map((entry) => ({ entry, executionCase: "selected" as const })),
          ...selection.candidates.map((entry) => ({ entry, executionCase: "fallback" as const }))
        ];
    return entries.map(({ entry, executionCase }) => {
      const route = routeMap.get(entry.route.routeId);
      const candidateRouteIds = [...new Set(selection.candidates.map((candidate) => candidate.route.routeId))].sort();
      const outputTokenCap = route?.limits.maxTokens ?? null;
      const inputPricePerMTok = route?.cost.inputPerMTok ?? null;
      const outputPricePerMTok = route?.cost.outputPerMTok ?? null;
      const maxProviderCalls = route?.structuredOutput.maxProviderCalls ?? 2;
      const perAttempt = inputPricePerMTok === null || outputPricePerMTok === null || outputTokenCap === null
        ? null
        : (((inputTokenCeiling + retryInstructionTokenOverhead) / 1_000_000) * inputPricePerMTok) + ((outputTokenCap / 1_000_000) * outputPricePerMTok);
      return {
        routeId: entry.route.routeId,
        candidateRouteIds,
        phase: phase.phase,
        executionCase,
        structuredQuestionCount: 1,
        inputTokenCeiling,
        retryInstructionTokenOverhead,
        outputTokenCap,
        inputPricePerMTok,
        outputPricePerMTok,
        retryOwner: route?.structuredOutput.retryOwner ?? "engine" as "adapter" | "engine",
        maxProviderCalls,
        worstCaseProviderCalls: maxProviderCalls,
        perAttemptCostCeilingUsd: perAttempt,
        questionCostUpperBoundUsd: perAttempt === null ? null : perAttempt * maxProviderCalls
      };
    });
  });
  const known = retryCostInputs.every((item) => item.questionCostUpperBoundUsd !== null);
  const phaseCost = (phase: CouncilMvpLanePlanV1["phase"]): number | null => {
    const inputs = retryCostInputs.filter((item) => item.phase === phase);
    const scheduled = inputs.filter((item) => item.executionCase !== "fallback");
    const fallbacks = inputs.filter((item) => item.executionCase === "fallback");
    if (inputs.some((item) => item.questionCostUpperBoundUsd === null)) return null;
    const scheduledCost = scheduled.reduce((sum, item) => sum + (item.questionCostUpperBoundUsd ?? 0), 0);
    const fallbackCost = Math.max(0, ...fallbacks.map((item) => item.questionCostUpperBoundUsd ?? 0));
    return Math.max(scheduledCost, fallbackCost);
  };
  const phaseProviderCalls = (phase: CouncilMvpLanePlanV1["phase"]): number => {
    const inputs = retryCostInputs.filter((item) => item.phase === phase);
    const scheduledCalls = inputs
      .filter((item) => item.executionCase !== "fallback")
      .reduce((sum, item) => sum + item.worstCaseProviderCalls, 0);
    const fallbackCalls = Math.max(
      0,
      ...inputs.filter((item) => item.executionCase === "fallback").map((item) => item.worstCaseProviderCalls)
    );
    return Math.max(scheduledCalls, fallbackCalls);
  };
  const phaseCosts = phasePlans.map((phase) => phaseCost(phase.phase));
  const cost = known && phaseCosts.every((value) => value !== null)
    ? phaseCosts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  const expectedRunMs = phasePlans.reduce((sum, phase) => sum + phase.expectedPhaseMs, 0);
  const worstCaseScheduledMs = phasePlans.reduce((sum, phase) => sum + phase.phaseBudgetMs, 0);
  return {
    version: 1,
    phasePlans,
    retryCostInputs,
    worstCaseProviderCallCount: phasePlans.reduce((sum, phase) => sum + phaseProviderCalls(phase.phase), 0),
    retryAdjustedCostUpperBoundUsd: cost,
    retryAdjustedCostKnown: known,
    expectedRunMs,
    worstCaseDeadlineMs: Math.max(1200000, worstCaseScheduledMs + 120000)
  };
}

export function runPlanHashes(plan: CouncilMvpRunPlanV1): { runPlanHash: string; retryAdjustedCostHash: string; estimatedCostBucket: string } {
  const retryAdjustedCostHash = sha256(stableJson(plan.retryCostInputs));
  const runPlanHash = sha256(stableJson(plan));
  const estimatedCostBucket = plan.retryAdjustedCostKnown && plan.retryAdjustedCostUpperBoundUsd !== null
    ? `usd:${Math.ceil(plan.retryAdjustedCostUpperBoundUsd * 100)}`
    : "unknown";
  return { runPlanHash, retryAdjustedCostHash, estimatedCostBucket };
}

export function ackToken(input: CouncilInputSnapshotV1, roster: CouncilRosterConfigV1, routes: CouncilRoute[], plan: CouncilMvpRunPlanV1): string {
  const hashes = runPlanHashes(plan);
  return sha256(stableJson({
    version: 1,
    inputSha256: input.sha256,
    rosterHash: rosterHash(roster),
    routeCatalogHash: sha256(stableJson(routes)),
    runPlanHash: hashes.runPlanHash,
    retryAdjustedCostHash: hashes.retryAdjustedCostHash,
    estimatedCostBucket: hashes.estimatedCostBucket
  }));
}

export function requiresAcknowledgment(plan: CouncilMvpRunPlanV1): boolean {
  return plan.expectedRunMs > 2700000 || !plan.retryAdjustedCostKnown || (plan.retryAdjustedCostUpperBoundUsd ?? 0) > 2;
}

export function writeIntent(
  cwd: string,
  input: CouncilInputSnapshotV1,
  roster: CouncilRosterConfigV1,
  routes: CouncilRoute[],
  plan: CouncilMvpRunPlanV1,
  token: string | undefined,
  options: {
    rosterFile?: string;
    reportStrategyOverride?: CouncilReportStrategy;
    authPolicy?: CouncilAuthPolicy;
    acceptStaleInputSha?: string;
  } = {}
): string {
  const id = `intent_${Date.now().toString(36)}_${sha256(input.sha256).slice(0, 8)}`;
  const dir = join(cwd, ".ai-synthesis", "council-intents");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const hashes = runPlanHashes(plan);
  writeJsonAtomic(join(dir, `${id}.json`), {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    inputSnapshot: input,
    rosterHash: rosterHash(roster),
    routeCatalogHash: sha256(stableJson(routes)),
    runPlan: plan,
    ...hashes,
    ackLongRunToken: token,
    ...options
  }, 0o600);
  return id;
}

function intentPath(cwd: string, id: string): string {
  if (!/^intent_[a-z0-9_]+$/.test(id)) {
    throw Object.assign(new Error("invalid intent id"), { exitCode: 2 });
  }
  return join(cwd, ".ai-synthesis", "council-intents", `${id}.json`);
}

export function loadIntent(cwd: string, id: string): CouncilRunIntentV1 {
  const parsed = JSON.parse(readFileSync(intentPath(cwd, id), "utf8")) as Partial<CouncilRunIntentV1>;
  if (
    parsed.version !== 1
    || parsed.id !== id
    || typeof parsed.expiresAt !== "string"
    || !parsed.inputSnapshot
    || typeof parsed.rosterHash !== "string"
    || typeof parsed.routeCatalogHash !== "string"
    || !parsed.runPlan
    || typeof parsed.runPlanHash !== "string"
    || typeof parsed.retryAdjustedCostHash !== "string"
    || typeof parsed.estimatedCostBucket !== "string"
  ) {
    throw Object.assign(new Error("intent sidecar is invalid"), { exitCode: 2 });
  }
  return parsed as CouncilRunIntentV1;
}

export function deleteIntent(cwd: string, id: string): void {
  rmSync(intentPath(cwd, id), { force: true });
}
