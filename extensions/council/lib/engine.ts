import { join } from "node:path";
import type { CouncilFinalReportV1, CouncilInputSnapshotV1, CouncilReportStrategy, CouncilRosterConfigV1, CouncilRoute } from "./types.js";
import { validateRoster } from "./validate-roster.js";
import { invokeProvider } from "./executors/provider-invoke.js";
import { extractModelJson, validateModelJsonValue } from "./validate-json.js";
import { buildRunPlan } from "./run-intent.js";
import { sha256 } from "./util.js";
import { renderCouncilMarkdown, validateFinalReport, writeReport } from "./report.js";

interface Voice {
  member_id: string;
  role: string;
  position_key: string;
  recommendation: string;
  evidence: Array<{ claim: string; source_type: string; locator: string }>;
  assumptions: Array<{ assumption_key?: string; statement: string; load_bearing?: boolean; if_false_then?: string; how_to_verify?: string }>;
  risks: string[];
  what_would_change_my_view: string[];
}

export interface RunCouncilOptions {
  cwd: string;
  packageRoot: string;
  input: CouncilInputSnapshotV1;
  roster: CouncilRosterConfigV1;
  routes: CouncilRoute[];
  reportStrategyOverride?: CouncilReportStrategy;
  reportStrategySource: "cli" | "roster_file" | "recommendation";
  rememberedRosterWritten: boolean;
  env?: NodeJS.ProcessEnv;
}

function voicePrompt(input: CouncilInputSnapshotV1, entryId: string, role: string): string {
  const locator = input.kind === "plan" ? "plan.md:Lx-Ly" : "issue:Lx-Ly";
  return `You are council member ${entryId} with role ${role}.\nReview the immutable ${input.kind} below. Cite evidence only as ${locator}.\nReturn only JSON matching the schema.\nCouncil completion does not authorize implementation.\n\n${input.displayName}:\n${input.text.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n")}`;
}

function positionCatalog(input: CouncilInputSnapshotV1): string[] {
  if (input.kind === "plan") return ["accept_plan", "revise_plan", "reject_plan", "needs_more_evidence"];
  return ["propose_alternative", "defer_for_evidence"];
}

function canonicalPosition(input: CouncilInputSnapshotV1, raw: string): string {
  if (positionCatalog(input).includes(raw) || /^other:[a-z0-9-]{1,64}$/.test(raw)) return raw;
  return input.kind === "plan" ? "needs_more_evidence" : "defer_for_evidence";
}

function grounded(input: CouncilInputSnapshotV1, sourceType: string, locator: string): boolean {
  const match = locator.match(input.kind === "plan" ? /^plan\.md:L(\d+)(?:-L(\d+))?$/ : /^issue:L(\d+)(?:-L(\d+))?$/);
  if (!match) return false;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return sourceType === (input.kind === "plan" ? "plan_line" : "issue_text") && start >= 1 && end <= input.lineMap.length && start <= end;
}

function synthesize(input: CouncilInputSnapshotV1, roster: CouncilRosterConfigV1, routes: CouncilRoute[], voices: Voice[], strategy: CouncilReportStrategy, diagnostics: string[]): CouncilFinalReportV1 {
  const positions = new Map<string, Voice[]>();
  for (const voice of voices) {
    const position = canonicalPosition(input, voice.position_key);
    positions.set(position, [...(positions.get(position) ?? []), voice]);
  }
  const sorted = [...positions.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const [winner, supporters] = sorted[0] ?? ["defer_for_evidence", [] as Voice[]];
  const catchAll = new Set(["propose_alternative", "defer_for_evidence", "needs_more_evidence"]);
  const routeIds = new Set(voices.map((voice) => roster.entries.find((entry) => entry.id === voice.member_id)?.route.routeId));
  const sameRoute = routeIds.size === 1;
  if (sameRoute) diagnostics.push("route_correlation: single_route; readiness capped at conditional");
  const groundedEvidence = voices.flatMap((voice) => voice.evidence.map((ev) => ({ voice, ev }))).filter(({ ev }) => grounded(input, ev.source_type, ev.locator));
  const hasWinner = supporters.length >= 2 && !catchAll.has(winner) && (supporters.length > voices.length / 2 || supporters.length > (sorted[1]?.[1].length ?? 0));
  const recommendation = strategy.kind === "structured_disagreement" || !hasWinner
    ? "No deterministic recommendation; see structured disagreement"
    : `${winner}: ${supporters[0]?.recommendation ?? "supported by council voices"}`;
  const dissent = sorted.find(([key]) => key !== winner)?.[1]?.[0];
  const assumptions = voices.flatMap((voice) => voice.assumptions.map((assumption) => `${voice.member_id}: ${assumption.statement}`)).slice(0, 8);
  const risks = voices.flatMap((voice) => voice.risks.map((risk) => `${voice.member_id}: ${risk}`)).slice(0, 8);
  const noRecommendation = recommendation.startsWith("No deterministic");
  return {
    recommendation,
    decision_readiness: noRecommendation || voices.length < 2 ? "not_ready" : sameRoute ? "conditional" : groundedEvidence.length > 0 ? "conditional" : "not_ready",
    evidence_summary: groundedEvidence.slice(0, 8).map(({ voice, ev }) => `${voice.member_id}: ${ev.claim} (${ev.locator})`),
    strongest_dissent: dissent ? `${dissent.member_id}: ${dissent.recommendation}` : "No distinct dissent was produced.",
    assumptions,
    risks,
    what_would_change_recommendation: voices.flatMap((voice) => voice.what_would_change_my_view).slice(0, 8),
    phase_findings: {
      critique: diagnostics.filter((item) => item.includes("critique") || item.includes("assumption")),
      steelman: diagnostics.filter((item) => item.includes("steelman")),
      adversary: diagnostics.filter((item) => item.includes("adversary") || item.includes("dissent"))
    },
    next_action: assumptions[0] ? `Verify: ${assumptions[0]}` : "Gather more grounded evidence before implementation.",
    implementation_authorized: false
  };
}

export async function runCouncil(opts: RunCouncilOptions): Promise<{ ok: boolean; reportPath?: string; report: CouncilFinalReportV1; diagnostics: string[] }> {
  const validation = validateRoster({ config: opts.roster, routes: opts.routes, mode: "engine_preflight", reportStrategyOverride: opts.reportStrategyOverride, inputSnapshot: opts.input });
  if (!validation.ok || !validation.reportStrategy.effective) {
    throw Object.assign(new Error(`roster validation failed: ${validation.blockingProblems.map((p) => p.message).join("; ")}`), { exitCode: 4 });
  }
  const diagnostics = validation.compositionFeedback.map((item) => item.message);
  const routeMap = new Map(opts.routes.map((route) => [route.ref.routeId, route]));
  const schemaPath = join(opts.packageRoot, "schemas/council-voice.json");
  const voices: Voice[] = [];
  for (const entry of opts.roster.entries.filter((entry) => validation.executableEntryIds.includes(entry.id))) {
    const route = routeMap.get(entry.route.routeId);
    if (!route) continue;
    const result = await invokeProvider(opts.packageRoot, route, entry, voicePrompt(opts.input, entry.id, entry.role), schemaPath, 300000, opts.env);
    const attempts = result.attempts ?? 1;
    if (attempts > 2) diagnostics.push(`structured provider calls exceeded contract for ${entry.id}: ${attempts}`);
    if (!result.ok) {
      diagnostics.push(`initial_analysis failed for ${entry.id}: ${result.status} ${result.error ?? ""}`.trim());
      continue;
    }
    const raw = result.structured ?? (extractModelJson(result.text).ok ? (extractModelJson(result.text) as { ok: true; value: unknown }).value : undefined);
    const validated = validateModelJsonValue(schemaPath, raw);
    if (!validated.ok) {
      diagnostics.push(`initial_analysis invalid JSON for ${entry.id}: ${validated.error}`);
      continue;
    }
    voices.push(validated.value as Voice);
  }
  let status: "complete" | "degraded" | "failed" = "complete";
  if (voices.length === 0) status = "failed";
  else if (voices.length < validation.executableEntryIds.length || voices.length === 1) status = "degraded";
  const plan = buildRunPlan(opts.input, opts.roster, opts.routes);
  diagnostics.push(`worst_case_provider_calls: ${plan.worstCaseProviderCallCount}`);
  if (voices.length === 1) diagnostics.push("single_survivor_report: not a valid council recommendation");
  const report = voices.length === 0
    ? {
        recommendation: "No council output could be produced.",
        decision_readiness: "not_ready" as const,
        evidence_summary: [],
        strongest_dissent: "No dissent was produced.",
        assumptions: [],
        risks: ["All initial council voices failed."],
        what_would_change_recommendation: ["Restore at least two executable provider routes."],
        phase_findings: { critique: [], steelman: [], adversary: [] },
        next_action: "Fix provider route availability and rerun council.",
        implementation_authorized: false as const
      }
    : synthesize(opts.input, opts.roster, opts.routes, voices, validation.reportStrategy.effective, diagnostics);
  validateFinalReport(report);
  const strategy = validation.reportStrategy.effective;
  const effectiveStrategy = voices.length === 1 ? "single_survivor" : strategy.kind;
  const runId = `council_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${sha256(opts.input.sha256).slice(0, 8)}`;
  const markdown = renderCouncilMarkdown({
    runId,
    input: opts.input,
    roster: opts.roster,
    routes: opts.routes,
    report,
    status,
    configuredReportStrategy: opts.roster.reportStrategy,
    effectiveStrategy,
    reportStrategySource: opts.reportStrategySource,
    rememberedRosterWritten: opts.rememberedRosterWritten,
    diagnostics
  });
  const reportPath = writeReport(opts.cwd, runId, markdown);
  return { ok: status !== "failed", reportPath, report, diagnostics };
}
