import { describe, expect, it } from "vitest";
import { issueSnapshot } from "../../extensions/council/lib/input.js";
import { derivePositionCatalog, extractIssueOptions } from "../../extensions/council/lib/position-catalog.js";
import { recommendReportStrategy } from "../../extensions/council/lib/recommend.js";

describe("issue position catalog", () => {
  it("shares explicit alternative grammar with recommendation and aggregation", () => {
    const input = issueSnapshot("Build or buy");
    expect(extractIssueOptions(input.text)).toEqual(["Build", "buy"]);
    expect(derivePositionCatalog(input).candidates.map((candidate) => candidate.id)).toEqual([
      "issue_option_1",
      "issue_option_2",
      "propose_alternative",
      "defer_for_evidence"
    ]);
    expect(recommendReportStrategy(input)).toEqual({ kind: "deterministic" });
  });

  it("does not treat ordinary checklist bullets as explicit alternatives", () => {
    const input = issueSnapshot("- Validate security\n- Confirm budget");
    expect(extractIssueOptions(input.text)).toEqual([]);
    expect(recommendReportStrategy(input)).toEqual({ kind: "structured_disagreement" });
  });
});
