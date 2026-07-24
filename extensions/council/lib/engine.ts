import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CouncilAdversaryOutputV1,
  CouncilCritiqueOutputV1,
  CouncilEvidenceLedgerV1,
  CouncilExecutionIdentityV1,
  CouncilFinalReportV1,
  CouncilInputSnapshotV1,
  CouncilMvpLanePlanV1,
  CouncilPositionGroupReportV1,
  CouncilReportStrategy,
  CouncilRosterConfigV1,
  CouncilRosterEntryV1,
  CouncilRoute,
  CouncilSteelmanOutputV1,
  CouncilTerminalReportV1,
  CouncilPositionCatalogV1
} from "./types.js";
import { validateRoster } from "./validate-roster.js";
import { invokeProvider, type ProviderInvocationCapture } from "./executors/provider-invoke.js";
import { extractModelJson, validateModelJsonValue } from "./validate-json.js";
import { buildRunPlan } from "./run-intent.js";
import { sha256, stableJson } from "./util.js";
import { renderCouncilMarkdown, renderTerminalMarkdown, validateFinalReport, writeReport } from "./report.js";
import { derivePositionCatalog } from "./position-catalog.js";
import { phaseSelectionWasFallback, selectPhaseEntries } from "./phase-selection.js";
import { rosterHash } from "./config.js";
import { executePhaseLanePlan } from "./scheduler.js";

interface Voice {
  member_id: string;
  role: string;
  position_key: string;
  recommendation: string;
  evidence: Array<{ claim: string; source_type: string; locator: string }>;
  assumptions: Array<{ assumption_key?: string; statement: string; load_bearing?: boolean; if_false_then?: string; how_to_verify?: string }>;
  risks: string[];
  what_would_change_my_view: string[];
  next_action: string;
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

interface AssumptionReview {
  assumptionId: string;
  status: "verified_by_cited_evidence" | "contradicted" | "unverified" | "not_evaluated";
  rationale: string;
  evidenceIds: string[];
}

interface SynthesisBrief {
  positionCatalog: CouncilPositionCatalogV1;
  groupedPositions: Array<{ positionId: string; supporterMemberIds: string[]; groundedEvidenceIds: string[]; assumptionIds: string[] }>;
  evidenceLedger: CouncilEvidenceLedgerV1;
  assumptionCatalog: AssumptionRecord[];
  critique: CouncilCritiqueOutputV1[];
  steelman: CouncilSteelmanOutputV1[];
}

type LaterPhase = "critique" | "steelman" | "adversary";
type CriticalPhase = "initial_analysis" | LaterPhase | "chair";
type PhaseOutput = CouncilCritiqueOutputV1 | CouncilSteelmanOutputV1 | CouncilAdversaryOutputV1;

interface RoleTemplates {
  initial: string;
  critique: string;
  steelman: string;
  adversary: string;
  chair: string;
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
  captureProviderInvocation?: (capture: ProviderInvocationCapture) => void;
}

function lineNumbered(input: CouncilInputSnapshotV1): string {
  return input.text.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n");
}

function loadRoleTemplates(packageRoot: string): RoleTemplates {
  return Object.fromEntries(
    (["initial", "critique", "steelman", "adversary", "chair"] as const).map((name) => [
      name,
      readFileSync(join(packageRoot, "roles/council", `${name}.md`), "utf8").trim()
    ])
  ) as unknown as RoleTemplates;
}

function voicePrompt(input: CouncilInputSnapshotV1, catalogBytes: string, entryId: string, role: string, template: string): string {
  const locator = input.kind === "plan" ? "plan.md:Lx-Ly" : "issue:Lx-Ly";
  return `You are council member ${entryId} with role ${role}.
Role rubric: ${template}
Review the immutable ${input.kind} independently. Cite evidence only as ${locator}.
When the input has at least three lines, provide at least three evidence items using the narrowest valid locators.
Choose position_key from ${catalogBytes}, or other:<lowercase-slug>.
Return only JSON matching the schema. Council completion does not authorize implementation.

${input.displayName}:
${lineNumbered(input)}`;
}

function phasePrompt(
  phase: "critique" | "steelman" | "adversary" | "chair",
  input: CouncilInputSnapshotV1,
  entry: CouncilRosterEntryV1,
  contextBytes: string,
  template: string
): string {
  return `You are explicit council member ${entry.id} with role ${entry.role}.
Role rubric: ${template}
Perform the ${phase} phase without tools or hidden context. Use only ids in the frozen context.
Return only JSON matching the supplied schema. Council completion does not authorize implementation.

Immutable ${input.displayName}:
${lineNumbered(input)}

Frozen context:
${contextBytes}`;
}

function phaseLaneDiagnostic(
  plan: CouncilMvpLanePlanV1,
  entries: CouncilRosterEntryV1[],
  routeMap: Map<string, CouncilRoute>
): string {
  const entryIds = new Set(entries.map((entry) => entry.id));
  const activeBatches = plan.executionBatches
    .map((batch) => batch.filter((entryId) => entryIds.has(entryId)))
    .filter((batch) => batch.length > 0);
  const plannedWidths = new Map(plan.providerInvokeLanes.map((lane) => [lane.laneKey, lane.maxConcurrency]));
  const lanes = new Map<string, { width: number; members: number }>();
  for (const entry of entries) {
    const route = routeMap.get(entry.route.routeId);
    const laneKey = route?.executionLaneKey ?? `provider-invoke:${entry.route.provider}:unknown`;
    const lane = lanes.get(laneKey);
    lanes.set(laneKey, {
      width: plannedWidths.get(laneKey) ?? lane?.width ?? 1,
      members: (lane?.members ?? 0) + 1
    });
  }
  const laneDetails = [...lanes.entries()]
    .map(([key, lane]) => `${key}(width=${lane.width},members=${lane.members})`)
    .join(",");
  const effectiveConcurrency = Math.max(0, ...activeBatches.map((batch) => batch.length));
  return `phase_lane_plan: ${plan.phase} concurrency=${effectiveConcurrency} batches=${activeBatches.length} lanes=[${laneDetails}]`;
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

function executionIdentity(route: CouncilRoute, resolvedModel?: string): CouncilExecutionIdentityV1 {
  if (resolvedModel) {
    return {
      routeId: route.ref.routeId,
      configuredModel: route.ref.model,
      resolvedModel,
      modelResolutionSource: "provider_envelope"
    };
  }
  if (route.ref.model !== "adapter-default") {
    return {
      routeId: route.ref.routeId,
      configuredModel: route.ref.model,
      resolvedModel: route.ref.model,
      modelResolutionSource: "explicit_route"
    };
  }
  return {
    routeId: route.ref.routeId,
    configuredModel: route.ref.model,
    resolvedModel: "unknown",
    modelResolutionSource: "adapter_default_unreported"
  };
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
  normalize?: (value: unknown) => unknown,
  onEnvelope?: (identity: CouncilExecutionIdentityV1) => void
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
    const result = await invokeProvider(
      opts.packageRoot,
      route,
      entry,
      attemptPrompt,
      schemaPath,
      remaining,
      opts.env,
      opts.signal,
      opts.captureProviderInvocation
    );
    onEnvelope?.(executionIdentity(route, result.model));
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
    const assumptionId = object.assumptionId;
    if (assumptionIds && typeof assumptionId === "string" && !assumptionIds.has(assumptionId)) return "unknown assumption id";
    const positionId = object.canonicalPositionId;
    if (positionIds && typeof positionId === "string" && !positionIds.has(positionId)) return "unknown position id";
    for (const child of Object.values(object)) {
      const error = visit(child);
      if (error) return error;
    }
    return undefined;
  };
  return visit(value);
}

function chairGroundingError(
  value: unknown,
  ledger: CouncilEvidenceLedgerV1,
  positionIds: ReadonlySet<string>
): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "chair output is not an object";
  const report = value as Partial<CouncilFinalReportV1>;
  const allowedEvidence = new Set(
    ledger.items
      .filter((item) => item.grounded)
      .map((item) => `${item.claim} (${item.locator})`)
  );
  if (
    !Array.isArray(report.evidence_summary)
    || (allowedEvidence.size > 0 && report.evidence_summary.length === 0)
    || report.evidence_summary.some((item) => !allowedEvidence.has(item))
  ) {
    return "chair evidence_summary contains evidence outside the frozen grounded ledger";
  }
  const serialized = stableJson(value);
  const ledgerIds = new Set(ledger.items.map((item) => item.id));
  const citedEvidenceIds = serialized.match(/\bev_[a-z0-9_:-]+\b/g) ?? [];
  if (citedEvidenceIds.some((id) => !ledgerIds.has(id))) return "chair output contains an unknown evidence id";
  const positionReferences = serialized.match(/\b(?:accept_plan|revise_plan|reject_plan|needs_more_evidence|issue_option_\d+|propose_alternative|defer_for_evidence|other:[a-z0-9-]+)\b/g) ?? [];
  if (positionReferences.some((id) => !positionIds.has(id))) return "chair output contains an unknown position id";
  return undefined;
}

function critiqueCoverageError(value: unknown, assumptionIds: ReadonlySet<string>): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "critique output is not an object";
  const reviews = (value as { assumptionReviews?: unknown }).assumptionReviews;
  if (!Array.isArray(reviews)) return "critique output is missing assumptionReviews";
  const reviewed = reviews.map((review) =>
    review && typeof review === "object" && !Array.isArray(review)
      ? (review as { assumptionId?: unknown }).assumptionId
      : undefined
  );
  if (reviewed.some((id) => typeof id !== "string")) return "critique output contains an invalid assumption id";
  const reviewedIds = new Set(reviewed as string[]);
  if (reviewedIds.size !== reviewed.length) return "critique output contains duplicate assumption reviews";
  const missing = [...assumptionIds].filter((id) => !reviewedIds.has(id));
  return missing.length > 0 ? `critique output is missing assumption reviews: ${missing.join(",")}` : undefined;
}

function phaseMembers(
  phase: LaterPhase,
  roster: CouncilRosterConfigV1,
  voices: Voice[],
  strategy: CouncilReportStrategy,
  diagnostics: string[]
): CouncilRosterEntryV1[] {
  const voiceIds = new Set(voices.map((voice) => voice.member_id));
  const positionByMember = new Map(voices.map((voice) => [voice.member_id, voice.position_key]));
  const selected = selectPhaseEntries(phase, roster, strategy, voiceIds, positionByMember);
  if (selected.length === 0) diagnostics.push(`${phase} degraded: no selectable non-chair survivor`);
  else if (phaseSelectionWasFallback(phase, selected)) diagnostics.push(`${phase} fallback: ${selected.map((entry) => entry.id).join(",")}`);
  return selected;
}

function phaseFindings(
  critique: CouncilCritiqueOutputV1[],
  steelman: CouncilSteelmanOutputV1[],
  adversary: CouncilAdversaryOutputV1[]
): CouncilFinalReportV1["phase_findings"] {
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
  critique: CouncilCritiqueOutputV1[],
  steelman: CouncilSteelmanOutputV1[]
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

function assumptionVerified(assumption: AssumptionRecord, critique: CouncilCritiqueOutputV1[], groundedIds: Set<string>): boolean {
  const reviews = critique.flatMap((output) => (output.assumptionReviews ?? []) as AssumptionReview[]).filter((review) => review.assumptionId === assumption.id);
  return reviews.some((review) =>
    review.status === "verified_by_cited_evidence"
    && review.evidenceIds.length > 0
    && review.evidenceIds.every((id) => groundedIds.has(id))
  ) && reviews.every((review) => review.status === "verified_by_cited_evidence");
}

function positionGroups(
  brief: SynthesisBrief,
  adversary: CouncilAdversaryOutputV1[],
  allMemberIds: string[]
): CouncilPositionGroupReportV1[] {
  return brief.groupedPositions.map((group) => ({
    canonicalPositionId: group.positionId,
    supporterMemberIds: group.supporterMemberIds,
    evidenceIds: group.groundedEvidenceIds,
    assumptionIds: group.assumptionIds,
    steelmans: brief.steelman.flatMap((output) => output.steelmans.filter((item) => item.canonicalPositionId === group.positionId)),
    objections: adversary.flatMap((output) => output.objections.filter((item) => item.canonicalPositionId === group.positionId)),
    oppositionMemberIds: allMemberIds.filter((memberId) => !group.supporterMemberIds.includes(memberId))
  }));
}

function capReadiness(report: CouncilFinalReportV1, ceiling: "conditional" | "not_ready"): CouncilFinalReportV1 {
  const rank = { not_ready: 0, conditional: 1, ready: 2 } as const;
  return rank[report.decision_readiness] > rank[ceiling]
    ? { ...report, decision_readiness: ceiling }
    : report;
}

function synthesize(
  input: CouncilInputSnapshotV1,
  roster: CouncilRosterConfigV1,
  routes: CouncilRoute[],
  voices: Voice[],
  strategy: CouncilReportStrategy,
  brief: SynthesisBrief,
  adversary: CouncilAdversaryOutputV1[],
  degradedPhases: ReadonlySet<CriticalPhase>,
  diagnostics: string[]
): CouncilFinalReportV1 {
  const positions = new Map(brief.groupedPositions.map((group) => [group.positionId, group.supporterMemberIds.map((id) => voices.find((voice) => voice.member_id === id)).filter(Boolean) as Voice[]]));
  const sorted = [...positions.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const [winner, supporters] = sorted[0] ?? ["defer_for_evidence", [] as Voice[]];
  const catchAll = new Set(["propose_alternative", "defer_for_evidence", "needs_more_evidence"]);
  const routeIds = new Set(voices.map((voice) => roster.entries.find((entry) => entry.id === voice.member_id)?.route.routeId));
  const sameRoute = routeIds.size === 1;
  const runtimeRoutes = new Map(routes.map((route) => [route.ref.routeId, route]));
  const laneKeys = new Set(voices.map((voice) => {
    const entry = roster.entries.find((candidate) => candidate.id === voice.member_id);
    if (!entry) return undefined;
    return runtimeRoutes.get(entry.route.routeId)?.executionLaneKey ?? entry.route.routeId;
  }));
  const sameLane = laneKeys.size === 1;
  if (sameRoute) diagnostics.push("route_correlation: single_route; readiness capped at conditional");
  else if (sameLane) diagnostics.push("route_correlation: single_lane; readiness capped at conditional");
  const groundedEvidence = brief.evidenceLedger.items.filter((item) => item.grounded);
  const hasWinner = supporters.length >= 2 && !catchAll.has(winner) && (supporters.length > voices.length / 2 || supporters.length > (sorted[1]?.[1].length ?? 0));
  const noRecommendation = strategy.kind === "structured_disagreement" || !hasWinner || groundedEvidence.length === 0;
  const recommendation = noRecommendation
    ? "No deterministic recommendation; see structured disagreement"
    : `${winner}: ${supporters[0]?.recommendation ?? "supported by council voices"}`;
  const dissent = sorted.find(([key]) => key !== winner)?.[1]?.[0];
  const findings = phaseFindings(brief.critique, brief.steelman, adversary);
  const phasesClean = degradedPhases.size === 0;
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
    : sameRoute || sameLane || !phasesClean || unresolvedWinningAssumptions.length > 0 || materialDissent
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
    position_groups: positionGroups(brief, adversary, voices.map((voice) => voice.member_id)),
    next_action: readiness === "ready"
      ? supporters[0]?.next_action ?? supporters[0]?.recommendation ?? "Proceed with the winning position."
      : unresolvedWinningAssumptions[0]?.howToVerify
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
    position_groups: [],
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
  const runId = `council_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${sha256(opts.input.sha256).slice(0, 8)}_${randomBytes(5).toString("hex")}`;
  const controller = new AbortController();
  let phase = "initial_analysis";
  const externalAbort = () => controller.abort(opts.signal?.reason ?? "canceled");
  if (opts.signal?.aborted) externalAbort();
  else opts.signal?.addEventListener("abort", externalAbort, { once: true });
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const runOpts = { ...opts, signal: controller.signal };
  const routeMap = new Map(opts.routes.map((route) => [route.ref.routeId, route]));
  const voiceSchemaPath = join(opts.packageRoot, "schemas/council-voice.json");
  const voices: Voice[] = [];
  const failedMembers: string[] = [];
  const initialPromptHashes: Array<{ memberId: string; promptSha256: string; positionCatalogSha256: string }> = [];
  const critiquePromptHashes: Array<{ memberId: string; promptSha256: string; assumptionCatalogSha256: string }> = [];
  const executionIdentities = new Map<string, CouncilExecutionIdentityV1>();
  const recordExecutionIdentity = (identity: CouncilExecutionIdentityV1) => {
    executionIdentities.set(identity.routeId, identity);
  };
  try {
    if (controller.signal.aborted) throw new RunAbortedError(String(controller.signal.reason ?? "canceled"));
    const positionCatalog = derivePositionCatalog(opts.input);
    const positionCatalogBytes = stableJson(positionCatalog);
    const positionCatalogSha256 = sha256(positionCatalogBytes);
    const roleTemplates = loadRoleTemplates(opts.packageRoot);
    const plan = buildRunPlan(opts.input, roster, opts.routes, strategy);
    deadlineTimer = setTimeout(() => controller.abort("deadline_exceeded"), plan.worstCaseDeadlineMs);
    const plannedPhase = (name: CouncilMvpLanePlanV1["phase"]): CouncilMvpLanePlanV1 => {
      const phasePlan = plan.phasePlans.find((candidate) => candidate.phase === name);
      if (!phasePlan) throw new Error(`run plan missing phase: ${name}`);
      return phasePlan;
    };
    const initialEntries = selectPhaseEntries("initial_analysis", roster, strategy)
      .filter((item) => validation.executableEntryIds.includes(item.id));
    const initialPrompts = new Map(initialEntries.map((entry) => {
      const prompt = voicePrompt(opts.input, positionCatalogBytes, entry.id, entry.role, roleTemplates.initial);
      initialPromptHashes.push({ memberId: entry.id, promptSha256: sha256(prompt), positionCatalogSha256 });
      return [entry.id, prompt];
    }));
    for (const prompt of initialPromptHashes) {
      diagnostics.push(`initial_prompt_hash: ${prompt.memberId}=${prompt.promptSha256} position_catalog=${prompt.positionCatalogSha256}`);
    }
    const initialLanePlan = plannedPhase("initial_analysis");
    diagnostics.push(phaseLaneDiagnostic(initialLanePlan, initialEntries, routeMap));
    const initialResults = await executePhaseLanePlan(initialLanePlan, initialEntries, async (entry) => {
      const memberDiagnostics: string[] = [];
      const route = routeMap.get(entry.route.routeId);
      if (!route) return { value: undefined, diagnostics: [`initial_analysis degraded for ${entry.id}: route unavailable`] };
      const value = await invokeStructured(
        runOpts,
        route,
        entry,
        initialPrompts.get(entry.id) as string,
        voiceSchemaPath,
        initialLanePlan.memberTimeoutMs,
        memberDiagnostics,
        (candidate) => {
          const voice = candidate as Voice;
          if (voice.member_id !== entry.id || voice.role !== entry.role) return "voice identity does not match roster entry";
          if (canonicalPosition(opts.input, positionCatalog, voice.position_key) !== voice.position_key) return "position_key is outside the frozen catalog";
          return undefined;
        },
        undefined,
        recordExecutionIdentity
      );
      return { value, diagnostics: memberDiagnostics };
    });
    for (const { entry, value: result } of initialResults) {
      diagnostics.push(...result.diagnostics);
      if (result.value) voices.push(result.value as Voice);
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
      const assumptionReviewCatalogBytes = stableJson(assumptions);
      const assumptionCatalogSha256 = sha256(assumptionReviewCatalogBytes);
      const initialContext = { positionCatalog, voices, evidenceLedger: ledger, assumptionReviewCatalog: assumptions, positionIds: [...positionIds] };
      const degradedPhases = new Set<CriticalPhase>();
      if (failedMembers.length > 0) degradedPhases.add("initial_analysis");
      const runPhase = async <T extends PhaseOutput>(phaseName: LaterPhase, context: unknown): Promise<T[]> => {
        phase = phaseName;
        const schemaPath = join(opts.packageRoot, `schemas/council-${phaseName}.json`);
        const outputs: T[] = [];
        const selected = phaseMembers(phaseName, roster, voices, strategy, diagnostics);
        if (selected.length === 0) degradedPhases.add(phaseName);
        const lanePlan = plannedPhase(phaseName);
        const contextBytes = stableJson(context);
        const prompts = new Map(selected.map((entry) => {
          const prompt = phasePrompt(phaseName, opts.input, entry, contextBytes, roleTemplates[phaseName]);
          if (phaseName === "critique") {
            const provenance = { memberId: entry.id, promptSha256: sha256(prompt), assumptionCatalogSha256 };
            critiquePromptHashes.push(provenance);
            diagnostics.push(`critique_prompt_hash: ${entry.id}=${provenance.promptSha256} assumption_catalog=${assumptionCatalogSha256}`);
          }
          return [entry.id, prompt];
        }));
        diagnostics.push(phaseLaneDiagnostic(lanePlan, selected, routeMap));
        const results = await executePhaseLanePlan(lanePlan, selected, async (entry) => {
          const memberDiagnostics: string[] = [];
          const route = routeMap.get(entry.route.routeId);
          if (!route) {
            return { value: undefined, diagnostics: [`${phaseName} degraded for ${entry.id}: route unavailable`] };
          }
          const value = await invokeStructured(
            runOpts,
            route,
            entry,
            prompts.get(entry.id) as string,
            schemaPath,
            lanePlan.memberTimeoutMs,
            memberDiagnostics,
            (candidate) => {
              const output = candidate as PhaseOutput;
              if (output.memberId !== entry.id) return "phase memberId does not match roster entry";
              const referenceError = evidenceReferenceError(
                candidate,
                ledgerIds,
                phaseName === "critique" ? assumptionIds : undefined,
                positionIds
              );
              if (referenceError) return referenceError;
              return phaseName === "critique" ? critiqueCoverageError(candidate, assumptionIds) : undefined;
            },
            undefined,
            recordExecutionIdentity
          );
          return { value, diagnostics: memberDiagnostics };
        });
        for (const { entry, value: result } of results) {
          diagnostics.push(...result.diagnostics);
          if (result.value) outputs.push(result.value as T);
          else {
            degradedPhases.add(phaseName);
            diagnostics.push(`${phaseName} degraded for ${entry.id}`);
          }
        }
        return outputs;
      };
      const critique = await runPhase<CouncilCritiqueOutputV1>("critique", initialContext);
      const steelman = await runPhase<CouncilSteelmanOutputV1>("steelman", { ...initialContext, critique });
      const brief = buildSynthesisBrief(opts.input, positionCatalog, voices, ledger, assumptions, critique, steelman);
      const adversary = await runPhase<CouncilAdversaryOutputV1>("adversary", brief);
      if (degradedPhases.size > 0 || failedMembers.length > 0) status = "degraded";
      report = synthesize(opts.input, roster, opts.routes, voices, strategy, brief, adversary, degradedPhases, diagnostics);
      if (strategy.kind === "chair") {
        phase = "chair";
        const chair = selectPhaseEntries("chair", roster, strategy, new Set(voices.map((voice) => voice.member_id)))[0];
        const route = chair ? routeMap.get(chair.route.routeId) : undefined;
        if (chair && route) {
          const chairLanePlan = plannedPhase("chair");
          diagnostics.push(phaseLaneDiagnostic(chairLanePlan, [chair], routeMap));
          const [{ value: chairResult }] = await executePhaseLanePlan(chairLanePlan, [chair], async (entry) => {
            const memberDiagnostics: string[] = [];
            const value = await invokeStructured(
              runOpts,
              route,
              entry,
              phasePrompt("chair", opts.input, entry, stableJson({ synthesisBrief: brief, adversary, deterministicBrief: report }), roleTemplates.chair),
              join(opts.packageRoot, "schemas/council-chair-report.json"),
              chairLanePlan.memberTimeoutMs,
              memberDiagnostics,
              (candidate) => chairGroundingError(candidate, ledger, positionIds),
              (candidate) => {
                if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
                const { implementation_authorized: ignored, ...rest } = candidate as Record<string, unknown>;
                if (ignored !== undefined) memberDiagnostics.push("implementation_authorized_forced_false");
                return rest;
              },
              recordExecutionIdentity
            );
            return { value, diagnostics: memberDiagnostics };
          });
          diagnostics.push(...chairResult.diagnostics);
          const draft = chairResult.value;
          if (draft) {
            const readinessRank = { not_ready: 0, conditional: 1, ready: 2 } as const;
            const draftReadiness = (draft as CouncilFinalReportV1).decision_readiness;
            const cappedReadiness = readinessRank[draftReadiness] < readinessRank[report.decision_readiness]
              ? draftReadiness
              : report.decision_readiness;
            report = {
              ...(draft as Omit<CouncilFinalReportV1, "implementation_authorized">),
              decision_readiness: cappedReadiness,
              phase_findings: phaseFindings(critique, steelman, adversary),
              position_groups: positionGroups(brief, adversary, voices.map((voice) => voice.member_id)),
              implementation_authorized: false
            };
          } else {
            degradedPhases.add("chair");
            status = "degraded";
            report = capReadiness(report, "conditional");
            diagnostics.push("chair synthesis degraded; deterministic fallback used");
          }
        } else {
          degradedPhases.add("chair");
          status = "degraded";
          report = capReadiness(report, "conditional");
          diagnostics.push("chair synthesis degraded; configured chair was unavailable");
        }
      }
    }

    for (const identity of executionIdentities.values()) {
      diagnostics.push(`resolved_model: ${identity.routeId}=${identity.resolvedModel} (${identity.modelResolutionSource})`);
    }
    diagnostics.push(`worst_case_provider_calls: ${plan.worstCaseProviderCallCount}`);
    validateFinalReport(report, join(opts.packageRoot, "schemas/council-report.json"));
    const effectiveStrategy = voices.length === 1 ? "single_survivor_mechanical" : strategy.kind;
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
      executionIdentities: [...executionIdentities.values()],
      initialPromptHashes,
      critiquePromptHashes,
      diagnostics
    });
    const reportPath = writeReport(opts.cwd, runId, markdown);
    return { ok: true, reportPath, report, diagnostics };
  } catch (error) {
    const unexpected = !(error instanceof RunAbortedError);
    if (unexpected) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`unexpected_failure: ${message}`);
    }
    const reason = controller.signal.aborted
      ? String(controller.signal.reason)
      : error instanceof RunAbortedError
        ? error.reason
        : "unexpected_failure";
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
    if (deadlineTimer) clearTimeout(deadlineTimer);
    opts.signal?.removeEventListener("abort", externalAbort);
  }
}
