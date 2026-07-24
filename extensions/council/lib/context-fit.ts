import type { CouncilInputSnapshotV1, CouncilRoute } from "./types.js";

export const COUNCIL_CONTEXT_RESERVE_VERSION = 1;
export const COUNCIL_CONTEXT_RESERVES = {
  initialBytes: 24000,
  critiqueBytes: 28000,
  steelmanBytes: 22000,
  adversaryBytes: 22000,
  chairBytes: 32000,
  schemaBytes: 16000
};

export function estimatedPromptTokens(input: CouncilInputSnapshotV1 | undefined): number {
  const chars = (input?.text.length ?? 0) + Object.values(COUNCIL_CONTEXT_RESERVES).reduce((a, b) => a + b, 0);
  return Math.ceil(Math.ceil(chars / 3) * 1.2);
}

export function routeFitsInput(route: CouncilRoute, input: CouncilInputSnapshotV1 | undefined): boolean {
  if (!route.limits.contextWindow) return true;
  return estimatedPromptTokens(input) <= route.limits.contextWindow * 0.85;
}
