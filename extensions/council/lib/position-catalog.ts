import type { CouncilInputSnapshotV1, CouncilPositionCatalogV1 } from "./types.js";

export function extractIssueOptions(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const options: string[] = [];
  if (lines.length >= 2) {
    const preface = lines.find((line) => !/^([-*]|\d+[.)])\s+/.test(line))?.toLowerCase() ?? "";
    const optionPreface = /(options:|alternatives:|choices:|approaches:|recommendations:|decide between|choose between|either\/or)/.test(preface);
    const bullets = lines.filter((line) => /^([-*]|\d+[.)])\s+/.test(line));
    const bulletOptions = bullets.length >= 2 && bullets.every((line) => /^([-*]|\d+[.)])\s+(option|alternative|choice|approach|recommendation)(?:\s+[^:.)-]{0,20})?[:.)-]\s*/i.test(line));
    if (optionPreface || bulletOptions) {
      for (const bullet of bullets) {
        const item = bullet.replace(/^([-*]|\d+[.)])\s+/, "").replace(/^(option|alternative|choice|approach|recommendation)(?:\s+[^:.)-]{0,20})?[:.)-]\s*/i, "").replace(/\.$/, "").trim();
        if (item.length >= 3 && item.length <= 120) options.push(item);
      }
    }
  }
  if (options.length === 0 && !normalized.includes("\n") && normalized.length <= 200) {
    const separators = [" vs ", " versus ", " or "].filter((separator) => normalized.split(separator).length === 2);
    if (separators.length === 1) {
      const [left, right] = normalized.split(separators[0]).map((part) => part.trim());
      if ([left, right].every((part) => part.length >= 3 && part.length <= 80 && part.split(/\s+/).length <= 10 && !/[.?!;:]/.test(part))) {
        options.push(left, right);
      }
    }
  }
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.toLowerCase().replace(/\s+/g, " ").replace(/^["']|["']$/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

export function derivePositionCatalog(input: CouncilInputSnapshotV1): CouncilPositionCatalogV1 {
  if (input.kind === "plan") {
    return {
      version: 1,
      inputKind: "plan",
      candidates: [
        { id: "accept_plan", label: "Accept plan", source: "plan_review_default" },
        { id: "revise_plan", label: "Revise plan", source: "plan_review_default" },
        { id: "reject_plan", label: "Reject plan", source: "plan_review_default" },
        { id: "needs_more_evidence", label: "Needs more evidence", source: "plan_review_default" }
      ],
      otherPrefix: "other:"
    };
  }
  const options = extractIssueOptions(input.text);
  return {
    version: 1,
    inputKind: "issue",
    candidates: [
      ...options.map((option, index) => ({ id: `issue_option_${index + 1}`, label: option, extractedText: option, source: "issue_option" as const })),
      { id: "propose_alternative", label: "Propose an alternative", source: "issue_default" },
      { id: "defer_for_evidence", label: "Defer for evidence", source: "issue_default" }
    ],
    otherPrefix: "other:"
  };
}
