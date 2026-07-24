import { describe, expect, it } from "vitest";
import { ackToken, buildRunPlan, requiresAcknowledgment, runPlanHashes } from "../../extensions/council/lib/run-intent.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";
import type { CouncilInputSnapshotV1, CouncilRosterConfigV1 } from "../../extensions/council/lib/types.js";

const input: CouncilInputSnapshotV1 = { kind: "issue", displayName: "issue", text: "A or B", lineMap: [{ line: 1, startOffset: 0, endOffset: 6 }], sha256: "abc" };

describe("run intent cost contract", () => {
  it("requires acknowledgment for unknown cost and token changes when retry ownership changes", () => {
    const route = providerInvokeRoute("claude", true);
    const roster: CouncilRosterConfigV1 = {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      scope: "explicit",
      entries: [
        { id: "entry_a", route: route.ref, role: "architect", effort: "medium", enabled: true },
        { id: "entry_b", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    };
    const plan = buildRunPlan(input, roster, [route]);
    expect(requiresAcknowledgment(plan)).toBe(true);
    expect(plan.expectedRunMs).toBe(plan.phasePlans.reduce((sum, phase) => sum + phase.expectedPhaseMs, 0));
    expect(plan.expectedRunMs).toBeLessThan(plan.phasePlans.reduce((sum, phase) => sum + phase.phaseBudgetMs, 0));
    expect(plan.worstCaseDeadlineMs).toBe(
      Math.max(1200000, plan.phasePlans.reduce((sum, phase) => sum + phase.phaseBudgetMs, 0) + 120000)
    );
    const token = ackToken(input, roster, [route], plan);
    const changed = { ...route, structuredOutput: { ...route.structuredOutput, maxProviderCalls: 1 as const } };
    const changedPlan = buildRunPlan(input, roster, [changed]);
    expect(runPlanHashes(changedPlan).retryAdjustedCostHash).not.toBe(runPlanHashes(plan).retryAdjustedCostHash);
    expect(ackToken(input, roster, [changed], changedPlan)).not.toBe(token);
  });

  it("binds phase selection and a chair override into the consent plan", () => {
    const route = providerInvokeRoute("claude", true);
    const roster: CouncilRosterConfigV1 = {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      scope: "explicit",
      entries: [
        { id: "entry_chair", route: route.ref, role: "risk-critic", effort: "medium", enabled: true },
        { id: "entry_critic", route: route.ref, role: "architect", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    };
    const deterministic = buildRunPlan(input, roster, [route]);
    const chair = buildRunPlan(input, roster, [route], { kind: "chair", chairEntryId: "entry_chair" });
    expect(deterministic.phasePlans.find((phase) => phase.phase === "critique")?.portableProviderInvokeMemberCount).toBe(1);
    expect(deterministic.phasePlans.find((phase) => phase.phase === "steelman")).toMatchObject({
      selectionMode: "least_supported_position_fallback",
      candidateEntryIds: ["entry_chair", "entry_critic"],
      executionBatches: [["entry_chair"], ["entry_critic"]]
    });
    expect(deterministic.phasePlans.some((phase) => phase.phase === "chair")).toBe(false);
    expect(chair.phasePlans.find((phase) => phase.phase === "chair")?.memberTimeoutMs).toBe(420000);
    expect(chair.phasePlans.find((phase) => phase.phase === "critique")).toMatchObject({
      selectedEntryIds: ["entry_critic"],
      candidateEntryIds: ["entry_critic"]
    });
    expect(chair.worstCaseProviderCallCount).toBe(deterministic.worstCaseProviderCallCount + 2);
    expect(runPlanHashes(chair).runPlanHash).not.toBe(runPlanHashes(deterministic).runPlanHash);
  });

  it("prices dynamic steelman fallback by retry-adjusted candidate cost", () => {
    const base = providerInvokeRoute("claude", true);
    const twoCall = {
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:two`, model: "two-call" },
      structuredOutput: { ...base.structuredOutput, maxProviderCalls: 2 as const },
      cost: { known: true, inputPerMTok: 0, outputPerMTok: 1 },
      limits: { maxTokens: 1_000_000 }
    };
    const oneCall = {
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:one`, model: "one-call" },
      structuredOutput: { ...base.structuredOutput, maxProviderCalls: 1 as const },
      cost: { known: true, inputPerMTok: 0, outputPerMTok: 1.5 },
      limits: { maxTokens: 1_000_000 }
    };
    const roster: CouncilRosterConfigV1 = {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      scope: "explicit",
      entries: [
        { id: "entry_a", route: twoCall.ref, role: "architect", effort: "medium", enabled: true },
        { id: "entry_b", route: oneCall.ref, role: "product-operator", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    };
    const plan = buildRunPlan(input, roster, [twoCall, oneCall]);
    expect(plan.retryCostInputs.find((item) => item.phase === "steelman")).toMatchObject({
      routeId: twoCall.ref.routeId,
      maxProviderCalls: 2,
      questionCostUpperBoundUsd: 2
    });
  });

  it("prices worst authorized critique and adversary fallback envelopes", () => {
    const base = providerInvokeRoute("claude", true);
    const cheap = {
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:cheap`, model: "cheap" },
      structuredOutput: { ...base.structuredOutput, retryOwner: "adapter" as const, maxProviderCalls: 1 as const },
      cost: { known: true, inputPerMTok: 0, outputPerMTok: 1 },
      limits: { maxTokens: 100_000 }
    };
    const expensiveFallback = {
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:fallback`, model: "fallback" },
      structuredOutput: { ...base.structuredOutput, retryOwner: "engine" as const, maxProviderCalls: 2 as const },
      cost: { known: true, inputPerMTok: 0, outputPerMTok: 2 },
      limits: { maxTokens: 1_000_000 }
    };
    const roster: CouncilRosterConfigV1 = {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      scope: "explicit",
      entries: [
        { id: "entry_cheap", route: cheap.ref, role: "risk-critic", effort: "medium", enabled: true },
        { id: "entry_fallback", route: expensiveFallback.ref, role: "architect", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    };
    const plan = buildRunPlan(input, roster, [cheap, expensiveFallback]);
    for (const phase of ["critique", "adversary"] as const) {
      expect(plan.retryCostInputs.find((item) =>
        item.phase === phase
        && item.executionCase === "fallback"
        && item.routeId === expensiveFallback.ref.routeId
      )).toMatchObject({
        retryOwner: "engine",
        maxProviderCalls: 2,
        questionCostUpperBoundUsd: 4
      });
    }
    expect(plan.worstCaseProviderCallCount).toBeGreaterThan(
      plan.retryCostInputs
        .filter((item) => item.executionCase === "selected")
        .reduce((sum, item) => sum + item.worstCaseProviderCalls, 0)
    );
  });
});
