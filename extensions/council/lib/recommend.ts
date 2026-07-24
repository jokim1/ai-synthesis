import type { CouncilInputSnapshotV1, CouncilReportStrategy, CouncilRole, CouncilRosterConfigV1, CouncilRoute } from "./types.js";
import { entryId, nowIso } from "./util.js";

const planRoles: CouncilRole[] = ["architect", "implementation-critic", "risk-critic", "steelman", "adversary", "product-operator"];
const issueRoles: CouncilRole[] = ["product-operator", "risk-critic", "steelman", "adversary", "architect", "implementation-critic"];

export function recommendReportStrategy(input: CouncilInputSnapshotV1): CouncilReportStrategy {
  if (input.kind === "plan") return { kind: "deterministic" };
  if (extractIssueOptions(input.text).length >= 2) return { kind: "deterministic" };
  return { kind: "structured_disagreement" };
}

export function recommendRoster(input: CouncilInputSnapshotV1, routes: CouncilRoute[], scope: "explicit" | "user" = "explicit"): CouncilRosterConfigV1 {
  const executable = routes.filter((route) => route.auth.runnable && route.supportedEfforts.length > 0);
  const selected = executable.length >= 2 ? executable.slice(0, 2) : executable.length === 1 ? [executable[0], executable[0]] : [];
  const roles = input.kind === "plan" ? planRoles : issueRoles;
  return {
    version: 1,
    updatedAt: nowIso(),
    scope,
    entries: selected.map((route, index) => ({
      id: entryId(),
      route: route.ref,
      role: roles[index] ?? "risk-critic",
      effort: route.supportedEfforts.includes("medium") ? "medium" : route.supportedEfforts[0],
      enabled: true
    })),
    reportStrategy: recommendReportStrategy(input)
  };
}

export function extractIssueOptions(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const options: string[] = [];
  if (lines.length >= 2) {
    const preface = lines.find((line) => !/^([-*]|\d+[.)])\s+/.test(line))?.toLowerCase() ?? "";
    const optionPreface = /(options:|alternatives:|choices:|approaches:|recommendations:|decide between|choose between|either\/or)/.test(preface);
    const bullets = lines.filter((line) => /^([-*]|\d+[.)])\s+/.test(line));
    const bulletOptions = bullets.length >= 2 && bullets.every((line) => /^([-*]|\d+[.)])\s+(option|alternative|choice|approach|recommendation)?[^:.)-]{0,20}[:.)-]?\s*/i.test(line));
    if (optionPreface || bulletOptions) {
      for (const bullet of bullets) {
        const item = bullet.replace(/^([-*]|\d+[.)])\s+/, "").replace(/^(option|alternative|choice|approach|recommendation)\s*[^:.)-]{0,20}[:.)-]\s*/i, "").replace(/\.$/, "").trim();
        if (item.length >= 3 && item.length <= 120) options.push(item);
      }
    }
  }
  if (options.length === 0 && !normalized.includes("\n") && normalized.length <= 200) {
    const separators = [" vs ", " versus ", " or "].filter((sep) => normalized.includes(sep));
    if (separators.length === 1) {
      const [left, right] = normalized.split(separators[0]).map((part) => part.trim());
      for (const part of [left, right]) {
        if (part.length >= 3 && part.length <= 80 && part.split(/\s+/).length <= 10 && !/[.?!;:]/.test(part)) options.push(part);
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
