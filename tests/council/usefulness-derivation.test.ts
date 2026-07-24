import { describe, expect, it } from "vitest";
import { evaluateRuns } from "../../scripts/council-usefulness-derivation.mjs";

const baseline = {
  recommendation: "Proceed with the reviewed approach",
  next_action: "Confirm inputs",
  evidence: [],
  assumptions: [],
  risks: [],
  what_would_change_my_view: []
};

function report(nextAction = "Confirm inputs") {
  return {
    recommendation: "Proceed with the reviewed approach",
    strongest_dissent: "No distinct dissent",
    evidence_summary: [],
    assumptions: [],
    risks: [],
    next_action: nextAction
  };
}

describe("council usefulness run derivation", () => {
  it("selects a value-adding revision and derives every revision outcome", () => {
    const evaluation = evaluateRuns(
      report(),
      [report("Deploy the verified canary now"), report()],
      baseline
    );

    expect(evaluation.selectedRun).toBe("revision-1");
    expect(evaluation.selectedDeltas).toEqual(["next_action"]);
    expect(evaluation.revisions.map((revision) => revision.outcome)).toEqual([
      "material_delta_demonstrated",
      "correlated_no_added_value"
    ]);
  });

  it("keeps the primary run when no revision adds value", () => {
    const evaluation = evaluateRuns(report(), [report(), report()], baseline);

    expect(evaluation.selectedRun).toBe("primary");
    expect(evaluation.selectedDeltas).toEqual([]);
    expect(evaluation.revisions.every((revision) => revision.outcome === "correlated_no_added_value")).toBe(true);
  });
});
