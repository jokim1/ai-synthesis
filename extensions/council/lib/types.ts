export type CouncilEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type CouncilExecutorKind = "provider-invoke";
export type CouncilAuthPolicy = "default" | "subscription_only";
export type CouncilConfigScope = "user" | "project" | "explicit";
export type CouncilBillingKind = "subscription" | "api_key" | "oauth" | "unified_billing" | "local" | "unknown";

export interface CouncilInputSnapshotV1 {
  kind: "issue" | "plan";
  displayName: string;
  text: string;
  lineMap: Array<{ line: number; startOffset: number; endOffset: number }>;
  sha256: string;
  sourcePath?: string;
  originalFileMeta?: { dev?: number; ino?: number; size: number; mtimeMs: number; realpath: string };
  onDiskChangedAfterSnapshot?: boolean;
}

export interface CouncilRouteRef {
  executor: CouncilExecutorKind;
  provider: string;
  model: string;
  routeId: string;
}

export interface CouncilRoute {
  ref: CouncilRouteRef;
  displayName: string;
  family: string;
  providerDisplayName: string;
  supportedEfforts: CouncilEffort[];
  effortSupport: {
    source: "provider_invoke_help_cli_help_passthrough" | "provider_adapter_static" | "none";
    confidence: "wrapper_contract" | "static_adapter_contract" | "unavailable";
    verifiedBy: string[];
    warning?: string;
  };
  structuredOutput: {
    retryOwner: "adapter" | "engine";
    maxProviderCalls: 1 | 2;
    verifiedBy: string[];
  };
  auth: {
    configured: boolean;
    runnable: boolean;
    policy: CouncilAuthPolicy;
    source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command" | "oauth" | "subscription";
    billing: CouncilBillingKind;
    reason?: string;
  };
  cost: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    cacheReadPerMTok?: number;
    cacheWritePerMTok?: number;
    known: boolean;
  };
  limits: {
    contextWindow?: number;
    maxTokens?: number;
  };
}

export type CouncilRole =
  | "chair"
  | "architect"
  | "implementation-critic"
  | "risk-critic"
  | "evidence-auditor"
  | "steelman"
  | "product-operator"
  | "adversary";

export interface CouncilRosterEntryV1 {
  id: string;
  route: CouncilRouteRef;
  role: CouncilRole;
  effort: CouncilEffort;
  enabled: boolean;
}

export type CouncilReportStrategy =
  | { kind: "chair"; chairEntryId: string }
  | { kind: "deterministic" }
  | { kind: "structured_disagreement" };

export interface CouncilRosterConfigV1 {
  version: 1;
  updatedAt: string;
  scope: CouncilConfigScope;
  entries: CouncilRosterEntryV1[];
  reportStrategy: CouncilReportStrategy;
}

export interface CouncilConfigLocation {
  scope: CouncilConfigScope;
  path: string;
  source: "pi_user" | "pi_project" | "portable_user" | "portable_explicit";
  rememberedWriteTarget?: string;
  seededFrom?: "user" | "project" | "portable-global" | "recommendations";
  guardedState?: { kind: "present"; sha256: string } | { kind: "absent" };
}

export interface CouncilConfigRootsV1 {
  cwd: string;
  portableConfigHome?: string;
  piUserAgentDir?: string;
  piProjectConfigDir?: string;
  trustedProject: boolean;
}

export interface CouncilValidateRosterInputV1 {
  config: CouncilRosterConfigV1;
  routes: CouncilRoute[];
  mode: "pi_tui" | "portable_cli" | "engine_preflight";
  reportStrategyOverride?: CouncilReportStrategy;
  inputSnapshot?: CouncilInputSnapshotV1;
}

export interface CouncilRosterValidationResultV1 {
  ok: boolean;
  executableEntryIds: string[];
  unavailableEntryIds: string[];
  unsupportedEffortEntryIds: string[];
  blockingProblems: Array<{
    kind:
      | "duplicate_entry_id"
      | "unavailable_route"
      | "unsupported_effort"
      | "too_few_executable_members"
      | "missing_report_strategy"
      | "invalid_chair_strategy"
      | "input_context_overflow"
      | "stale_dogfood_roster_shape";
    entryId?: string;
    routeId?: string;
    message: string;
    suggestedRouteIds?: string[];
    suggestedEfforts?: CouncilEffort[];
  }>;
  compositionFeedback: Array<{ kind: "warning" | "suggestion"; message: string; entryIds?: string[] }>;
  reportStrategy: { ok: boolean; effective?: CouncilReportStrategy; source: "roster_file" | "cli" | "recommendation"; message?: string };
}

export interface CouncilRouteProbeEnvelopeV1 {
  version: 1;
  routes: CouncilRoute[];
  diagnostics: Array<{
    executor: CouncilExecutorKind;
    provider: string;
    status: "ok" | "unavailable" | "auth" | "error";
    message: string;
  }>;
}

export interface CouncilPositionCandidateV1 {
  id: string;
  label: string;
  source: "plan_review_default" | "issue_option" | "issue_default" | "engine_default";
  extractedText?: string;
}

export interface CouncilPositionCatalogV1 {
  version: 1;
  inputKind: "issue" | "plan";
  candidates: CouncilPositionCandidateV1[];
  otherPrefix: "other:";
}

export interface CouncilEvidenceLedgerV1 {
  version: 1;
  items: Array<{
    id: string;
    claim: string;
    sourceType: "plan_line" | "issue_text" | "repo_context" | "web" | "theory" | "prior_knowledge";
    locator: string;
    supportingMemberIds: string[];
    contradictingMemberIds: string[];
    grounded: boolean;
    groundingStatus: "engine_verified" | "engine_unverified";
    groundingReason: string;
  }>;
}

export type CouncilJsonValidationResult =
  | { ok: true; value: unknown; source: "whole" | "fence" | "scan" }
  | { ok: false; kind: "no_json" | "schema_invalid" | "validator_usage_error"; rawText: string; error: string };

export interface CouncilMvpLanePlanV1 {
  phase: "initial_analysis" | "critique" | "steelman" | "adversary" | "chair";
  memberTimeoutMs: number;
  maxConcurrencyGlobalCeiling: number;
  providerInvokeLanePolicy: "serial_same_account_by_default";
  providerInvokeLanes: Array<{ laneKey: string; memberCount: number; maxConcurrency: number; budgetMs: number }>;
  portableProviderInvokeMemberCount: number;
  phaseBudgetMs: number;
  effectiveConcurrency: number;
}

export interface CouncilMvpRunPlanV1 {
  version: 1;
  phasePlans: CouncilMvpLanePlanV1[];
  retryCostInputs: Array<{
    routeId: string;
    phase: CouncilMvpLanePlanV1["phase"];
    structuredQuestionCount: number;
    inputTokenCeiling: number;
    retryInstructionTokenOverhead: number;
    outputTokenCap: number | null;
    inputPricePerMTok: number | null;
    outputPricePerMTok: number | null;
    retryOwner: "adapter" | "engine";
    maxProviderCalls: 1 | 2;
    worstCaseProviderCalls: number;
    perAttemptCostCeilingUsd: number | null;
    questionCostUpperBoundUsd: number | null;
  }>;
  worstCaseProviderCallCount: number;
  retryAdjustedCostUpperBoundUsd: number | null;
  retryAdjustedCostKnown: boolean;
  expectedRunMs: number;
  worstCaseDeadlineMs: number;
}

export interface CouncilRunIntentV1 {
  version: 1;
  id: string;
  createdAt: string;
  expiresAt: string;
  inputSnapshot: CouncilInputSnapshotV1;
  rosterHash: string;
  routeCatalogHash: string;
  runPlan: CouncilMvpRunPlanV1;
  runPlanHash: string;
  retryAdjustedCostHash: string;
  estimatedCostBucket: string;
  acceptStaleInputSha?: string;
  ackLongRunToken?: string;
}

export interface CouncilRuntimeContractReport {
  ok: boolean;
  nodeVersion: string;
  packageRoot: string;
  loader: "jiti" | "compiled_js";
  providerInvokeAuthFlag: boolean;
  providerInvokeEffortFlag: boolean;
  providerProbeAuthFlag: boolean;
  piInstalled?: boolean;
  errors: string[];
}

export interface CouncilFinalReportV1 {
  recommendation: string;
  decision_readiness: "ready" | "conditional" | "not_ready";
  evidence_summary: string[];
  strongest_dissent: string;
  assumptions: string[];
  risks: string[];
  what_would_change_recommendation: string[];
  phase_findings: {
    critique: string[];
    steelman: string[];
    adversary: string[];
  };
  next_action: string;
  implementation_authorized: false;
}
