import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type {
  CouncilEvidenceLedgerV1,
  CouncilFinalReportV1,
  CouncilInputSnapshotV1,
  CouncilReportStrategy,
  CouncilRosterConfigV1,
  CouncilRosterEntryV1,
  CouncilRoute
} from "./types.js";
import { validateRoster } from "./validate-roster.js";
import { invokeProvider } from "./executors/provider-invoke.js";
import { extractModelJson, validateModelJsonValue } from "./validate-json.js";
import { buildRunPlan } from "./run-intent.js";
import { COUNCIL_EFFORT_ORDER } from "./effort.js";
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

interface AssumptionRecord {
  id: string;
  memberId: string;
  positionId: string;
  statement: string;
  loadBearing: boolean;
  howToVerify: string;
  evidenceIds: string[];
}

interface PhaseOutput {
  memberId: string;
  targetedChallenges?: unknown[];
  assumptionReviews?: unknown[];
  steelmans?: unknown[];
  objections?: unknown[];
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

function lineNumbered(input: CouncilInputSnapshotV1): string {
  return input.text.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n");
}

function voicePrompt(input: CouncilInputSnapshotV1, entryId: string, role: string): string {
  const locator = input.kind === "plan" ? "plan.md:Lx-Ly" : "issue:Lx-Ly";
  return `You are council member ${entryId} with role ${role}.
Review the immutable ${input.kind} independently. Cite evidence only as ${locator}.
Choose position_key from ${JSON.stringify(positionCatalog(input))}, or other:<lowercase-slug>.
Return only JSON matching the schema. Council completion does not authorize implementation.

${input.displayName}:
${lineNumbered(input)}`;
}

function phasePrompt(
  phase: "critique" | "steelman" | "adversary" | "chair",
  input: CouncilInputSnapshotV1,
  entry: CouncilRosterEntryV1,
  context: unknown
): string {
  return `You are explicit council member ${entry.id} with role ${entry.role}.
Perform the ${phase} phase without tools or hidden context. Use only ids in the frozen context.
Return only JSON matching the supplied schema. Council completion does not authorize implementation.

Immutable ${input.displayName}:
${lineNumbered(input)}

Frozen context:
${JSON.stringify(context)}`;
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

function poolEvidence(input: CouncilInputSnapshotV1, voices: Voice[]): CouncilEvidenceLedgerV1 {
  return {
    version: 1,
    items: voices.flatMap((voice) => voice.evidence.map((evidence, index) => {
      const isGrounded = grounded(input, evidence.source_type, evidence.locator);
      return {
        id: `ev_initial_${voice.member_id}_${index + 1}`,
        claim: evidence.claim,
        sourceType: evidence.source_type as CouncilEvidenceLedgerV1["items"][number]["sourceType"],
        locator: evidence.locator,
        supportingMemberIds: [voice.member_id],
        contradictingMemberIds: [],
        grounded: isGrounded,
        groundingStatus: isGrounded ? "engine_verified" as const : "engine_unverified" as const,
        groundingReason: isGrounded ? "locator resolves in frozen input" : "locator is not verifiable against frozen input"
      };
    }))
  };
}

function assumptionCatalog(input: CouncilInputSnapshotV1, voices: Voice[], ledger: CouncilEvidenceLedgerV1, diagnostics: string[]): AssumptionRecord[] {
  const records: AssumptionRecord[] = [];
  for (const voice of voices) {
    const used = new Map<string, number>();
    for (const assumption of voice.assumptions) {
      const derived = (assumption.assumption_key ?? assumption.statement.slice(0, 80))
        .toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "assumption";
      const occurrence = (used.get(derived) ?? 0) + 1;
      used.set(derived, occurrence);
      if (occurrence > 1) diagnostics.push(`assumption_key_collision: ${voice.member_id}:${derived}`);
      const key = occurrence === 1 ? derived : `${derived.slice(0, 61)}-${occurrence}`;
      records.push({
        id: `${voice.member_id}:${key}`,
        memberId: voice.member_id,
        positionId: canonicalPosition(input, voice.position_key),
        statement: assumption.statement,
        loadBearing: assumption.load_bearing === true,
        howToVerify: assumption.how_to_verify ?? "",
        evidenceIds: ledger.items.filter((item) => item.supportingMemberIds.includes(voice.member_id)).map((item) => item.id)
      });
    }
  }
  return records;
}

function extractValue(result: Awaited<ReturnType<typeof invokeProvider>>): unknown {
  if (result.structured !== undefined) return result.structured;
  const extracted = extractModelJson(result.text);
  return extracted.ok ? extracted.value : undefined;
}

async function invokeStructured(
  opts: RunCouncilOptions,
  route: CouncilRoute,
  entry: CouncilRosterEntryV1,
  prompt: string,
  schemaPath: string,
  timeoutMs: number,
  diagnostics: string[],
  extraValidate?: (value: unknown) => string | undefined,
  normalize?: (value: unknown) => unknown
): Promise<unknown | undefined> {
  const deadline = Date.now() + timeoutMs;
  const maxEngineAttempts = route.structuredOutput.retryOwner === "engine" ? route.structuredOutput.maxProviderCalls : 1;
  let attemptPrompt = prompt;
  for (let attempt = 1; attempt <= maxEngineAttempts; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      diagnostics.push(`retry_skipped_no_member_budget: ${entry.id}`);
      return undefined;
    }
    const result = await invokeProvider(opts.packageRoot, route, entry, attemptPrompt, schemaPath, remaining, opts.env);
    const providerCalls = result.attempts ?? 1;
    if (providerCalls > route.structuredOutput.maxProviderCalls) {
      diagnostics.push(`structured provider calls exceeded contract for ${entry.id}: ${providerCalls}`);
      return undefined;
    }
    if (!result.ok) {
      diagnostics.push(`provider call failed for ${entry.id}: ${result.status} ${result.error ?? ""}`.trim());
      return undefined;
    }
    const value = normalize ? normalize(extractValue(result)) : extractValue(result);
    const validated = validateModelJsonValue(schemaPath, value);
    const semanticError = validated.ok ? extraValidate?.(validated.value) : undefined;
    if (validated.ok && !semanticError) return validated.value;
    const error = validated.ok ? semanticError : validated.error;
    if (attempt === maxEngineAttempts) {
      diagnostics.push(`structured output invalid for ${entry.id}: ${error}`);
      return undefined;
    }
    diagnostics.push(`engine_json_retry: ${entry.id}`);
    attemptPrompt = `${prompt}

Your prior response was invalid: ${error}. Return only corrected JSON matching the schema.`;
  }
  return undefined;
}

function evidenceReferenceError(value: unknown, ledgerIds: Set<string>, assumptionIds?: Set<string>, positionIds?: Set<string>): string | undefined {
  const visit = (node: unknown): string | undefined => {
    if (Array.isArray(node)) {
      for (const item of node) {
        const error = visit(item);
        if (error) return error;
      }
      return undefined;
    }
    if (!node || typeof node !== "object") return undefined;
    const object = node as Record<string, unknown>;
    if (Array.isArray(object.evidenceIds) && object.evidenceIds.some((id) => typeof id !== "string" || !ledgerIds.has(id))) return "unknown evidenceIds reference";
    const assumptionId = object.assumptionId ?? object.assumption_id;
    if (assumptionIds && typeof assumptionId === "string" && !assumptionIds.has(assumptionId)) return "unknown assumption id";
    const positionId = object.canonicalPositionId ?? object.positionId ?? object.position_id;
    if (positionIds && typeof positionId === "string" && !positionIds.has(positionId)) return "unknown position id";
    for (const child of Object.values(object)) {
      const error = visit(child);
      if (error) return error;
    }
    return undefined;
  };
  return visit(value);
}

function effortRank(entry: CouncilRosterEntryV1): number {
  return COUNCIL_EFFORT_ORDER.indexOf(entry.effort);
}

function phaseMembers(
  phase: "critique" | "steelman" | "adversary",
  roster: CouncilRosterConfigV1,
  voices: Voice[],
  strategy: CouncilReportStrategy,
  diagnostics: string[]
): CouncilRosterEntryV1[] {
  const voiceIds = new Set(voices.map((voice) => voice.member_id));
  const chairId = strategy.kind === "chair" ? strategy.chairEntryId : undefined;
  const successful = roster.entries.filter((entry) => entry.enabled && voiceIds.has(entry.id));
  const nonChair = successful.filter((entry) => entry.id !== chairId);
  let selected: CouncilRosterEntryV1[] = [];
  if (phase === "critique") {
    selected = successful.filter((entry) => ["implementation-critic", "risk-critic", "evidence-auditor"].includes(entry.role));
    if (selected.length === 0) selected = [...nonChair].sort((a, b) => effortRank(b) - effortRank(a) || roster.entries.indexOf(a) - roster.entries.indexOf(b)).slice(0, 1);
  } else if (phase === "steelman") {
    selected = nonChair.filter((entry) => entry.role === "steelman");
    if (selected.length === 0) {
      const support = new Map<string, number>();
      for (const voice of voices) support.set(voice.position_key, (support.get(voice.position_key) ?? 0) + 1);
      selected = [...nonChair].sort((a, b) => {
        const aVoice = voices.find((voice) => voice.member_id === a.id);
        const bVoice = voices.find((voice) => voice.member_id === b.id);
        return (support.get(aVoice?.position_key ?? "") ?? 0) - (support.get(bVoice?.position_key ?? "") ?? 0)
          || effortRank(b) - effortRank(a)
          || roster.entries.indexOf(a) - roster.entries.indexOf(b);
      }).slice(0, 1);
    }
  } else {
    selected = successful.filter((entry) => entry.role === "adversary");
    if (selected.length === 0) selected = nonChair.filter((entry) => entry.role === "risk-critic").slice(0, 1);
    if (selected.length === 0) selected = [...nonChair].sort((a, b) => effortRank(b) - effortRank(a) || roster.entries.indexOf(a) - roster.entries.indexOf(b)).slice(0, 1);
  }
  if (selected.length === 0) diagnostics.push(`${phase} degraded: no selectable non-chair survivor`);
  else if (!selected.some((entry) =>
    phase === "critique" ? ["implementation-critic", "risk-critic", "evidence-auditor"].includes(entry.role) : entry.role === phase
  )) diagnostics.push(`${phase} fallback: ${selected.map((entry) => entry.id).join(",")}`);
  return selected;
}

function phaseFindings(critique: PhaseOutput[], steelman: PhaseOutput[], adversary: PhaseOutput[]): CouncilFinalReportV1["phase_findings"] {
  const render = (value: unknown): string => typeof value === "string" ? value : JSON.stringify(value);
  return {
    critique: critique.flatMap((output) => [...(output.targetedChallenges ?? []), ...(output.assumptionReviews ?? [])].map(render)),
    steelman: steelman.flatMap((output) => (output.steelmans ?? []).map(render)),
    adversary: adversary.flatMap((output) => (output.objections ?? []).map(render))
  };
}

function synthesize(
  input: CouncilInputSnapshotV1,
  roster: CouncilRosterConfigV1,
  voices: Voice[],
  strategy: CouncilReportStrategy,
  ledger: CouncilEvidenceLedgerV1,
  assumptionsCatalog: AssumptionRecord[],
  critique: PhaseOutput[],
  steelman: PhaseOutput[],
  adversary: PhaseOutput[],
  diagnostics: string[]
): CouncilFinalReportV1 {
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
  const groundedEvidence = ledger.items.filter((item) => item.grounded);
  const hasWinner = supporters.length >= 2 && !catchAll.has(winner) && (supporters.length > voices.length / 2 || supporters.length > (sorted[1]?.[1].length ?? 0));
  const noRecommendation = strategy.kind === "structured_disagreement" || !hasWinner || groundedEvidence.length === 0;
  const recommendation = noRecommendation
    ? "No deterministic recommendation; see structured disagreement"
    : `${winner}: ${supporters[0]?.recommendation ?? "supported by council voices"}`;
  const dissent = sorted.find(([key]) => key !== winner)?.[1]?.[0];
  const findings = phaseFindings(critique, steelman, adversary);
  const phasesClean = critique.length > 0 && steelman.length > 0 && adversary.length > 0;
  const loadBearing = assumptionsCatalog.filter((assumption) => assumption.loadBearing);
  const readiness = noRecommendation
    ? "not_ready"
    : sameRoute || !phasesClean || loadBearing.length > 0
      ? "conditional"
      : "ready";
  return {
    recommendation,
    decision_readiness: readiness,
    evidence_summary: groundedEvidence.slice(0, 8).map((item) => `${item.claim} (${item.locator})`),
    strongest_dissent: dissent ? `${dissent.member_id}: ${dissent.recommendation}` : findings.adversary[0] ?? "No distinct dissent was produced.",
    assumptions: assumptionsCatalog.slice(0, 8).map((assumption) => `${assumption.memberId}: ${assumption.statement}`),
    risks: [...voices.flatMap((voice) => voice.risks.map((risk) => `${voice.member_id}: ${risk}`)), ...findings.adversary].slice(0, 8),
    what_would_change_recommendation: [...voices.flatMap((voice) => voice.what_would_change_my_view), ...findings.critique].slice(0, 8),
    phase_findings: findings,
    next_action: assumptionsCatalog[0]?.howToVerify ? `Verify: ${assumptionsCatalog[0].howToVerify}` : "Gather more grounded evidence before implementation.",
    implementation_authorized: false
  };
}

function singleSurvivorReport(voice: Voice, failedMembers: string[]): CouncilFinalReportV1 {
  return {
    recommendation: `Single surviving voice only: ${voice.recommendation}`,
    decision_readiness: "not_ready",
    evidence_summary: voice.evidence.map((item) => `${item.claim} (${item.locator})`),
    strongest_dissent: "No valid council dissent was produced.",
    assumptions: voice.assumptions.map((item) => item.statement),
    risks: [...voice.risks, `Failed initial members: ${failedMembers.join(", ")}`],
    what_would_change_recommendation: voice.what_would_change_my_view,
    phase_findings: { critique: [], steelman: [], adversary: [] },
    next_action: "Restore a second executable voice and rerun the council.",
    implementation_authorized: false
  };
}

export async function runCouncil(opts: RunCouncilOptions): Promise<{ ok: boolean; reportPath?: string; report: CouncilFinalReportV1; diagnostics: string[] }> {
  const validation = validateRoster({ config: opts.roster, routes: opts.routes, mode: "engine_preflight", reportStrategyOverride: opts.reportStrategyOverride, inputSnapshot: opts.input });
  if (!validation.ok || !validation.reportStrategy.effective) {
    throw Object.assign(new Error(`roster validation failed: ${validation.blockingProblems.map((problem) => problem.message).join("; ")}`), { exitCode: 4 });
  }
  const roster = validation.reconciledConfig;
  const strategy = validation.reportStrategy.effective;
  const diagnostics = [...validation.reconciliationDiagnostics, ...validation.compositionFeedback.map((item) => item.message)];
  const routeMap = new Map(opts.routes.map((route) => [route.ref.routeId, route]));
  const voiceSchemaPath = join(opts.packageRoot, "schemas/council-voice.json");
  const voices: Voice[] = [];
  const failedMembers: string[] = [];
  for (const entry of roster.entries.filter((item) => validation.executableEntryIds.includes(item.id))) {
    const route = routeMap.get(entry.route.routeId);
    if (!route) continue;
    const value = await invokeStructured(
      opts,
      route,
      entry,
      voicePrompt(opts.input, entry.id, entry.role),
      voiceSchemaPath,
      300000,
      diagnostics,
      (candidate) => {
        const voice = candidate as Voice;
        if (voice.member_id !== entry.id || voice.role !== entry.role) return "voice identity does not match roster entry";
        if (canonicalPosition(opts.input, voice.position_key) !== voice.position_key) return "position_key is outside the frozen catalog";
        return undefined;
      }
    );
    if (value) voices.push(value as Voice);
    else failedMembers.push(entry.id);
  }

  let status: "complete" | "degraded" | "failed" = "complete";
  let report: CouncilFinalReportV1;
  if (voices.length === 0) {
    status = "failed";
    report = {
      recommendation: "No council output could be produced.",
      decision_readiness: "not_ready",
      evidence_summary: [],
      strongest_dissent: "No dissent was produced.",
      assumptions: [],
      risks: ["All initial council voices failed."],
      what_would_change_recommendation: ["Restore at least two executable provider routes."],
      phase_findings: { critique: [], steelman: [], adversary: [] },
      next_action: "Fix provider route availability and rerun council.",
      implementation_authorized: false
    };
  } else if (voices.length === 1) {
    status = "degraded";
    diagnostics.push("single_survivor_report: not a valid council recommendation");
    report = singleSurvivorReport(voices[0], failedMembers);
  } else {
    const ledger = poolEvidence(opts.input, voices);
    const assumptions = assumptionCatalog(opts.input, voices, ledger, diagnostics);
    const ledgerIds = new Set(ledger.items.map((item) => item.id));
    const assumptionIds = new Set(assumptions.map((assumption) => assumption.id));
    const positionIds = new Set(voices.map((voice) => canonicalPosition(opts.input, voice.position_key)));
    const commonContext = { voices, evidenceLedger: ledger, assumptionCatalog: assumptions, positionIds: [...positionIds] };
    const runPhase = async (phase: "critique" | "steelman" | "adversary"): Promise<PhaseOutput[]> => {
      const schemaPath = join(opts.packageRoot, `schemas/council-${phase}.json`);
      const outputs: PhaseOutput[] = [];
      for (const entry of phaseMembers(phase, roster, voices, strategy, diagnostics)) {
        const route = routeMap.get(entry.route.routeId);
        if (!route) continue;
        const value = await invokeStructured(
          opts,
          route,
          entry,
          phasePrompt(phase, opts.input, entry, commonContext),
          schemaPath,
          300000,
          diagnostics,
          (candidate) => {
            const output = candidate as PhaseOutput;
            if (output.memberId !== entry.id) return "phase memberId does not match roster entry";
            return evidenceReferenceError(candidate, ledgerIds, phase === "critique" ? assumptionIds : undefined, phase === "adversary" || phase === "steelman" ? positionIds : undefined);
          }
        );
        if (value) outputs.push(value as PhaseOutput);
        else diagnostics.push(`${phase} degraded for ${entry.id}`);
      }
      return outputs;
    };
    const critique = await runPhase("critique");
    const steelman = await runPhase("steelman");
    const adversary = await runPhase("adversary");
    if (critique.length === 0 || steelman.length === 0 || adversary.length === 0 || failedMembers.length > 0) status = "degraded";
    report = synthesize(opts.input, roster, voices, strategy, ledger, assumptions, critique, steelman, adversary, diagnostics);
    if (strategy.kind === "chair") {
      const chair = roster.entries.find((entry) => entry.id === strategy.chairEntryId);
      const route = chair ? routeMap.get(chair.route.routeId) : undefined;
      if (chair && route) {
        const draft = await invokeStructured(
          opts,
          route,
          chair,
          phasePrompt("chair", opts.input, chair, { ...commonContext, critique, steelman, adversary, deterministicBrief: report }),
          join(opts.packageRoot, "schemas/council-chair-report.json"),
          420000,
          diagnostics,
          undefined,
          (candidate) => {
            if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
            const { implementation_authorized: ignored, ...rest } = candidate as Record<string, unknown>;
            if (ignored !== undefined) diagnostics.push("implementation_authorized_forced_false");
            return rest;
          }
        );
        if (draft) {
          report = {
            ...(draft as Omit<CouncilFinalReportV1, "implementation_authorized">),
            decision_readiness: report.decision_readiness === "conditional" ? "conditional" : (draft as CouncilFinalReportV1).decision_readiness,
            phase_findings: phaseFindings(critique, steelman, adversary),
            implementation_authorized: false
          };
        } else {
          status = "degraded";
          diagnostics.push("chair synthesis degraded; deterministic fallback used");
        }
      }
    }
  }

  const plan = buildRunPlan(opts.input, roster, opts.routes);
  diagnostics.push(`worst_case_provider_calls: ${plan.worstCaseProviderCallCount}`);
  validateFinalReport(report);
  const effectiveStrategy = voices.length === 1 ? "single_survivor" : strategy.kind;
  const runId = `council_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${sha256(opts.input.sha256).slice(0, 8)}_${randomBytes(5).toString("hex")}`;
  const markdown = renderCouncilMarkdown({
    runId,
    input: opts.input,
    roster,
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
