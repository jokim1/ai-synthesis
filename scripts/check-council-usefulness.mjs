#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const set = readJson("docs/public/council-usefulness-set.v1.json");
const scorecard = readJson("docs/public/council-usefulness-scorecard.v1.json");
const evidence = readJson(scorecard.evidenceFile);
const failures = [];
const records = new Map(evidence.records.map((record) => [record.sampleId, record]));

for (const sample of set.samples) {
  const hash = createHash("sha256").update(sample.input).digest("hex");
  if (hash !== sample.inputSha256) failures.push(`${sample.id}: input hash mismatch`);
  const record = records.get(sample.id);
  if (!record) {
    failures.push(`${sample.id}: missing evidence record`);
    continue;
  }
  if (record.inputSha256 !== sample.inputSha256) failures.push(`${sample.id}: evidence hash mismatch`);
  if (!Array.isArray(record.routes) || record.routes.length < 2) failures.push(`${sample.id}: fewer than two recorded routes`);
  const result = record.councilResult;
  if (!result || typeof result.recommendation !== "string" || result.recommendation.length === 0) failures.push(`${sample.id}: missing recommendation`);
  if (!Array.isArray(result?.verifiedCitations) || result.verifiedCitations.length < scorecard.passThreshold.verifiedCitations) failures.push(`${sample.id}: insufficient citations`);
  if (typeof result?.strongestDissent !== "string" || result.strongestDissent.length === 0) failures.push(`${sample.id}: missing dissent`);
  if ((result?.assumptions?.length ?? 0) + (result?.risks?.length ?? 0) < scorecard.passThreshold.assumptionsOrRisks) failures.push(`${sample.id}: insufficient assumptions or risks`);
  if (typeof result?.nextAction !== "string" || result.nextAction.length === 0) failures.push(`${sample.id}: missing next action`);
  const comparison = record.soloComparison;
  if (!comparison || !Array.isArray(comparison.materialDeltas) || comparison.materialDeltas.length === 0 || comparison.usedByFinalReport !== true) failures.push(`${sample.id}: no used solo delta`);
  if (!Array.isArray(record.revisionAttempts) || record.revisionAttempts.length > scorecard.sameRouteExit.maxRevisionAttempts) failures.push(`${sample.id}: invalid revision attempts`);
  if (record.pass !== true) failures.push(`${sample.id}: record is not passing`);
}

if (records.size !== set.samples.length) failures.push("evidence contains unexpected sample records");
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`council usefulness evidence ok (${set.samples.length} samples, ${evidence.evaluationMode})`);
