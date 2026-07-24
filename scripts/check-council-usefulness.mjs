#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hasArgs(command, ...args) {
  return Array.isArray(command) && args.every((arg, index) => command[index] === arg);
}

function optionValue(command, option) {
  const index = command.indexOf(option);
  return index >= 0 ? command[index + 1] : undefined;
}

function loadCapture(record, sample) {
  const path = record.captureArtifact?.path;
  if (typeof path !== "string" || !/^docs\/public\/council-usefulness-captures\/[a-z0-9-]+\.v1\.json$/.test(path)) {
    failures.push(`${sample.id}: missing immutable capture artifact`);
    return undefined;
  }
  const absolutePath = resolve(root, path);
  if (relative(root, absolutePath).startsWith("..")) {
    failures.push(`${sample.id}: capture artifact escapes repository`);
    return undefined;
  }
  let bytes;
  try {
    bytes = readFileSync(absolutePath, "utf8");
  } catch {
    failures.push(`${sample.id}: capture artifact unreadable`);
    return undefined;
  }
  if (sha256(bytes) !== record.captureArtifact.sha256) failures.push(`${sample.id}: capture artifact hash mismatch`);
  const capture = JSON.parse(bytes);
  if (capture.version !== 1 || capture.kind !== "authorized_portable_provider_invoke_replay_capture") failures.push(`${sample.id}: invalid capture kind`);
  if (capture.sampleId !== sample.id || capture.input?.sha256 !== sample.inputSha256 || capture.input?.text !== sample.input || capture.input?.kind !== sample.kind) {
    failures.push(`${sample.id}: capture input mismatch`);
  }
  const route = capture.routeContract;
  const probe = capture.routeProbe;
  if (!hasArgs(probe?.command, "bin/council-route-probe", "--json")) failures.push(`${sample.id}: invalid route-probe replay command`);
  if (!probe?.diagnostics?.some((diagnostic) => diagnostic.executor === "provider-invoke" && diagnostic.provider === route?.provider && diagnostic.status === "ok")) {
    failures.push(`${sample.id}: capture does not contain a successful portable route probe`);
  }
  if (
    route?.provider !== "claude"
    || route?.authPolicy !== "subscription_only"
    || route?.billing !== "subscription"
    || typeof route?.routeId !== "string"
    || !route.routeId.startsWith("v1:provider-invoke:claude:")
    || !Array.isArray(route.routes)
    || route.routes.length < 2
    || route.routes.some((routeId) => routeId !== route.routeId)
  ) failures.push(`${sample.id}: capture route contract is not authorized portable Claude subscription`);
  const councilCommand = capture.commands?.council;
  if (
    !Array.isArray(councilCommand)
    || councilCommand[0] !== "bin/council"
    || optionValue(councilCommand, "--auth-policy") !== "subscription-only"
    || optionValue(councilCommand, "--roster-file") !== "<authorized-live-roster>"
    || !councilCommand.includes("--json")
    || optionValue(councilCommand, sample.kind === "plan" ? "--plan-file" : "--issue") !== (sample.kind === "plan" ? "<fixed-sample-input>" : sample.input)
  ) failures.push(`${sample.id}: invalid council replay command`);
  const soloCommand = capture.commands?.solo;
  if (
    !hasArgs(soloCommand, "bin/provider-invoke", "claude")
    || optionValue(soloCommand, "--auth") !== "subscription"
    || optionValue(soloCommand, "--schema-file") !== "schemas/council-voice.json"
  ) failures.push(`${sample.id}: invalid solo replay command`);
  const rawSolo = Object.fromEntries(Object.entries(record.soloComparison).filter(([key]) =>
    !["baselineRecommendation", "materialDeltas", "usedByFinalReport"].includes(key)
  ));
  if (stableJson(capture.capturedOutputs?.councilResult) !== stableJson(record.councilResult)) failures.push(`${sample.id}: captured council output mismatch`);
  if (stableJson(capture.capturedOutputs?.soloResult) !== stableJson(rawSolo)) failures.push(`${sample.id}: captured solo output mismatch`);
  if (capture.outputHashes?.councilResultSha256 !== sha256(stableJson(record.councilResult))) failures.push(`${sample.id}: captured council output hash mismatch`);
  if (capture.outputHashes?.soloResultSha256 !== sha256(stableJson(rawSolo))) failures.push(`${sample.id}: captured solo output hash mismatch`);
  if (stableJson(capture.capturedOutputs?.revisionResults) !== stableJson(record.revisionAttempts)) failures.push(`${sample.id}: captured revision output mismatch`);
  if (
    !Array.isArray(capture.commands?.revisions)
    || capture.commands.revisions.length !== record.revisionAttempts.length
    || capture.commands.revisions.some((command, index) =>
      optionValue(command, "--report-strategy") !== record.revisionAttempts[index].strategy
      || optionValue(command, "--auth-policy") !== "subscription-only"
      || !command.includes("--json")
    )
    || stableJson(capture.outputHashes?.revisionResultSha256) !== stableJson(record.revisionAttempts.map((attempt) => sha256(stableJson(attempt))))
  ) failures.push(`${sample.id}: invalid revision replay capture`);
  return capture;
}

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
  const capture = loadCapture(record, sample);
  const independentRouteAvailable = (capture?.routeProbe?.diagnostics ?? []).some((diagnostic) =>
    diagnostic.provider !== "claude" && diagnostic.status === "ok"
  );
  if (
    record.execution?.provider !== capture?.routeContract?.provider
    || record.execution?.routeId !== capture?.routeContract?.routeId
    || record.execution?.authPolicy !== capture?.routeContract?.authPolicy
    || record.execution?.billing !== capture?.routeContract?.billing
    || record.execution?.fixture !== false
  ) failures.push(`${sample.id}: execution summary does not match immutable capture`);
  if (!Array.isArray(record.routes) || record.routes.length < 2) failures.push(`${sample.id}: expected at least two executable member routes`);
  if (record.routes.some((route) => typeof route !== "string" || !route.startsWith("v1:provider-invoke:"))) failures.push(`${sample.id}: non-portable route recorded`);
  if (stableJson(record.routes) !== stableJson(capture?.routeContract?.routes)) failures.push(`${sample.id}: routes do not match immutable capture`);
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
      && record.revisionAttempts.every((attempt) => attempt.outcome === "correlated_no_added_value");
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
