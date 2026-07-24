import type { CouncilInputSnapshotV1, CouncilReportStrategy, CouncilRole, CouncilRosterConfigV1, CouncilRoute } from "./types.js";
import { entryId, nowIso } from "./util.js";
import { extractIssueOptions } from "./position-catalog.js";

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

export { extractIssueOptions } from "./position-catalog.js";
