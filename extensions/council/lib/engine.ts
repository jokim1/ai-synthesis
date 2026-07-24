import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type {
  CouncilEvidenceLedgerV1,
  CouncilFinalReportV1,
  CouncilInputSnapshotV1,
  CouncilReportStrategy,
  CouncilRosterConfigV1,
  CouncilRosterEntryV1,
  CouncilRoute,
  CouncilTerminalReportV1,
  CouncilPositionCatalogV1
} from "./types.js";
import { validateRoster } from "./validate-roster.js";
import { invokeProvider } from "./executors/provider-invoke.js";
import { extractModelJson, validateModelJsonValue } from "./validate-json.js";
import { buildRunPlan } from "./run-intent.js";
import { sha256 } from "./util.js";
import { renderCouncilMarkdown, renderTerminalMarkdown, validateFinalReport, writeReport } from "./report.js";
import { derivePositionCatalog } from "./position-catalog.js";
import { phaseSelectionWasFallback, selectPhaseEntries } from "./phase-selection.js";
import { rosterHash } from "./config.js";

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

interface AssumptionReview {
  assumptionId: string;
  status: "verified_by_cited_evidence" | "contradicted" | "unverified";
  rationale: string;
  evidenceIds: string[];
}

interface SynthesisBrief {
  positionCatalog: CouncilPositionCatalogV1;
  groupedPositions: Array<{ positionId: string; supporterMemberIds: string[]; groundedEvidenceIds: string[]; assumptionIds: string[] }>;
  evidenceLedger: CouncilEvidenceLedgerV1;
  assumptionCatalog: AssumptionRecord[];
  critique: PhaseOutput[];
  steelman: PhaseOutput[];
}

class RunAbortedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
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
  signal?: AbortSignal;
}

function lineNumbered(input: CouncilInputSnapshotV1): string {
  return input.text.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n");
}

function voicePrompt(input: CouncilInputSnapshotV1, catalog: CouncilPositionCatalogV1, entryId: string, role: string): string {
  const locator = input.kind === "plan" ? "plan.md:Lx-Ly" : "issue:Lx-Ly";
  return `You are council member ${entryId} with role ${role}.
Review the immutable ${input.kind} independently. Cite evidence only as ${locator}.
Choose position_key from ${JSON.stringify(catalog)}, or other:<lowercase-slug>.
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

function canonicalPosition(input: CouncilInputSnapshotV1, catalog: CouncilPositionCatalogV1, raw: string): string {
  if (catalog.candidates.some((candidate) => candidate.id === raw) || /^other:[a-z0-9-]{1,64}$/.test(raw)) return raw;
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

function assumptionCatalog(input: CouncilInputSnapshotV1, catalog: CouncilPositionCatalogV1, voices: Voice[], ledger: CouncilEvidenceLedgerV1, diagnostics: string[]): AssumptionRecord[] {
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
        positionId: canonicalPosition(input, catalog, voice.position_key),
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
  let cumulativeProviderCalls = 0;
  for (let attempt = 1; attempt <= maxEngineAttempts; attempt += 1) {
    if (opts.signal?.aborted) throw new RunAbortedError(String(opts.signal.reason ?? "canceled"));
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      diagnostics.push(`retry_skipped_no_member_budget: ${entry.id}`);
      return undefined;
    }
    const result = await invokeProvider(opts.packageRoot, route, entry, attemptPrompt, schemaPath, remaining, opts.env, opts.signal);
    const providerCalls = result.attempts ?? 1;
    cumulativeProviderCalls += providerCalls;
    if (cumulativeProviderCalls > route.structuredOutput.maxProviderCalls) {
      diagnostics.push(`structured provider calls exceeded contract for ${entry.id}: ${cumulativeProviderCalls}`);
      return undefined;
    }
    if (!result.ok) {
      if (result.status === "canceled") throw new RunAbortedError(String(opts.signal?.reason ?? result.error ?? "canceled"));
      if (
        result.status === "malformed"
        && route.structuredOutput.retryOwner === "engine"
        && cumulativeProviderCalls < route.structuredOutput.maxProviderCalls
        && attempt < maxEngineAttempts
      ) {
        diagnostics.push(`engine_json_retry: ${entry.id}`);
        attemptPrompt = `${prompt}

Your prior response was malformed. Return only corrected JSON matching the schema.`;
        continue;
      }
      diagnostics.push(`provider call failed for ${entry.id}: ${result.status} ${result.error ?? ""}`.trim());
      return undefined;
    }
    const value = normalize ? normalize(extractValue(result)) : extractValue(result);
    const validated = validateModelJsonValue(schemaPath, value);
    const semanticError = validated.ok ? extraValidate?.(validated.value) : undefined;
    if (validated.ok && !semanticError) return validated.value;
    const error = validated.ok ? semanticError : validated.error;
    if (attempt === maxEngineAttempts || cumulativeProviderCalls >= route.structuredOutput.maxProviderCalls) {
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

function phaseMembers(
  phase: "critique" | "steelman" | "adversary",
  roster: CouncilRosterConfigV1,
  voices: Voice[],
  strategy: CouncilReportStrategy,
  diagnostics: string[]
): CouncilRosterEntryV1[] {
  const voiceIds = new Set(voices.map((voice) => voice.member_id));
  const selected = selectPhaseEntries(phase, roster, strategy, voiceIds);
  if (selected.length === 0) diagnostics.push(`${phase} degraded: no selectable non-chair survivor`);
  else if (phaseSelectionWasFallback(phase, selected)) diagnostics.push(`${phase} fallback: ${selected.map((entry) => entry.id).join(",")}`);
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

function buildSynthesisBrief(
  input: CouncilInputSnapshotV1,
  catalog: CouncilPositionCatalogV1,
  voices: Voice[],
  ledger: CouncilEvidenceLedgerV1,
  assumptions: AssumptionRecord[],
  critique: PhaseOutput[],
  steelman: PhaseOutput[]
): SynthesisBrief {
  const grouped = new Map<string, Voice[]>();
  for (const voice of voices) {
    const positionId = canonicalPosition(input, catalog, voice.position_key);
    grouped.set(positionId, [...(grouped.get(positionId) ?? []), voice]);
  }
  return Object.freeze({
    positionCatalog: catalog,
    groupedPositions: [...grouped.entries()].map(([positionId, supporters]) => ({
      positionId,
      supporterMemberIds: supporters.map((voice) => voice.member_id),
      groundedEvidenceIds: ledger.items.filter((item) => item.grounded && item.supportingMemberIds.some((memberId) => supporters.some((voice) => voice.member_id === memberId))).map((item) => item.id),
      assumptionIds: assumptions.filter((assumption) => assumption.positionId === positionId).map((assumption) => assumption.id)
    })),
    evidenceLedger: ledger,
    assumptionCatalog: assumptions,
    critique,
    steelman
  });
}

function assumptionVerified(assumption: AssumptionRecord, critique: PhaseOutput[], groundedIds: Set<string>): boolean {
  const reviews = critique.flatMap((output) => (output.assumptionReviews ?? []) as AssumptionReview[]).filter((review) => review.assumptionId === assumption.id);
  return reviews.some((review) =>
    review.status === "verified_by_cited_evidence"
    && review.evidenceIds.length > 0
    && review.evidenceIds.every((id) => groundedIds.has(id))
  ) && reviews.every((review) => review.status === "verified_by_cited_evidence");
}

function synthesize(
  input: CouncilInputSnapshotV1,
  roster: CouncilRosterConfigV1,
  voices: Voice[],
  strategy: CouncilReportStrategy,
  brief: SynthesisBrief,
  adversary: PhaseOutput[],
  diagnostics: string[]
): CouncilFinalReportV1 {
  const positions = new Map(brief.groupedPositions.map((group) => [group.positionId, group.supporterMemberIds.map((id) => voices.find((voice) => voice.member_id === id)).filter(Boolean) as Voice[]]));
  const sorted = [...positions.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const [winner, supporters] = sorted[0] ?? ["defer_for_evidence", [] as Voice[]];
  const catchAll = new Set(["propose_alternative", "defer_for_evidence", "needs_more_evidence"]);
  const routeIds = new Set(voices.map((voice) => roster.entries.find((entry) => entry.id === voice.member_id)?.route.routeId));
  const sameRoute = routeIds.size === 1;
  if (sameRoute) diagnostics.push("route_correlation: single_route; readiness capped at conditional");
  const groundedEvidence = brief.evidenceLedger.items.filter((item) => item.grounded);
  const hasWinner = supporters.length >= 2 && !catchAll.has(winner) && (supporters.length > voices.length / 2 || supporters.length > (sorted[1]?.[1].length ?? 0));
  const noRecommendation = strategy.kind === "structured_disagreement" || !hasWinner || groundedEvidence.length === 0;
  const recommendation = noRecommendation
    ? "No deterministic recommendation; see structured disagreement"
    : `${winner}: ${supporters[0]?.recommendation ?? "supported by council voices"}`;
  const dissent = sorted.find(([key]) => key !== winner)?.[1]?.[0];
  const findings = phaseFindings(brief.critique, brief.steelman, adversary);
  const phasesClean = brief.critique.length > 0 && brief.steelman.length > 0 && adversary.length > 0;
  const groundedIds = new Set(groundedEvidence.map((item) => item.id));
  const winningLoadBearing = brief.assumptionCatalog.filter((assumption) => assumption.positionId === winner && assumption.loadBearing);
  const unresolvedWinningAssumptions = winningLoadBearing.filter((assumption) => !assumptionVerified(assumption, brief.critique, groundedIds));
  const winningEvidenceCounts = supporters.map((voice) => groundedEvidence.filter((item) => item.supportingMemberIds.includes(voice.member_id)).length);
  const maxWinningEvidence = Math.max(0, ...winningEvidenceCounts);
  const materialDissent = unresolvedWinningAssumptions.length > 0 || sorted.slice(1).some(([, dissenters]) =>
    dissenters.length >= 2
    || Math.max(0, ...dissenters.map((voice) => groundedEvidence.filter((item) => item.supportingMemberIds.includes(voice.member_id)).length)) >= maxWinningEvidence
  );
  if (materialDissent) diagnostics.push("material_dissent: unresolved");
  const readiness = noRecommendation
    ? "not_ready"
    : sameRoute || !phasesClean || unresolvedWinningAssumptions.length > 0 || materialDissent
      ? "conditional"
      : "ready";
  return {
    recommendation,
    decision_readiness: readiness,
    evidence_summary: groundedEvidence.slice(0, 8).map((item) => `${item.claim} (${item.locator})`),
    strongest_dissent: dissent ? `${dissent.member_id}: ${dissent.recommendation}` : findings.adversary[0] ?? "No distinct dissent was produced.",
    assumptions: brief.assumptionCatalog.slice(0, 8).map((assumption) => `${assumption.memberId}: ${assumption.statement}`),
    risks: [...voices.flatMap((voice) => voice.risks.map((risk) => `${voice.member_id}: ${risk}`)), ...findings.adversary].slice(0, 8),
    what_would_change_recommendation: [...voices.flatMap((voice) => voice.what_would_change_my_view), ...findings.critique].slice(0, 8),
    phase_findings: findings,
    next_action: unresolvedWinningAssumptions[0]?.howToVerify
      ? `Verify: ${unresolvedWinningAssumptions[0].howToVerify}`
      : "Gather more grounded evidence before implementation.",
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

export async function runCouncil(opts: RunCouncilOptions): Promise<{
  ok: boolean;
  reportPath?: string;
  report?: CouncilFinalReportV1;
  terminalReport?: CouncilTerminalReportV1;
  diagnostics: string[];
}> {
  const validation = validateRoster({ config: opts.roster, routes: opts.routes, mode: "engine_preflight", reportStrategyOverride: opts.reportStrategyOverride, inputSnapshot: opts.input });
  if (!validation.ok || !validation.reportStrategy.effective) {
    throw Object.assign(new Error(`roster validation failed: ${validation.blockingProblems.map((problem) => problem.message).join("; ")}`), { exitCode: 4 });
  }
  const roster = validation.reconciledConfig;
  const strategy = validation.reportStrategy.effective;
  const diagnostics = [...validation.reconciliationDiagnostics, ...validation.compositionFeedback.map((item) => item.message)];
  const positionCatalog = derivePositionCatalog(opts.input);
  const plan = buildRunPlan(opts.input, roster, opts.routes, strategy);
  const runId = `council_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${sha256(opts.input.sha256).slice(0, 8)}_${randomBytes(5).toString("hex")}`;
  const controller = new AbortController();
  let phase = "initial_analysis";
  const externalAbort = () => controller.abort(opts.signal?.reason ?? "canceled");
  if (opts.signal?.aborted) externalAbort();
  else opts.signal?.addEventListener("abort", externalAbort, { once: true });
  const deadlineTimer = setTimeout(() => controller.abort("deadline_exceeded"), plan.worstCaseDeadlineMs);
  const runOpts = { ...opts, signal: controller.signal };
  const routeMap = new Map(opts.routes.map((route) => [route.ref.routeId, route]));
  const voiceSchemaPath = join(opts.packageRoot, "schemas/council-voice.json");
  const voices: Voice[] = [];
  const failedMembers: string[] = [];
  try {
    for (const entry of selectPhaseEntries("initial_analysis", roster, strategy).filter((item) => validation.executableEntryIds.includes(item.id))) {
      const route = routeMap.get(entry.route.routeId);
      if (!route) continue;
      const value = await invokeStructured(
        runOpts,
        route,
        entry,
        voicePrompt(opts.input, positionCatalog, entry.id, entry.role),
        voiceSchemaPath,
        300000,
        diagnostics,
        (candidate) => {
          const voice = candidate as Voice;
          if (voice.member_id !== entry.id || voice.role !== entry.role) return "voice identity does not match roster entry";
          if (canonicalPosition(opts.input, positionCatalog, voice.position_key) !== voice.position_key) return "position_key is outside the frozen catalog";
          return undefined;
        }
      );
      if (value) voices.push(value as Voice);
      else failedMembers.push(entry.id);
    }
    if (controller.signal.aborted) throw new RunAbortedError(String(controller.signal.reason));
    if (voices.length === 0) throw new RunAbortedError("all_initial_voices_failed");

    let status: "complete" | "degraded" = "complete";
    let report: CouncilFinalReportV1;
    if (voices.length === 1) {
      status = "degraded";
      diagnostics.push("single_survivor_report: not a valid council recommendation");
      report = singleSurvivorReport(voices[0], failedMembers);
    } else {
      const ledger = poolEvidence(opts.input, voices);
      const assumptions = assumptionCatalog(opts.input, positionCatalog, voices, ledger, diagnostics);
      const ledgerIds = new Set(ledger.items.map((item) => item.id));
      const assumptionIds = new Set(assumptions.map((assumption) => assumption.id));
      const positionIds = new Set(voices.map((voice) => canonicalPosition(opts.input, positionCatalog, voice.position_key)));
      const initialContext = { positionCatalog, voices, evidenceLedger: ledger, assumptionCatalog: assumptions, positionIds: [...positionIds] };
      const runPhase = async (phaseName: "critique" | "steelman" | "adversary", context: unknown): Promise<PhaseOutput[]> => {
        phase = phaseName;
        const schemaPath = join(opts.packageRoot, `schemas/council-${phaseName}.json`);
        const outputs: PhaseOutput[] = [];
        for (const entry of phaseMembers(phaseName, roster, voices, strategy, diagnostics)) {
          const route = routeMap.get(entry.route.routeId);
          if (!route) continue;
          const value = await invokeStructured(
            runOpts,
            route,
            entry,
            phasePrompt(phaseName, opts.input, entry, context),
            schemaPath,
            300000,
            diagnostics,
            (candidate) => {
              const output = candidate as PhaseOutput;
              if (output.memberId !== entry.id) return "phase memberId does not match roster entry";
              return evidenceReferenceError(candidate, ledgerIds, phaseName === "critique" ? assumptionIds : undefined, phaseName === "adversary" || phaseName === "steelman" ? positionIds : undefined);
            }
          );
          if (value) outputs.push(value as PhaseOutput);
          else diagnostics.push(`${phaseName} degraded for ${entry.id}`);
        }
        return outputs;
      };
      const critique = await runPhase("critique", initialContext);
      const steelman = await runPhase("steelman", { ...initialContext, critique });
      const brief = buildSynthesisBrief(opts.input, positionCatalog, voices, ledger, assumptions, critique, steelman);
      const adversary = await runPhase("adversary", brief);
      if (critique.length === 0 || steelman.length === 0 || adversary.length === 0 || failedMembers.length > 0) status = "degraded";
      report = synthesize(opts.input, roster, voices, strategy, brief, adversary, diagnostics);
      if (strategy.kind === "chair") {
        phase = "chair";
        const chair = selectPhaseEntries("chair", roster, strategy, new Set(voices.map((voice) => voice.member_id)))[0];
        const route = chair ? routeMap.get(chair.route.routeId) : undefined;
        if (chair && route) {
          const draft = await invokeStructured(
            runOpts,
            route,
            chair,
            phasePrompt("chair", opts.input, chair, { synthesisBrief: brief, adversary, deterministicBrief: report }),
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

    diagnostics.push(`worst_case_provider_calls: ${plan.worstCaseProviderCallCount}`);
    validateFinalReport(report);
    const effectiveStrategy = voices.length === 1 ? "single_survivor" : strategy.kind;
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
    return { ok: true, reportPath, report, diagnostics };
  } catch (error) {
    if (!(error instanceof RunAbortedError)) throw error;
    const reason = controller.signal.aborted ? String(controller.signal.reason) : error.reason;
    const terminalReport: CouncilTerminalReportV1 = {
      version: 1,
      status: reason === "canceled" ? "canceled" : "failed",
      run_id: runId,
      input_sha256: opts.input.sha256,
      roster_sha256: rosterHash(roster),
      phase,
      reason,
      member_diagnostics: diagnostics,
      implementation_authorized: false
    };
    const validated = validateModelJsonValue(join(opts.packageRoot, "schemas/council-terminal-report.json"), terminalReport);
    if (!validated.ok) throw new Error(`terminal report validation failed: ${validated.error}`);
    const reportPath = writeReport(opts.cwd, runId, renderTerminalMarkdown(terminalReport));
    return { ok: false, reportPath, terminalReport, diagnostics };
  } finally {
    clearTimeout(deadlineTimer);
    opts.signal?.removeEventListener("abort", externalAbort);
  }
}
