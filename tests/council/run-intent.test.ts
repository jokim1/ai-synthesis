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
        { id: "entry_chair", route: route.ref, role: "chair", effort: "medium", enabled: true },
        { id: "entry_critic", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    };
    const deterministic = buildRunPlan(input, roster, [route]);
    const chair = buildRunPlan(input, roster, [route], { kind: "chair", chairEntryId: "entry_chair" });
    expect(deterministic.phasePlans.find((phase) => phase.phase === "critique")?.portableProviderInvokeMemberCount).toBe(1);
    expect(deterministic.phasePlans.some((phase) => phase.phase === "chair")).toBe(false);
    expect(chair.phasePlans.find((phase) => phase.phase === "chair")?.memberTimeoutMs).toBe(420000);
    expect(chair.worstCaseProviderCallCount).toBe(deterministic.worstCaseProviderCallCount + 2);
    expect(runPlanHashes(chair).runPlanHash).not.toBe(runPlanHashes(deterministic).runPlanHash);
  });
});
