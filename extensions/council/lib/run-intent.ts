import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CouncilInputSnapshotV1, CouncilMvpRunPlanV1, CouncilRosterConfigV1, CouncilRoute, CouncilRunIntentV1 } from "./types.js";
import { sha256, stableJson } from "./util.js";
import { rosterHash, writeJsonAtomic } from "./config.js";

export function buildRunPlan(input: CouncilInputSnapshotV1, roster: CouncilRosterConfigV1, routes: CouncilRoute[]): CouncilMvpRunPlanV1 {
  const routeMap = new Map(routes.map((route) => [route.ref.routeId, route]));
  const enabled = roster.entries.filter((entry) => entry.enabled);
  const chair = roster.reportStrategy.kind === "chair" ? enabled.find((entry) => entry.id === roster.reportStrategy.chairEntryId) : undefined;
  const phaseMembers = new Map([
    ["initial_analysis", enabled],
    ["critique", enabled],
    ["steelman", enabled],
    ["adversary", enabled],
    ["chair", chair ? [chair] : []]
  ] as const);
  const phasePlans = [...phaseMembers.entries()].filter(([, members]) => members.length > 0).map(([phase, members]) => ({
    phase,
    memberTimeoutMs: phase === "chair" ? 420000 : 300000,
    maxConcurrencyGlobalCeiling: 4,
    providerInvokeLanePolicy: "serial_same_account_by_default" as const,
    providerInvokeLanes: [{ laneKey: "provider-invoke:shared", memberCount: members.length, maxConcurrency: 1, budgetMs: members.length * (phase === "chair" ? 420000 : 300000) }],
    portableProviderInvokeMemberCount: members.length,
    phaseBudgetMs: members.length * (phase === "chair" ? 420000 : 300000),
    effectiveConcurrency: members.length > 0 ? 1 : 0
  }));
  const retryCostInputs = phasePlans.flatMap((phase) =>
    (phase.phase === "chair" ? (chair ? [chair] : []) : enabled).map((entry) => {
      const route = routeMap.get(entry.route.routeId);
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
    })
  );
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
