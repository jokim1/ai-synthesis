#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const set = readJson("docs/public/council-usefulness-set.v1.json");
const scorecard = readJson("docs/public/council-usefulness-scorecard.v1.json");
const evidence = readJson(scorecard.evidenceFile);
const records = new Map(evidence.records.map((record) => [record.sampleId, record]));
const failures = [];
if (evidence.evaluationMode !== "authorized_portable_provider_invoke") failures.push("usefulness evidence must be from authorized portable provider-invoke routes");
if (evidence.noCostFixture === true) failures.push("usefulness evidence must not be the no-cost engine fixture");
const independentRouteAvailable = (evidence.routeProbeDiagnostics ?? []).some((diagnostic) =>
  diagnostic.provider !== "claude" && diagnostic.status === "ok"
);

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
  if (record.execution?.authorizedPortableProviderInvoke !== true) failures.push(`${sample.id}: missing authorized portable provider-invoke proof`);
  if (!Array.isArray(record.routes) || record.routes.length < 2) failures.push(`${sample.id}: expected at least two executable member routes`);
  if (record.routes.some((route) => typeof route !== "string" || !route.startsWith("v1:provider-invoke:"))) failures.push(`${sample.id}: non-portable route recorded`);
  const report = record.councilResult;
  const baseline = record.soloComparison;
  if (!report || !baseline) {
    failures.push(`${sample.id}: missing council or solo result`);
    continue;
  }
  {
    const lineCount = sample.input.split("\n").length;
    const locators = [...new Set(report.evidence_summary.map(locatorFromEvidence).filter(Boolean))].sort();
    const verifiedLocators = locators.filter((locator) => locatorIsValid(locator, sample, lineCount));
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
    const correlatedExit = deltas.length === 0
      && independentRouteAvailable === false
      && record.sameRouteExit?.result === "same_route_added_value:not_demonstrated"
      && record.sameRouteExit?.disclosure === scorecard.sameRouteExit.disclosure
      && Array.isArray(record.revisionAttempts)
      && record.revisionAttempts.length === scorecard.sameRouteExit.maxRevisionAttempts
      && record.revisionAttempts.every((attempt) => attempt.outcome === "correlated_no_added_value" && attempt.realModelCalls === true);
    const derivedPass = [
      report.recommendation,
      report.strongest_dissent,
      report.next_action
    ].every((value) => typeof value === "string" && value.length > 0)
      && verifiedLocators.length >= scorecard.passThreshold.verifiedCitations
      && report.assumptions.length + report.risks.length >= scorecard.passThreshold.assumptionsOrRisks
      && (deltas.length > 0 || correlatedExit);
    if (JSON.stringify(record.councilResult.verifiedCitationLocators) !== JSON.stringify(verifiedLocators)) failures.push(`${sample.id}: recorded citations do not match verified locators`);
    if (record.councilResult.assumptionsOrRisksCount !== report.assumptions.length + report.risks.length) failures.push(`${sample.id}: recorded assumptions or risks do not match report`);
    if (JSON.stringify(record.soloComparison.materialDeltas) !== JSON.stringify(deltas)) failures.push(`${sample.id}: recorded solo deltas do not match derivation`);
    if (record.soloComparison.usedByFinalReport !== true && !correlatedExit) failures.push(`${sample.id}: solo delta was not used by final report`);
    if (record.pass !== derivedPass || !derivedPass) failures.push(`${sample.id}: derived usefulness gate failed`);
    if (!Array.isArray(record.revisionAttempts) || record.revisionAttempts.length > scorecard.sameRouteExit.maxRevisionAttempts) failures.push(`${sample.id}: invalid revision attempts`);
  }
}

if (records.size !== set.samples.length) failures.push("evidence contains unexpected sample records");
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`council usefulness evidence derived (${set.samples.length} samples, ${evidence.evaluationMode})`);
