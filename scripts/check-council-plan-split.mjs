#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const plan = readFileSync(join(root, "docs/council-command-implementation-plan.md"), "utf8");
const planLines = plan.split("\n");
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

function parseRanges(value, label) {
  if (typeof value !== "string" || !/^\d+-\d+(?:,\d+-\d+)*$/.test(value)) {
    failures.push(`${label}: invalid sourceLineRanges`);
    return [];
  }
  return value.split(",").map((range) => {
    const [start, end] = range.split("-").map(Number);
    if (start < 1 || end < start || end > planLines.length) failures.push(`${label}: sourceLineRanges outside governing plan`);
    return { start, end };
  });
}

function headingSection(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start === -1) return undefined;
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return {
    start: start + 1,
    end: next === -1 ? lines.length : next,
    text: lines.slice(start, next === -1 ? lines.length : next).join("\n")
  };
}

function sourceSlice(sourceLines, label) {
  const ranges = parseRanges(sourceLines, label);
  return ranges.map(({ start, end }) => planLines.slice(start - 1, end).join("\n")).join("\n");
}

if (manifest.governingPlanSha256 !== sha256(plan)) {
  failures.push(`COUNCIL_PLAN_SPLIT_STALE: expected ${manifest.governingPlanSha256}, got ${sha256(plan)}`);
}

const subplans = new Map();
for (const subplan of manifest.subplans ?? []) {
  const text = readFileSync(join(root, subplan.path), "utf8");
  const frontmatter = parseFrontmatter(text, subplan.path);
  const ranges = parseRanges(subplan.sourceLineRanges, subplan.path);
  subplans.set(subplan.path, { ...subplan, text, frontmatter });
  if (frontmatter.source !== manifest.governingPlan) failures.push(`${subplan.path}: source frontmatter drift`);
  if (frontmatter.track !== subplan.track) failures.push(`${subplan.path}: track frontmatter drift`);
  if (frontmatter.governingPlanSha256 !== manifest.governingPlanSha256) failures.push(`${subplan.path}: plan hash frontmatter drift`);
  if (frontmatter.sourceLineRanges !== subplan.sourceLineRanges) failures.push(`${subplan.path}: sourceLineRanges frontmatter drift`);
  for (const anchor of subplan.sectionIds ?? []) {
    const section = headingSection(plan, anchor);
    if (!section) failures.push(`${subplan.path}: missing governing anchor ${anchor}`);
    else if (!ranges.some((range) => range.start <= section.end && range.end >= section.start)) failures.push(`${subplan.path}: sourceLineRanges do not cover ${anchor}`);
    const link = `../council-command-implementation-plan.md#${anchor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    if (!text.includes(link)) failures.push(`${subplan.path}: missing link to ${anchor}`);
  }
  for (const snippet of subplan.snippets ?? []) {
    const snippetRanges = parseRanges(snippet.sourceLines, `${subplan.path}:${snippet.id}`);
    if (snippetRanges.some((snippetRange) => !ranges.some((range) => range.start <= snippetRange.start && range.end >= snippetRange.end))) {
      failures.push(`${subplan.path}: snippet outside subplan sourceLineRanges ${snippet.id}`);
    }
    if (!sourceSlice(snippet.sourceLines, `${subplan.path}:${snippet.id}`).includes(snippet.text)) {
      failures.push(`${subplan.path}: snippet absent from declared source lines ${snippet.id}`);
    }
    if (sha256(snippet.text) !== snippet.sha256) failures.push(`${subplan.path}: snippet hash drift ${snippet.id}`);
    if (!text.includes(snippet.sha256)) failures.push(`${subplan.path}: subplan missing snippet hash ${snippet.id}`);
  }
}

const companion = manifest.companion;
let companionText;
let actualCompanionStatus;
const governingCompanion = plan.match(/Governed companion index:\n\n\| Companion \| Status \| Main-plan contract \|\n\|[-| ]+\|\n\| `([^`]+)` \| ([^|]+) \|/);
const governingCompanionPath = governingCompanion?.[1];
const governingCompanionStatus = governingCompanion?.[2]?.trim().split(/\s+/, 1)[0]?.toLowerCase();
if (!companion?.path) {
  failures.push("companion path missing");
} else {
  companionText = readFileSync(join(root, companion.path), "utf8");
  actualCompanionStatus = companionText.match(/^Status:\s*(deferred|active)\b/im)?.[1];
  if (!actualCompanionStatus || companion.status !== actualCompanionStatus) failures.push("companion status table drift");
  if (governingCompanionPath !== companion.path || governingCompanionStatus !== companion.status) {
    failures.push("governing companion index drift");
  }
}
for (const subplan of subplans.values()) {
  if (subplan.frontmatter.companionStatus !== actualCompanionStatus) failures.push(`${subplan.path}: companionStatus frontmatter drift`);
}

for (const decision of manifest.decisionKeys ?? []) {
  const section = headingSection(plan, decision.anchor);
  if (!section || !section.text.includes(decision.requiredText)) {
    failures.push(`COUNCIL_PLAN_SPLIT_STALE: decision text outside declared anchor ${decision.key}`);
  }
  if (sha256(decision.requiredText) !== decision.snippetSha256) failures.push(`COUNCIL_PLAN_SPLIT_STALE: decision snippet hash drift ${decision.key}`);
  for (const forbidden of decision.forbiddenText ?? []) {
    if (plan.includes(forbidden)) failures.push(`COUNCIL_PLAN_SPLIT_STALE: forbidden decision text ${decision.key}`);
  }
  const targetText = decision.target === companion?.path ? companionText : subplans.get(decision.target)?.text;
  const trackedDecisions = targetText?.match(/(?:^|\n)Tracked decisions:\n\n([\s\S]*?)(?:\n\n|$)/)?.[1];
  const expectedTarget = `\`${decision.key}\` - snippet \`${decision.snippetSha256}\``;
  if (!trackedDecisions?.includes(expectedTarget)) failures.push(`COUNCIL_PLAN_SPLIT_STALE: target missing decision ${decision.key}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("council plan split ok");
