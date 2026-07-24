#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const plan = readFileSync(join(root, "docs/council-command-implementation-plan.md"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "docs/public/council-plan-split.v1.json"), "utf8"));
const hash = createHash("sha256").update(plan).digest("hex");
if (manifest.governingPlanSha256 !== hash) {
  console.error(`COUNCIL_PLAN_SPLIT_STALE: expected ${manifest.governingPlanSha256}, got ${hash}`);
  process.exit(1);
}
for (const decision of manifest.decisionKeys) {
  if (!plan.includes(decision.requiredText)) {
    console.error(`COUNCIL_PLAN_SPLIT_STALE: missing decision text ${decision.key}`);
    process.exit(1);
  }
  for (const forbidden of decision.forbiddenText ?? []) {
    if (plan.includes(forbidden)) {
      console.error(`COUNCIL_PLAN_SPLIT_STALE: forbidden decision text ${decision.key}`);
      process.exit(1);
    }
  }
}
console.log("council plan split ok");
