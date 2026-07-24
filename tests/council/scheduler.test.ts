import { describe, expect, it } from "vitest";
import { buildPhaseLanePlan, executePhaseLanePlan } from "../../extensions/council/lib/scheduler.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";

describe("council phase lane scheduler", () => {
  it("uses the planned batches with lane widths and a global cap of four", async () => {
    const base = providerInvokeRoute("claude", true);
    const routes = Array.from({ length: 6 }, (_, index) => ({
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:${index}`, model: `model-${index}` },
      executionLaneKey: index === 4 ? "lane-0" : `lane-${index}`,
      executionLaneMaxConcurrency: 1
    }));
    const entries = routes.map((route, index) => ({
      id: `entry_${index}`,
      route: route.ref,
      role: "architect" as const,
      effort: "medium" as const,
      enabled: true
    }));
    const plan = buildPhaseLanePlan("initial_analysis", entries, routes, 100);
    expect(plan.executionBatches).toEqual([
      ["entry_0", "entry_1", "entry_2", "entry_3"],
      ["entry_4", "entry_5"]
    ]);
    expect(plan.effectiveConcurrency).toBe(4);
    expect(plan.phaseBudgetMs).toBe(200);

    let active = 0;
    let maxActive = 0;
    const activeByLane = new Map<string, number>();
    await executePhaseLanePlan(plan, entries, async (entry) => {
      const route = routes.find((candidate) => candidate.ref.routeId === entry.route.routeId);
      const lane = route?.executionLaneKey as string;
      active += 1;
      maxActive = Math.max(maxActive, active);
      activeByLane.set(lane, (activeByLane.get(lane) ?? 0) + 1);
      expect(activeByLane.get(lane)).toBeLessThanOrEqual(1);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeByLane.set(lane, (activeByLane.get(lane) ?? 1) - 1);
      active -= 1;
      return entry.id;
    });
    expect(maxActive).toBe(4);
  });
});
