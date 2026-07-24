#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const plan = readFileSync(join(root, "docs/council-command-implementation-plan.md"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "docs/public/council-plan-split.v1.json"), "utf8"));
const failures = [];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function parseFrontmatter(text, path) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    failures.push(`${path}: missing frontmatter`);
    return {};
  }
  return Object.fromEntries(match[1].split("\n").map((line) => line.split(/:\s*/, 2)).filter((parts) => parts.length === 2));
}

if (manifest.governingPlanSha256 !== sha256(plan)) {
  failures.push(`COUNCIL_PLAN_SPLIT_STALE: expected ${manifest.governingPlanSha256}, got ${sha256(plan)}`);
}

const subplans = new Map();
for (const subplan of manifest.subplans ?? []) {
  const text = readFileSync(join(root, subplan.path), "utf8");
  const frontmatter = parseFrontmatter(text, subplan.path);
  subplans.set(subplan.path, { ...subplan, text, frontmatter });
  if (frontmatter.source !== manifest.governingPlan) failures.push(`${subplan.path}: source frontmatter drift`);
  if (frontmatter.track !== subplan.track) failures.push(`${subplan.path}: track frontmatter drift`);
  if (frontmatter.governingPlanSha256 !== manifest.governingPlanSha256) failures.push(`${subplan.path}: plan hash frontmatter drift`);
  for (const anchor of subplan.sectionIds ?? []) {
    if (!plan.includes(`## ${anchor}`)) failures.push(`${subplan.path}: missing governing anchor ${anchor}`);
    if (!text.includes(`#${anchor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`)) failures.push(`${subplan.path}: missing link to ${anchor}`);
  }
  for (const snippet of subplan.snippets ?? []) {
    if (!plan.includes(snippet.text)) failures.push(`${subplan.path}: snippet absent from governing plan ${snippet.id}`);
    if (sha256(snippet.text) !== snippet.sha256) failures.push(`${subplan.path}: snippet hash drift ${snippet.id}`);
    if (!text.includes(snippet.sha256)) failures.push(`${subplan.path}: subplan missing snippet hash ${snippet.id}`);
  }
}

const companion = manifest.companion;
if (!companion?.path || companion.status !== "deferred") failures.push("companion status table drift");

for (const decision of manifest.decisionKeys ?? []) {
  if (!plan.includes(decision.requiredText)) failures.push(`COUNCIL_PLAN_SPLIT_STALE: missing decision text ${decision.key}`);
  if (sha256(decision.requiredText) !== decision.snippetSha256) failures.push(`COUNCIL_PLAN_SPLIT_STALE: decision snippet hash drift ${decision.key}`);
  if (!plan.includes(`## ${decision.anchor}`)) failures.push(`COUNCIL_PLAN_SPLIT_STALE: missing decision anchor ${decision.key}`);
  for (const forbidden of decision.forbiddenText ?? []) {
    if (plan.includes(forbidden)) failures.push(`COUNCIL_PLAN_SPLIT_STALE: forbidden decision text ${decision.key}`);
  }
  const target = decision.target;
  const targetText = target === companion?.path ? readFileSync(join(root, companion.path), "utf8") : subplans.get(target)?.text;
  if (!targetText) failures.push(`COUNCIL_PLAN_SPLIT_STALE: missing target ${decision.key}`);
  else if (!targetText.includes(decision.key) || !targetText.includes(decision.snippetSha256)) failures.push(`COUNCIL_PLAN_SPLIT_STALE: target missing decision ${decision.key}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("council plan split ok");
