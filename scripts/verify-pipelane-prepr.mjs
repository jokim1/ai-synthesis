#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const mode = process.argv[2] ?? "--assert-shape";
const artifactPath = join(root, "docs/public/pipelane-prepr-checks.v1.json");

function runShell(command, env = process.env) {
  return spawnSync("sh", ["-lc", command], { cwd: root, env, stdio: "inherit" });
}

function currentShape() {
  const pipelane = spawnSync("pipelane", ["--version"], { encoding: "utf8" });
  return {
    version: pipelane.status === 0 ? pipelane.stdout.trim() : "unavailable",
    execution: "sh -lc <check>",
    checks: ["npm run test", "npm run typecheck", "npm run build"]
  };
}

if (mode === "--bootstrap-smoke") {
  for (const check of ["npm run test", "npm run typecheck", "npm run build"]) {
    const result = runShell(check);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  process.exit(0);
}

if (!existsSync(artifactPath)) {
  console.error("PIPELANE_SHAPE_DRIFT: docs/public/pipelane-prepr-checks.v1.json is missing");
  process.exit(1);
}
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const shape = currentShape();
if (mode === "--check-drift" || mode === "--assert-shape") {
  if (artifact.execution !== shape.execution || JSON.stringify(artifact.synthesizedPrePrChecks) !== JSON.stringify(shape.checks)) {
    console.error("PIPELANE_SHAPE_DRIFT: installed Pipelane execution shape no longer matches artifact. Run --bootstrap-smoke or apply no-package recovery if npm bootstrap is broken.");
    process.exit(1);
  }
  console.log("pipelane prepr shape ok");
  process.exit(0);
}

console.error("usage: verify-pipelane-prepr.mjs [--assert-shape|--check-drift|--bootstrap-smoke]");
process.exit(2);
