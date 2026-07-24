#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runCouncil } from "../extensions/council/lib/engine.js";
import { invokeProvider } from "../extensions/council/lib/executors/provider-invoke.js";
import { lineMapFor } from "../extensions/council/lib/input.js";
import { derivePositionCatalog } from "../extensions/council/lib/position-catalog.js";
import { validateModelJsonValue } from "../extensions/council/lib/validate-json.js";
import { stableJson } from "../extensions/council/lib/util.js";
import { evaluateRuns, needsRevision } from "./council-usefulness-derivation.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = join(root, "docs/public/council-usefulness-captures");
const sessionsRoot = join(outputRoot, "sessions");
const set = JSON.parse(readFileSync(join(root, "docs/public/council-usefulness-set.v1.json"), "utf8"));
const scorecard = JSON.parse(readFileSync(join(root, "docs/public/council-usefulness-scorecard.v1.json"), "utf8"));
const evidencePath = join(root, scorecard.evidenceFile);
const sampleFlagIndex = process.argv.indexOf("--sample");
const sampleFilter = sampleFlagIndex >= 0 ? process.argv[sampleFlagIndex + 1] : undefined;

if (!process.argv.includes("--write") || (sampleFlagIndex >= 0 && !set.samples.some((sample) => sample.id === sampleFilter))) {
  console.error("usage: node --import ./node_modules/jiti/lib/jiti-register.mjs scripts/capture-council-usefulness.ts --write [--sample <sample-id>]");
  process.exit(2);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeArtifact(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return { path: relative(root, path), sha256: sha256(bytes) };
}

function writeJsonArtifact(path, value) {
  return writeArtifact(path, `${JSON.stringify(value, null, 2)}\n`);
}

function snapshot(sample) {
  return {
    kind: sample.kind,
    displayName: sample.kind === "plan" ? "plan.md" : "issue",
    text: sample.input,
    lineMap: lineMapFor(sample.input),
    sha256: sample.inputSha256
  };
}

function verifiedLocators(report, sample) {
  const expected = sample.kind === "plan" ? "plan.md" : "issue";
  const lineCount = sample.input.split("\n").length;
  return report.evidence_summary.map((text) =>
    text.match(/\((plan\.md|issue):L\d+(?:-L\d+)?\)$/)?.[0]?.slice(1, -1)
  ).filter((locator) => {
    const match = locator?.match(/^(plan\.md|issue):L(\d+)(?:-L(\d+))?$/);
    return match && match[1] === expected && Number(match[2]) >= 1 && Number(match[3] ?? match[2]) <= lineCount;
  }).sort();
}

const routeProbeProcess = spawnSync(join(root, "bin/council-route-probe"), ["--json"], {
  cwd: root,
  encoding: "utf8",
  env: process.env
});
if (routeProbeProcess.status !== 0) throw new Error(routeProbeProcess.stderr || "route probe failed");
const routeProbeEnvelope = JSON.parse(routeProbeProcess.stdout);
const route = routeProbeEnvelope.routes.find((candidate) =>
  candidate.ref.provider === "claude"
  && candidate.ref.executor === "provider-invoke"
  && candidate.auth.runnable
  && candidate.auth.policy === "subscription_only"
  && candidate.auth.billing === "subscription"
);
if (!route) throw new Error("authorized portable Claude subscription route unavailable");

mkdirSync(outputRoot, { recursive: true });
mkdirSync(sessionsRoot, { recursive: true });
const routeProbePath = join(outputRoot, "route-probe.raw.json");
const rosterPath = join(outputRoot, "roster.raw.json");
const routeProbeArtifact = sampleFilter
  ? { path: relative(root, routeProbePath), sha256: sha256(readFileSync(routeProbePath)) }
  : writeArtifact(routeProbePath, routeProbeProcess.stdout);
const roster = sampleFilter
  ? JSON.parse(readFileSync(rosterPath, "utf8"))
  : {
      version: 1,
      updatedAt: new Date().toISOString(),
      scope: "explicit",
      entries: [
        { id: "entry_aaaaaaaaaaaaaaaaaaaaaaaaaa", route: route.ref, role: "architect", effort: "medium", enabled: true },
        { id: "entry_bbbbbbbbbbbbbbbbbbbbbbbbbb", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    };
const rosterArtifact = sampleFilter
  ? { path: relative(root, rosterPath), sha256: sha256(readFileSync(rosterPath)) }
  : writeJsonArtifact(rosterPath, roster);
const priorEvidence = sampleFilter ? JSON.parse(readFileSync(evidencePath, "utf8")) : undefined;
const records = new Map((priorEvidence?.records ?? []).map((record) => [record.sampleId, record]));

function collector(sampleId, runName) {
  const calls = [];
  let callIndex = 0;
  return {
    calls,
    capture(capture) {
      callIndex += 1;
      const callName = `${runName}-${String(callIndex).padStart(2, "0")}`;
      const promptArtifact = writeArtifact(join(outputRoot, sampleId, `${callName}.prompt.txt`), capture.prompt);
      const schemaBytes = readFileSync(capture.schemaPath);
      const envelopeArtifact = writeArtifact(join(outputRoot, sampleId, `${callName}.envelope.raw.json`), capture.stdout);
      const stderrArtifact = capture.stderr
        ? writeArtifact(join(outputRoot, sampleId, `${callName}.stderr.txt`), capture.stderr)
        : undefined;
      const replayArgs = [...capture.args];
      const promptIndex = replayArgs.indexOf("--prompt");
      replayArgs.splice(promptIndex, 2, "--prompt-file", promptArtifact.path);
      const schemaIndex = replayArgs.indexOf("--schema-file");
      replayArgs[schemaIndex + 1] = relative(root, capture.schemaPath);
      const envelope = JSON.parse(capture.stdout);
      calls.push({
        command: ["bin/provider-invoke", ...replayArgs],
        routeId: capture.routeId,
        entryId: capture.entryId,
        effort: capture.effort,
        prompt: promptArtifact,
        schema: { path: relative(root, capture.schemaPath), sha256: sha256(schemaBytes) },
        rawEnvelope: envelopeArtifact,
        ...(stderrArtifact ? { stderr: stderrArtifact } : {}),
        envelopeStatus: envelope.status,
        resolvedModel: envelope.model ?? ""
      });
    }
  };
}

async function captureRun(sample, name, strategy) {
  const collected = collector(sample.id, name);
  const result = await runCouncil({
    cwd: sessionsRoot,
    packageRoot: root,
    input: snapshot(sample),
    roster,
    routes: [route],
    reportStrategyOverride: strategy,
    reportStrategySource: strategy ? "cli" : "roster_file",
    rememberedRosterWritten: false,
    env: process.env,
    captureProviderInvocation: collected.capture
  });
  if (!result.ok || !result.report || !result.reportPath) throw new Error(`${sample.id}:${name} failed: ${result.diagnostics.join("; ")}`);
  const reportArtifact = writeArtifact(
    join(outputRoot, sample.id, `${name}.report.md`),
    readFileSync(result.reportPath)
  );
  const resultValue = { report: result.report, diagnostics: result.diagnostics };
  const resultArtifact = writeJsonArtifact(join(outputRoot, sample.id, `${name}.result.json`), resultValue);
  return { result, artifact: resultArtifact, reportArtifact, providerCalls: collected.calls };
}

async function captureSolo(sample) {
  const collected = collector(sample.id, "solo");
  const entry = {
    id: "entry_cccccccccccccccccccccccccc",
    route: route.ref,
    role: "product-operator",
    effort: "medium",
    enabled: true
  };
  const catalog = derivePositionCatalog(snapshot(sample));
  const prompt = `You are a solo baseline, not a council. Review the immutable ${sample.kind} independently.
Return only JSON matching the supplied schema.
Use member_id ${entry.id}, role ${entry.role}, and choose position_key from ${stableJson(catalog)} or other:<lowercase-slug>.
Cite only ${sample.kind === "plan" ? "plan.md:Lx-Ly" : "issue:Lx-Ly"} evidence.

${sample.kind === "plan" ? "plan.md" : "issue"}:
${sample.input.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n")}`;
  const result = await invokeProvider(
    root,
    route,
    entry,
    prompt,
    join(root, "schemas/council-voice.json"),
    300_000,
    process.env,
    undefined,
    collected.capture
  );
  if (!result.ok) throw new Error(`${sample.id}:solo failed: ${result.status} ${result.error ?? ""}`);
  const validated = validateModelJsonValue(join(root, "schemas/council-voice.json"), result.structured);
  if (!validated.ok) throw new Error(`${sample.id}:solo invalid: ${validated.error}`);
  return { value: validated.value, providerCalls: collected.calls };
}

for (const sample of set.samples.filter((candidate) => !sampleFilter || candidate.id === sampleFilter)) {
  const primary = await captureRun(sample, "primary", undefined);
  const solo = await captureSolo(sample);
  const revisions = [];
  const revisionStrategies = [
    { kind: "structured_disagreement" as const },
    { kind: "deterministic" as const }
  ];
  let evaluation = evaluateRuns(primary.result.report, [], solo.value);
  while (needsRevision(evaluation, revisions.length, scorecard.sameRouteExit.maxRevisionAttempts)) {
    const attempt = revisions.length;
    revisions.push(await captureRun(sample, `revision-${attempt + 1}`, revisionStrategies[attempt]));
    evaluation = evaluateRuns(primary.result.report, revisions.map((revision) => revision.result.report), solo.value);
  }
  const revisionEvaluations = revisions.map((revision, index) => ({
    revision,
    ...evaluation.revisions[index]
  }));
  const report = evaluation.selectedReport;
  const locators = verifiedLocators(report, sample);
  const deltas = evaluation.selectedDeltas;
  const correlatedExit = evaluation.primaryDeltas.length === 0
    && revisionEvaluations.length === scorecard.sameRouteExit.maxRevisionAttempts
    && revisionEvaluations.every((evaluation) => evaluation.deltas.length === 0);
  const councilResult = {
    ...report,
    verifiedCitationLocators: locators,
    assumptionsOrRisksCount: report.assumptions.length + report.risks.length
  };
  const soloComparison = {
    ...solo.value,
    baselineRecommendation: solo.value.recommendation,
    materialDeltas: deltas,
    usedByFinalReport: deltas.length > 0
  };
  const revisionAttempts = evaluation.primaryDeltas.length === 0
    ? revisionEvaluations.map((evaluation, index) => ({
        attempt: index + 1,
        strategy: index === 0 ? "structured_disagreement" : "deterministic",
        outcome: evaluation.outcome,
        materialDeltas: evaluation.deltas,
        rawRunArtifact: evaluation.revision.artifact
      }))
    : [];
  const capture = {
    version: 2,
    kind: "authorized_portable_provider_invoke_raw_capture",
    sampleId: sample.id,
    capturedAt: new Date().toISOString(),
    input: {
      kind: sample.kind,
      text: sample.input,
      sha256: sample.inputSha256,
      artifact: writeArtifact(
        join(outputRoot, sample.id, sample.kind === "plan" ? "input.plan.md" : "input.issue.txt"),
        sample.input
      )
    },
    routeProbe: routeProbeArtifact,
    roster: rosterArtifact,
    routeId: route.ref.routeId,
    selectedRun: evaluation.selectedRun,
    primary: {
      result: primary.artifact,
      report: primary.reportArtifact,
      providerCalls: primary.providerCalls
    },
    solo: {
      structuredOutputSha256: sha256(stableJson(solo.value)),
      providerCalls: solo.providerCalls
    },
    revisions: revisionEvaluations.map((evaluation, index) => ({
      strategy: index === 0 ? "structured_disagreement" : "deterministic",
      outcome: evaluation.outcome,
      materialDeltas: evaluation.deltas,
      result: evaluation.revision.artifact,
      report: evaluation.revision.reportArtifact,
      providerCalls: evaluation.revision.providerCalls
    }))
  };
  const capturePath = join(outputRoot, `${sample.id}.v2.json`);
  const captureArtifact = writeJsonArtifact(capturePath, capture);
  const pass = [
    report.recommendation,
    report.strongest_dissent,
    report.next_action
  ].every((value) => typeof value === "string" && value.length > 0)
    && locators.length >= scorecard.passThreshold.verifiedCitations
    && councilResult.assumptionsOrRisksCount >= scorecard.passThreshold.assumptionsOrRisks
    && (deltas.length > 0 || correlatedExit);
  records.set(sample.id, {
    sampleId: sample.id,
    inputSha256: sample.inputSha256,
    routes: roster.entries.map((entry) => entry.route.routeId),
    execution: {
      provider: "claude",
      routeId: route.ref.routeId,
      authPolicy: route.auth.policy,
      billing: route.auth.billing,
      fixture: false
    },
    captureArtifact,
    councilResult,
    soloComparison,
    revisionAttempts,
    pass,
    ...(correlatedExit ? {
      sameRouteExit: {
        result: "same_route_added_value:not_demonstrated",
        disclosure: scorecard.sameRouteExit.disclosure,
        reason: "Two captured real same-route Claude subscription attempts produced no material delta and the captured route probe found no authorized independent route."
      }
    } : {})
  });
}

const routeProbeDiagnostics = routeProbeEnvelope.diagnostics;
writeJsonArtifact(evidencePath, {
  version: 1,
  evaluationMode: "authorized_portable_provider_invoke",
  noCostFixture: false,
  generatedAt: new Date().toISOString(),
  routeProbeDiagnostics,
  records: set.samples.map((sample) => records.get(sample.id))
});
rmSync(sessionsRoot, { recursive: true, force: true });
console.log(`captured ${sampleFilter ? 1 : records.size} live usefulness samples`);
