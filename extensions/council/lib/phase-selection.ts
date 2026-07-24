import type { CouncilReportStrategy, CouncilRosterConfigV1, CouncilRosterEntryV1 } from "./types.js";
import { COUNCIL_EFFORT_ORDER } from "./effort.js";

function effortRank(entry: CouncilRosterEntryV1): number {
  return COUNCIL_EFFORT_ORDER.indexOf(entry.effort);
}

function strongest(entries: CouncilRosterEntryV1[], roster: CouncilRosterConfigV1): CouncilRosterEntryV1[] {
  return [...entries].sort((a, b) => effortRank(b) - effortRank(a) || roster.entries.indexOf(a) - roster.entries.indexOf(b)).slice(0, 1);
}

export function selectPhaseEntries(
  phase: "initial_analysis" | "critique" | "steelman" | "adversary" | "chair",
  roster: CouncilRosterConfigV1,
  strategy: CouncilReportStrategy,
  successfulEntryIds = new Set(roster.entries.filter((entry) => entry.enabled).map((entry) => entry.id)),
  canonicalPositionByEntryId?: ReadonlyMap<string, string>
): CouncilRosterEntryV1[] {
  const successful = roster.entries.filter((entry) => entry.enabled && successfulEntryIds.has(entry.id));
  const chairId = strategy.kind === "chair" ? strategy.chairEntryId : undefined;
  const nonChair = successful.filter((entry) => entry.id !== chairId);
  if (phase === "initial_analysis") return successful;
  if (phase === "chair") return strategy.kind === "chair" ? successful.filter((entry) => entry.id === strategy.chairEntryId) : [];
  if (phase === "critique") {
    const preferred = nonChair.filter((entry) => ["implementation-critic", "risk-critic", "evidence-auditor"].includes(entry.role));
    return preferred.length > 0 ? preferred : strongest(nonChair, roster);
  }
  if (phase === "steelman") {
    const preferred = nonChair.filter((entry) => entry.role === "steelman");
    if (preferred.length > 0) return preferred;
    if (!canonicalPositionByEntryId) return strongest(nonChair, roster);
    const support = new Map<string, number>();
    for (const entry of successful) {
      const positionId = canonicalPositionByEntryId.get(entry.id);
      if (positionId) support.set(positionId, (support.get(positionId) ?? 0) + 1);
    }
    const eligible = nonChair.filter((entry) => canonicalPositionByEntryId.has(entry.id));
    const leastSupport = Math.min(...eligible.map((entry) => support.get(canonicalPositionByEntryId.get(entry.id) as string) ?? 0));
    return strongest(eligible.filter((entry) => support.get(canonicalPositionByEntryId.get(entry.id) as string) === leastSupport), roster);
  }
  const adversaries = nonChair.filter((entry) => entry.role === "adversary");
  if (adversaries.length > 0) return adversaries;
  const riskCritic = nonChair.filter((entry) => entry.role === "risk-critic").slice(0, 1);
  return riskCritic.length > 0 ? riskCritic : strongest(nonChair, roster);
}

export function phaseSelectionWasFallback(
  phase: "critique" | "steelman" | "adversary",
  entries: CouncilRosterEntryV1[]
): boolean {
  return !entries.some((entry) =>
    phase === "critique"
      ? ["implementation-critic", "risk-critic", "evidence-auditor"].includes(entry.role)
      : entry.role === phase
  );
}
