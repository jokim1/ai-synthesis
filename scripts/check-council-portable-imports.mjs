#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const listed = spawnSync("git", ["ls-files", "extensions/council", "tests/council", "scripts/check-council-governance.mjs"], {
  cwd: root,
  encoding: "utf8"
});
if (listed.status !== 0) process.exit(listed.status ?? 1);
const offenders = [];
for (const file of listed.stdout.split(/\r?\n/).filter(Boolean)) {
  if (!/\.(ts|mts|cts|js|mjs)$/.test(file)) continue;
  const text = readFileSync(join(root, file), "utf8");
  if (/@earendil-works\//.test(text)) offenders.push(file);
}
if (offenders.length > 0) {
  console.error(`PORTABLE_IMPORT_BOUNDARY_VIOLATION: ${offenders.join(", ")}`);
  process.exit(1);
}
console.log("portable council import boundary ok");
