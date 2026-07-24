import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CouncilExecutionIdentityV1, CouncilFinalReportV1, CouncilInputSnapshotV1, CouncilReportStrategy, CouncilRosterConfigV1, CouncilRoute, CouncilTerminalReportV1 } from "./types.js";
import { validateModelJsonValue } from "./validate-json.js";

export function validateFinalReport(report: CouncilFinalReportV1, schemaPath?: string): void {
  if (report.implementation_authorized !== false) throw new Error("implementation_authorized must be false");
  if (!Array.isArray(report.position_groups)) throw new Error("final report missing position_groups");
  for (const key of ["recommendation", "strongest_dissent", "next_action"] as const) {
    if (!report[key]) throw new Error(`final report missing ${key}`);
  }
  if (schemaPath) {
    const validated = validateModelJsonValue(schemaPath, report);
    if (!validated.ok) throw new Error(`final report schema validation failed: ${validated.error}`);
  }
}

export function renderTerminalMarkdown(report: CouncilTerminalReportV1): string {
  const frontmatter = [
    `id: ${JSON.stringify(report.run_id)}`,
    "mode: council",
    `input_sha256: ${JSON.stringify(report.input_sha256)}`,
    `status: ${report.status}`,
    `implementation_authorized: false`
  ].join("\n");
  return `---\n${frontmatter}\n---\n\n# Council Terminal Report\n\nCouncil completion does not authorize project implementation.\n\n## Status\n\n${report.status}\n\n## Phase\n\n${report.phase}\n\n## Reason\n\n${report.reason}\n\n## Diagnostics\n\n${report.member_diagnostics.map((item) => `- ${item}`).join("\n") || "- None."}\n`;
}

function yamlValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function renderCouncilMarkdown(opts: {
  runId: string;
  input: CouncilInputSnapshotV1;
  roster: CouncilRosterConfigV1;
  routes: CouncilRoute[];
  report: CouncilFinalReportV1;
  status: "complete" | "degraded" | "canceled" | "failed";
  configuredReportStrategy: CouncilReportStrategy;
  effectiveStrategy: "chair" | "deterministic" | "structured_disagreement" | "single_survivor";
  reportStrategySource: "cli" | "roster_file" | "recommendation";
  rememberedRosterWritten: boolean;
  executionIdentities: CouncilExecutionIdentityV1[];
  diagnostics: string[];
}): string {
  const enabled = opts.roster.entries.filter((entry) => entry.enabled);
  const routeMap = new Map(opts.routes.map((route) => [route.ref.routeId, route]));
  const providers = [...new Set(enabled.map((entry) => entry.route.provider))];
  const models = [...new Set(enabled.map((entry) => `${entry.route.provider}/${entry.route.model}`))];
  const families = [...new Set(enabled.map((entry) => routeMap.get(entry.route.routeId)?.family).filter(Boolean))];
  const chair = opts.configuredReportStrategy.kind === "chair" ? opts.configuredReportStrategy.chairEntryId : null;
  const frontmatter: Record<string, unknown> = {
    id: opts.runId,
    mode: "council",
    input_kind: opts.input.kind,
    input_locator: opts.input.sourcePath ?? null,
    input_sha256: opts.input.sha256,
    date: new Date().toISOString(),
    status: opts.status,
    roster_version: 1,
    config_scope: opts.roster.scope,
    report_strategy: opts.effectiveStrategy,
    report_strategy_effective: opts.effectiveStrategy,
    configured_report_strategy: opts.configuredReportStrategy.kind,
    report_strategy_source: opts.reportStrategySource,
    chair_entry_id: chair,
    members_total: opts.roster.entries.length,
    members_executed: enabled.length,
    providers,
    configured_models: models,
    resolved_models: opts.executionIdentities.map((identity) => `${identity.routeId}:${identity.resolvedModel}`),
    families,
    decision_readiness: opts.report.decision_readiness,
    readiness_basis: "internal_input_grounded",
    implementation_authorized: false,
    remembered_roster_written: opts.rememberedRosterWritten
  };
  const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${yamlValue(value)}`).join("\n");
  const groups = opts.report.position_groups.map((group) =>
    `### ${group.canonicalPositionId}\n\n- Supporters: ${group.supporterMemberIds.join(", ") || "None"}\n- Evidence: ${group.evidenceIds.join(", ") || "None"}\n- Assumptions: ${group.assumptionIds.join(", ") || "None"}\n- Steelmans: ${group.steelmans.map((item) => item.improvedCase).join("; ") || "None"}\n- Objections: ${group.objections.map((item) => item.objection).join("; ") || "None"}\n- Opposition: ${group.oppositionMemberIds.join(", ") || "None"}`
  ).join("\n\n");
  return `---\n${yaml}\n---\n\n# Council Report\n\nCouncil completion does not authorize project implementation.\n\n## Recommendation\n\n${opts.report.recommendation}\n\n## Decision Readiness\n\n${opts.report.decision_readiness}\n\nMVP readiness is internal-input grounded. Repo context and web claims were not independently verified.\n\n## Evidence\n\n${opts.report.evidence_summary.map((item) => `- ${item}`).join("\n") || "- No grounded evidence was produced."}\n\n## Strongest Dissent\n\n${opts.report.strongest_dissent}\n\n## Assumptions\n\n${opts.report.assumptions.map((item) => `- ${item}`).join("\n") || "- None recorded."}\n\n## Risks\n\n${opts.report.risks.map((item) => `- ${item}`).join("\n") || "- None recorded."}\n\n## What Would Change The Recommendation\n\n${opts.report.what_would_change_recommendation.map((item) => `- ${item}`).join("\n") || "- More grounded evidence."}\n\n## Position Groups\n\n${groups || "No grouped positions were produced."}\n\n## Phase Findings\n\n### Critique\n${opts.report.phase_findings.critique.map((item) => `- ${item}`).join("\n") || "- No critique output."}\n\n### Steelman\n${opts.report.phase_findings.steelman.map((item) => `- ${item}`).join("\n") || "- No steelman output."}\n\n### Adversary\n${opts.report.phase_findings.adversary.map((item) => `- ${item}`).join("\n") || "- No adversary output."}\n\n## Next Action\n\n${opts.report.next_action}\n\n## Diagnostics\n\n${opts.diagnostics.map((item) => `- ${item}`).join("\n") || "- None."}\n`;
}

export function writeReport(cwd: string, runId: string, markdown: string): string {
  const dir = join(cwd, ".ai-synthesis", "council-sessions");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${runId}.md`);
  if (existsSync(path)) throw new Error(`report already exists: ${path}`);
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, markdown, { mode: 0o600 });
  renameSync(tmp, path);
  return path;
}
