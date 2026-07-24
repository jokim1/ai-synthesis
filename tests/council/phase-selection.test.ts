import { describe, expect, it } from "vitest";
import { selectPhaseEntries } from "../../extensions/council/lib/phase-selection.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";

describe("council phase selection", () => {
  it("selects the highest-effort member supporting the least-supported position", () => {
    const route = providerInvokeRoute("claude", true);
    const roster = {
      version: 1 as const,
      updatedAt: new Date().toISOString(),
      scope: "explicit" as const,
      entries: [
        { id: "entry_aaaaaaaaaaaaaaaaaaaaaaaaaa", route: route.ref, role: "architect" as const, effort: "max" as const, enabled: true },
        { id: "entry_bbbbbbbbbbbbbbbbbbbbbbbbbb", route: route.ref, role: "product-operator" as const, effort: "medium" as const, enabled: true },
        { id: "entry_cccccccccccccccccccccccccc", route: route.ref, role: "architect" as const, effort: "high" as const, enabled: true }
      ],
      reportStrategy: { kind: "deterministic" as const }
    };
    const positions = new Map([["entry_aaaaaaaaaaaaaaaaaaaaaaaaaa", "issue_option_1"], ["entry_bbbbbbbbbbbbbbbbbbbbbbbbbb", "issue_option_1"], ["entry_cccccccccccccccccccccccccc", "issue_option_2"]]);
    expect(selectPhaseEntries("steelman", roster, roster.reportStrategy, undefined, positions).map((entry) => entry.id)).toEqual(["entry_cccccccccccccccccccccccccc"]);
  });
});
