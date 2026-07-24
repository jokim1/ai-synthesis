import { describe, expect, it } from "vitest";
import { validateRoster } from "../../extensions/council/lib/validate-roster.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";
import type { CouncilRosterConfigV1 } from "../../extensions/council/lib/types.js";

const route = providerInvokeRoute("claude", true);

function roster(entries: CouncilRosterConfigV1["entries"], reportStrategy: CouncilRosterConfigV1["reportStrategy"] = { kind: "deterministic" }): CouncilRosterConfigV1 {
  return { version: 1, updatedAt: "2026-01-01T00:00:00.000Z", scope: "explicit", entries, reportStrategy };
}

describe("validateRoster", () => {
  it("allows two same-route members and discloses correlation", () => {
    const config = roster([
      { id: "entry_a", route: route.ref, role: "architect", effort: "medium", enabled: true },
      { id: "entry_b", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
    ]);
    const result = validateRoster({ config, routes: [route], mode: "portable_cli" });
    expect(result.ok).toBe(true);
    expect(result.executableEntryIds).toEqual(["entry_a", "entry_b"]);
    expect(result.compositionFeedback.map((item) => item.message).join("\n")).toContain("same-route");
  });

  it("blocks duplicate ids, unsupported effort, unavailable routes, and invalid chair", () => {
    const unavailable = providerInvokeRoute("codex", false, "tool_policy_unproven");
    const config = roster([
      { id: "entry_dup", route: route.ref, role: "architect", effort: "off", enabled: true },
      { id: "entry_dup", route: unavailable.ref, role: "chair", effort: "medium", enabled: true }
    ], { kind: "chair", chairEntryId: "entry_dup" });
    const result = validateRoster({ config, routes: [route, unavailable], mode: "portable_cli" });
    expect(result.ok).toBe(false);
    expect(result.blockingProblems.map((item) => item.kind)).toEqual(expect.arrayContaining(["duplicate_entry_id", "unsupported_effort", "too_few_executable_members", "invalid_chair_strategy"]));
  });

  it("reconciles a stale route id by the stable route tuple", () => {
    const staleRef = { ...route.ref, routeId: "v1:provider-invoke:claude:stale" };
    const config = roster([
      { id: "entry_a", route: staleRef, role: "architect", effort: "medium", enabled: true },
      { id: "entry_b", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
    ]);
    const result = validateRoster({ config, routes: [route], mode: "portable_cli" });
    expect(result.ok).toBe(true);
    expect(result.reconciliationDiagnostics).toContain(`route_id_mismatch: entry_a ${staleRef.routeId} -> ${route.ref.routeId}`);
    expect(result.reconciledConfig.entries[0].route).toEqual(route.ref);
    expect(config.entries[0].route.routeId).toBe(staleRef.routeId);
  });

  it("enforces the default six-member cap and bounds overrides at eight", () => {
    const entries = Array.from({ length: 7 }, (_, index) => ({
      id: `entry_${index}`,
      route: route.ref,
      role: "architect" as const,
      effort: "medium" as const,
      enabled: true
    }));
    const defaultResult = validateRoster({ config: roster(entries), routes: [route], mode: "portable_cli" });
    expect(defaultResult.blockingProblems.map((item) => item.kind)).toContain("too_many_enabled_members");

    const overridden = validateRoster({
      config: { ...roster(entries), maxEnabledMembers: 8 },
      routes: [route],
      mode: "portable_cli"
    });
    expect(overridden.ok).toBe(true);

    const invalid = validateRoster({
      config: { ...roster(entries), maxEnabledMembers: 9 },
      routes: [route],
      mode: "portable_cli"
    });
    expect(invalid.blockingProblems.map((item) => item.kind)).toContain("invalid_roster_cap");
  });
});
