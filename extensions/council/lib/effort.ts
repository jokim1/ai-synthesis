import type { CouncilEffort } from "./types.js";

export const COUNCIL_EFFORT_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly CouncilEffort[];

export function isCouncilEffort(value: string): value is CouncilEffort {
  return (COUNCIL_EFFORT_ORDER as readonly string[]).includes(value);
}

export function nearestEffort(value: CouncilEffort | string, supported: CouncilEffort[]): CouncilEffort[] {
  if (supported.length === 0) return [];
  const target = COUNCIL_EFFORT_ORDER.indexOf(value as CouncilEffort);
  const targetIndex = target === -1 ? COUNCIL_EFFORT_ORDER.indexOf("medium") : target;
  return [...supported].sort((a, b) => {
    const da = Math.abs(COUNCIL_EFFORT_ORDER.indexOf(a) - targetIndex);
    const db = Math.abs(COUNCIL_EFFORT_ORDER.indexOf(b) - targetIndex);
    return da - db || COUNCIL_EFFORT_ORDER.indexOf(a) - COUNCIL_EFFORT_ORDER.indexOf(b);
  }).slice(0, 2);
}
