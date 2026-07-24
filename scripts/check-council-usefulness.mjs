#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = new URL("..", import.meta.url).pathname;
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const set = readJson("docs/public/council-usefulness-set.v1.json");
const scorecard = readJson("docs/public/council-usefulness-scorecard.v1.json");
const evidence = readJson(scorecard.evidenceFile);
const records = new Map(evidence.records.map((record) => [record.sampleId, record]));
const jiti = createJiti(import.meta.url);
const { runCouncil } = await jiti.import(join(root, "extensions/council/lib/engine.ts"));
const { invokeProvider } = await jiti.import(join(root, "extensions/council/lib/executors/provider-invoke.ts"));
const { issueSnapshot, lineMapFor } = await jiti.import(join(root, "extensions/council/lib/input.ts"));
const { providerInvokeRoute } = await jiti.import(join(root, "extensions/council/lib/routes.ts"));
const failures = [];
const route = providerInvokeRoute("claude", true);
const fakeInvoke = join(root, "tests/council/fakes/provider-invoke");
if (evidence.evaluationMode !== "no_cost_engine_fixture") failures.push("usefulness evidence must use the no-cost engine fixture");

function locatorFromEvidence(text) {
  return text.match(/\((plan\.md|issue):L\d+(?:-L\d+)?\)$/)?.[0]?.slice(1, -1);
}

function locatorIsValid(locator, sample, lineCount) {
  const expected = sample.kind === "plan" ? "plan.md" : "issue";
  const match = locator?.match(/^(plan\.md|issue):L(\d+)(?:-L(\d+))?$/);
  return Boolean(match && match[1] === expected && Number(match[2]) >= 1 && Number(match[3] ?? match[2]) <= lineCount);
}

function normalizeClaim(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(?:ev_[a-z0-9_:-]+|entry_[a-z0-9_:-]+|plan\.md:l\d+(?:-l\d+)?|issue:l\d+(?:-l\d+)?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function substantiveClaim(value) {
  const normalized = normalizeClaim(value);
  if (normalized.split(" ").length < 4) return false;
  return ![
    "gather more grounded evidence before implementation",
    "proceed with the reviewed approach",
    "start the smallest reversible rollout step",
    "confirm inputs"
  ].includes(normalized);
}

function absentFromBaseline(value, baseline) {
  const candidate = normalizeClaim(value);
  const baselineClaims = [
    baseline.recommendation,
    baseline.next_action,
    ...baseline.evidence.map((item) => item.claim),
    ...baseline.assumptions.flatMap((item) => [item.statement, item.how_to_verify]),
    ...baseline.risks,
    ...baseline.what_would_change_my_view
  ].map(normalizeClaim);
  return candidate.length > 0 && baselineClaims.every((claim) => !claim.includes(candidate) && !candidate.includes(claim));
}

for (const sample of set.samples) {
  const hash = createHash("sha256").update(sample.input).digest("hex");
  const record = records.get(sample.id);
  if (hash !== sample.inputSha256) failures.push(`${sample.id}: input hash mismatch`);
  if (!record || record.inputSha256 !== sample.inputSha256) {
    failures.push(`${sample.id}: missing or stale evidence record`);
    continue;
  }
  for (const field of scorecard.requiredEvidenceFields) {
    if (!(field in record)) failures.push(`${sample.id}: missing evidence field ${field}`);
  }
  if (!route.auth.runnable || route.auth.configured !== true) failures.push(`${sample.id}: fixture route is not executable`);
  const input = sample.kind === "plan"
    ? { kind: "plan", displayName: "plan.md", text: sample.input, lineMap: lineMapFor(sample.input), sha256: hash }
    : issueSnapshot(sample.input);
  const roster = {
    version: 1,
    updatedAt: evidence.generatedAt,
    scope: "explicit",
    entries: [
      { id: "entry_a", route: route.ref, role: "architect", effort: "medium", enabled: true },
      { id: "entry_b", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
    ],
    reportStrategy: sample.id === "issue-freeform" ? { kind: "structured_disagreement" } : { kind: "deterministic" }
  };
  const runRoot = mkdtempSync(join(tmpdir(), `council-usefulness-${sample.id}-`));
  try {
    const env = { ...process.env, AISYNTH_COUNCIL_PROVIDER_INVOKE: fakeInvoke };
    const council = await runCouncil({
      cwd: runRoot,
      packageRoot: root,
      input,
      roster,
      routes: [route],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env
    });
    const soloEntry = { id: "entry_solo", route: route.ref, role: "architect", effort: "medium", enabled: true };
    const solo = await invokeProvider(
      root,
      route,
      soloEntry,
      `You are council member entry_solo with role architect.\nImmutable ${sample.kind === "plan" ? "plan.md" : "issue"}:\n${sample.input}`,
      join(root, "schemas/council-voice.json"),
      30000,
      env
    );
    if (!council.ok || !council.report || !solo.ok || !solo.structured) {
      failures.push(`${sample.id}: fixture execution failed`);
      continue;
    }
    const report = council.report;
    const baseline = solo.structured;
    const locators = [...new Set(report.evidence_summary.map(locatorFromEvidence).filter(Boolean))].sort();
    const verifiedLocators = locators.filter((locator) => locatorIsValid(locator, sample, input.lineMap.length));
    const deltas = [];
    const outcome = normalizeClaim(`${report.recommendation} ${report.next_action}`);
    let dissent;
    try {
      dissent = JSON.parse(report.strongest_dissent);
    } catch {
      dissent = { objection: report.strongest_dissent };
    }
    const dissentClaim = dissent?.objection;
    if (
      substantiveClaim(dissentClaim)
      && absentFromBaseline(dissentClaim, baseline)
      && outcome.includes(normalizeClaim(dissentClaim))
    ) deltas.push("dissent");
    if (report.evidence_summary.some((item) => {
      const claim = item.replace(/\s+\([^)]+\)$/, "");
      return substantiveClaim(claim) && absentFromBaseline(claim, baseline) && outcome.includes(normalizeClaim(claim));
    })) deltas.push("evidence");
    if (report.assumptions.some((item) => {
      const claim = item.replace(/^[^:]+:\s*/, "");
      return substantiveClaim(claim) && absentFromBaseline(claim, baseline) && outcome.includes(normalizeClaim(claim));
    })) deltas.push("assumption");
    if (substantiveClaim(report.next_action) && absentFromBaseline(report.next_action, baseline)) deltas.push("next_action");
    const derivedPass = [
      report.recommendation,
      report.strongest_dissent,
      report.next_action
    ].every((value) => typeof value === "string" && value.length > 0)
      && verifiedLocators.length >= scorecard.passThreshold.verifiedCitations
      && report.assumptions.length + report.risks.length >= scorecard.passThreshold.assumptionsOrRisks
      && deltas.length > 0;
    const actualRoutes = roster.entries.map((entry) => entry.route.routeId);
    if (JSON.stringify(record.routes) !== JSON.stringify(actualRoutes)) failures.push(`${sample.id}: recorded routes do not match execution`);
    if (record.councilResult.recommendation !== report.recommendation) failures.push(`${sample.id}: recorded recommendation does not match execution`);
    if (JSON.stringify(record.councilResult.verifiedCitationLocators) !== JSON.stringify(verifiedLocators)) failures.push(`${sample.id}: recorded citations do not match verified locators`);
    if (record.councilResult.strongestDissent !== report.strongest_dissent) failures.push(`${sample.id}: recorded dissent does not match execution`);
    if (record.councilResult.assumptionsOrRisksCount !== report.assumptions.length + report.risks.length) failures.push(`${sample.id}: recorded assumptions or risks do not match execution`);
    if (record.councilResult.nextAction !== report.next_action) failures.push(`${sample.id}: recorded next action does not match execution`);
    if (record.soloComparison.baselineRecommendation !== baseline.recommendation) failures.push(`${sample.id}: recorded solo baseline does not match execution`);
    if (JSON.stringify(record.soloComparison.materialDeltas) !== JSON.stringify(deltas)) failures.push(`${sample.id}: recorded solo deltas do not match derivation`);
    if (record.soloComparison.usedByFinalReport !== true || record.pass !== derivedPass || !derivedPass) failures.push(`${sample.id}: derived usefulness gate failed`);
    if (!Array.isArray(record.revisionAttempts) || record.revisionAttempts.length > scorecard.sameRouteExit.maxRevisionAttempts) failures.push(`${sample.id}: invalid revision attempts`);
  } finally {
    rmSync(runRoot, { recursive: true, force: true });
  }
}

if (records.size !== set.samples.length) failures.push("evidence contains unexpected sample records");
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`council usefulness evidence derived (${set.samples.length} samples, ${evidence.evaluationMode})`);
