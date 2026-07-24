#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRuns, materialDeltas } from "./council-usefulness-derivation.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const set = readJson("docs/public/council-usefulness-set.v1.json");
const scorecard = readJson("docs/public/council-usefulness-scorecard.v1.json");
const evidence = readJson(scorecard.evidenceFile);
const records = new Map(evidence.records.map((record) => [record.sampleId, record]));
const captureRoot = resolve(root, "docs/public/council-usefulness-captures");
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

function optionValue(command, option) {
  const index = command.indexOf(option);
  return index >= 0 ? command[index + 1] : undefined;
}

function readArtifact(reference, label) {
  const path = reference?.path;
  if (typeof path !== "string" || !path.startsWith("docs/public/council-usefulness-captures/") || /[<>]/.test(path)) {
    failures.push(`${label}: invalid artifact path`);
    return undefined;
  }
  const absolutePath = resolve(root, path);
  if (relative(captureRoot, absolutePath).startsWith("..")) {
    failures.push(`${label}: artifact escapes capture root`);
    return undefined;
  }
  let bytes;
  try {
    bytes = readFileSync(absolutePath, "utf8");
  } catch {
    failures.push(`${label}: artifact unreadable`);
    return undefined;
  }
  if (sha256(bytes) !== reference.sha256) failures.push(`${label}: artifact hash mismatch`);
  return bytes;
}

function readJsonArtifact(reference, label) {
  const bytes = readArtifact(reference, label);
  if (bytes === undefined) return undefined;
  try {
    return JSON.parse(bytes);
  } catch {
    failures.push(`${label}: artifact is not JSON`);
    return undefined;
  }
}

function verifyRepositoryFile(reference, label) {
  const path = reference?.path;
  if (typeof path !== "string" || !/^schemas\/council-[a-z-]+\.json$/.test(path)) {
    failures.push(`${label}: invalid repository file path`);
    return undefined;
  }
  let bytes;
  try {
    bytes = readFileSync(resolve(root, path), "utf8");
  } catch {
    failures.push(`${label}: repository file unreadable`);
    return undefined;
  }
  if (sha256(bytes) !== reference.sha256) failures.push(`${label}: repository file hash mismatch`);
  return bytes;
}

function validateRawCall(call, routeId, sample, label) {
  const command = call?.command;
  if (
    !Array.isArray(command)
    || command[0] !== "bin/provider-invoke"
    || command[1] !== "claude"
    || command.some((value) => typeof value !== "string" || /[<>]/.test(value))
    || optionValue(command, "--auth") !== "subscription"
    || optionValue(command, "--prompt-file") !== call.prompt?.path
    || optionValue(command, "--schema-file") !== call.schema?.path
    || call.routeId !== routeId
  ) failures.push(`${label}: provider replay command mismatch`);
  const promptBytes = readArtifact(call?.prompt, `${label}:prompt`);
  if (
    promptBytes === undefined
    || sample.input.split("\n").some((line, index) => !promptBytes.includes(`${index + 1}: ${line}`))
  ) failures.push(`${label}: prompt is not bound to the fixed sample`);
  const schemaBytes = verifyRepositoryFile(call?.schema, `${label}:schema`);
  if (schemaBytes === undefined) failures.push(`${label}: invalid council schema`);
  const envelope = readJsonArtifact(call?.rawEnvelope, `${label}:raw-envelope`);
  if (envelope?.ok !== true || envelope?.status !== "ok" || envelope?.structured === undefined) {
    failures.push(`${label}: raw provider envelope is not a successful structured call`);
  }
  if (call.envelopeStatus !== envelope?.status || call.resolvedModel !== (envelope?.model ?? "")) failures.push(`${label}: envelope summary mismatch`);
  return envelope;
}

function validateRun(run, routeId, sample, label) {
  const result = readJsonArtifact(run?.result, `${label}:result`);
  const reportBytes = readArtifact(run?.report, `${label}:report`);
  if (!Array.isArray(run?.providerCalls) || run.providerCalls.length < 4) failures.push(`${label}: missing raw council provider calls`);
  const envelopes = (run?.providerCalls ?? []).map((call, index) => validateRawCall(call, routeId, sample, `${label}:call-${index + 1}`));
  return { result, reportBytes, envelopes };
}

function loadCapture(record, sample) {
  const path = record.captureArtifact?.path;
  if (typeof path !== "string" || path !== `docs/public/council-usefulness-captures/${sample.id}.v2.json`) {
    failures.push(`${sample.id}: missing immutable raw capture artifact`);
    return undefined;
  }
  const capture = readJsonArtifact(record.captureArtifact, `${sample.id}:capture`);
  if (capture?.version !== 2 || capture?.kind !== "authorized_portable_provider_invoke_raw_capture") failures.push(`${sample.id}: invalid raw capture kind`);
  if (capture?.sampleId !== sample.id || capture?.input?.sha256 !== sample.inputSha256 || capture?.input?.text !== sample.input || capture?.input?.kind !== sample.kind) {
    failures.push(`${sample.id}: capture input mismatch`);
  }
  const inputBytes = readArtifact(capture?.input?.artifact, `${sample.id}:input`);
  if (inputBytes !== sample.input) failures.push(`${sample.id}: captured input bytes mismatch`);
  const routeProbe = readJsonArtifact(capture?.routeProbe, `${sample.id}:route-probe`);
  const route = routeProbe?.routes?.find((candidate) => candidate.ref?.routeId === capture?.routeId);
  if (
    route?.ref?.executor !== "provider-invoke"
    || route?.ref?.provider !== "claude"
    || route?.auth?.runnable !== true
    || route?.auth?.policy !== "subscription_only"
    || route?.auth?.billing !== "subscription"
    || !routeProbe?.diagnostics?.some((diagnostic) =>
      diagnostic.executor === "provider-invoke" && diagnostic.provider === "claude" && diagnostic.status === "ok"
    )
  ) failures.push(`${sample.id}: capture route contract is not authorized portable Claude subscription`);
  const roster = readJsonArtifact(capture?.roster, `${sample.id}:roster`);
  if (
    roster?.version !== 1
    || !Array.isArray(roster?.entries)
    || roster.entries.length < 2
    || roster.entries.some((entry) => !entry.enabled || entry.route?.routeId !== capture.routeId)
  ) failures.push(`${sample.id}: captured roster mismatch`);
  const primary = validateRun(capture?.primary, capture?.routeId, sample, `${sample.id}:primary`);
  const rawSolo = Object.fromEntries(Object.entries(record.soloComparison).filter(([key]) =>
    !["baselineRecommendation", "materialDeltas", "usedByFinalReport"].includes(key)
  ));
  const soloCalls = capture?.solo?.providerCalls;
  if (!Array.isArray(soloCalls) || soloCalls.length !== 1) failures.push(`${sample.id}: missing raw solo provider envelope`);
  const soloEnvelope = validateRawCall(soloCalls?.[0], capture?.routeId, sample, `${sample.id}:solo`);
  if (stableJson(soloEnvelope?.structured) !== stableJson(rawSolo)) failures.push(`${sample.id}: raw solo output mismatch`);
  if (capture?.solo?.structuredOutputSha256 !== sha256(stableJson(rawSolo))) failures.push(`${sample.id}: solo structured hash mismatch`);
  const revisions = (capture?.revisions ?? []).map((run, index) =>
    validateRun(run, capture?.routeId, sample, `${sample.id}:revision-${index + 1}`)
  );
  if (sample.id === "issue-freeform" && revisions.length !== scorecard.sameRouteExit.maxRevisionAttempts) {
    failures.push(`${sample.id}: two raw same-route revision runs are required`);
  }
  const expectedRevisionStrategies = ["structured_disagreement", "deterministic"];
  if (
    sample.id === "issue-freeform"
    && revisions.some((revision, index) =>
      capture.revisions[index]?.strategy !== expectedRevisionStrategies[index]
      || !revision.reportBytes?.includes(`report_strategy: "${expectedRevisionStrategies[index]}"`)
    )
  ) failures.push(`${sample.id}: raw revision strategy mismatch`);
  const evaluation = evaluateRuns(
    primary.result?.report,
    revisions.map((revision) => revision.result?.report),
    rawSolo
  );
  const revisionDeltas = evaluation.revisions.map((revision) => revision.deltas);
  for (let index = 0; index < revisions.length; index += 1) {
    if (
      capture.revisions[index]?.outcome !== evaluation.revisions[index].outcome
      || stableJson(capture.revisions[index]?.materialDeltas) !== stableJson(revisionDeltas[index])
    ) failures.push(`${sample.id}: revision-${index + 1} outcome is not derived from its raw report`);
  }
  if (capture?.selectedRun !== evaluation.selectedRun) failures.push(`${sample.id}: selected run does not match derived material deltas`);
  const selectedResult = evaluation.selectedRevisionIndex >= 0
    ? revisions[evaluation.selectedRevisionIndex].result
    : primary.result;
  const { verifiedCitationLocators: ignoredLocators, assumptionsOrRisksCount: ignoredCount, ...rawCouncilResult } = record.councilResult;
  if (stableJson(selectedResult?.report) !== stableJson(rawCouncilResult)) failures.push(`${sample.id}: selected raw council result mismatch`);
  const expectedAttempts = evaluation.primaryDeltas.length === 0 ? revisions.length : 0;
  if (
    record.revisionAttempts.length !== expectedAttempts
    || record.revisionAttempts.some((attempt, index) =>
      stableJson(attempt.rawRunArtifact) !== stableJson(capture.revisions[index].result)
      || stableJson(attempt.materialDeltas) !== stableJson(revisionDeltas[index])
      || attempt.outcome !== evaluation.revisions[index].outcome
    )
  ) failures.push(`${sample.id}: revision attempts are not bound to raw runs`);
  return { capture, routeProbe, route, roster };
}

function locatorFromEvidence(text) {
  return text.match(/\((plan\.md|issue):L\d+(?:-L\d+)?\)$/)?.[0]?.slice(1, -1);
}

function locatorIsValid(locator, sample, lineCount) {
  const expected = sample.kind === "plan" ? "plan.md" : "issue";
  const match = locator?.match(/^(plan\.md|issue):L(\d+)(?:-L(\d+))?$/);
  return Boolean(match && match[1] === expected && Number(match[2]) >= 1 && Number(match[3] ?? match[2]) <= lineCount);
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
    record.execution?.provider !== capture?.route?.ref?.provider
    || record.execution?.routeId !== capture?.route?.ref?.routeId
    || record.execution?.authPolicy !== capture?.route?.auth?.policy
    || record.execution?.billing !== capture?.route?.auth?.billing
    || record.execution?.fixture !== false
  ) failures.push(`${sample.id}: execution summary does not match immutable capture`);
  if (!Array.isArray(record.routes) || record.routes.length < 2) failures.push(`${sample.id}: expected at least two executable member routes`);
  if (record.routes.some((route) => typeof route !== "string" || !route.startsWith("v1:provider-invoke:"))) failures.push(`${sample.id}: non-portable route recorded`);
  if (stableJson(record.routes) !== stableJson(capture?.roster?.entries?.filter((entry) => entry.enabled).map((entry) => entry.route.routeId))) {
    failures.push(`${sample.id}: routes do not match immutable captured roster`);
  }
  const report = record.councilResult;
  const baseline = record.soloComparison;
  if (!report || !baseline) {
    failures.push(`${sample.id}: missing council or solo result`);
    continue;
  }
  {
    const lineCount = sample.input.split("\n").length;
    const locators = report.evidence_summary.map(locatorFromEvidence).filter(Boolean).sort();
    const verifiedLocators = locators.filter((locator) => locatorIsValid(locator, sample, lineCount));
    const deltas = materialDeltas(report, baseline);
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
