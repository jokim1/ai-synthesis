import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CouncilInputSnapshotV1, CouncilMvpRunPlanV1, CouncilRosterConfigV1, CouncilRoute } from "./types.js";
import { sha256, stableJson } from "./util.js";
import { rosterHash, writeJsonAtomic } from "./config.js";

export function buildRunPlan(input: CouncilInputSnapshotV1, roster: CouncilRosterConfigV1, routes: CouncilRoute[]): CouncilMvpRunPlanV1 {
  const routeMap = new Map(routes.map((route) => [route.ref.routeId, route]));
  const enabled = roster.entries.filter((entry) => entry.enabled);
  const phasePlans = ["initial_analysis", "critique", "steelman", "adversary"].map((phase) => ({
    phase: phase as "initial_analysis" | "critique" | "steelman" | "adversary",
    memberTimeoutMs: 300000,
    maxConcurrencyGlobalCeiling: 4,
    providerInvokeLanePolicy: "serial_same_account_by_default" as const,
    providerInvokeLanes: [{ laneKey: "provider-invoke:shared", memberCount: enabled.length, maxConcurrency: 1, budgetMs: enabled.length * 300000 }],
    portableProviderInvokeMemberCount: enabled.length,
    phaseBudgetMs: enabled.length * 300000,
    effectiveConcurrency: enabled.length > 0 ? 1 : 0
  }));
  const retryCostInputs = enabled.flatMap((entry) => {
    const route = routeMap.get(entry.route.routeId);
    return phasePlans.map((phase) => {
      const outputTokenCap = route?.limits.maxTokens ?? null;
      const inputPricePerMTok = route?.cost.inputPerMTok ?? null;
      const outputPricePerMTok = route?.cost.outputPerMTok ?? null;
      const maxProviderCalls = route?.structuredOutput.maxProviderCalls ?? 2;
      const inputTokenCeiling = Math.ceil(((input.text.length + 24000) / 3) * 1.2);
      const perAttempt = inputPricePerMTok === null || outputPricePerMTok === null || outputTokenCap === null
        ? null
        : ((inputTokenCeiling / 1_000_000) * inputPricePerMTok) + ((outputTokenCap / 1_000_000) * outputPricePerMTok);
      return {
        routeId: entry.route.routeId,
        phase: phase.phase,
        structuredQuestionCount: 1,
        inputTokenCeiling,
        retryInstructionTokenOverhead: 256,
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
  const cost = known ? retryCostInputs.reduce((sum, item) => sum + (item.questionCostUpperBoundUsd ?? 0), 0) : null;
  const expectedRunMs = phasePlans.reduce((sum, phase) => sum + phase.phaseBudgetMs, 0);
  return {
    version: 1,
    phasePlans,
    retryCostInputs,
    worstCaseProviderCallCount: retryCostInputs.reduce((sum, item) => sum + item.worstCaseProviderCalls, 0),
    retryAdjustedCostUpperBoundUsd: cost,
    retryAdjustedCostKnown: known,
    expectedRunMs,
    worstCaseDeadlineMs: Math.max(1200000, expectedRunMs + 120000)
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

export function writeIntent(cwd: string, input: CouncilInputSnapshotV1, roster: CouncilRosterConfigV1, routes: CouncilRoute[], plan: CouncilMvpRunPlanV1, token: string): string {
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
    ackLongRunToken: token
  }, 0o600);
  return id;
}

export function loadIntent(cwd: string, id: string): unknown {
  return JSON.parse(readFileSync(join(cwd, ".ai-synthesis", "council-intents", `${id}.json`), "utf8"));
}

export function deleteIntent(cwd: string, id: string): void {
  rmSync(join(cwd, ".ai-synthesis", "council-intents", `${id}.json`), { force: true });
}
