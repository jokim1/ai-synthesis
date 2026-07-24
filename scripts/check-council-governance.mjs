#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(root, "docs/public/council-mvp-symbols.v1.json"), "utf8"));
const listed = spawnSync("git", ["ls-files", "extensions/council", "bin/council", "bin/council-route-probe", "skills/council"], {
  cwd: root,
  encoding: "utf8"
});
if (listed.status !== 0) process.exit(listed.status ?? 1);
const files = listed.stdout.split(/\r?\n/).filter(Boolean);
const forbiddenMatches = files.filter((file) => manifest.forbiddenPaths.some((prefix) => file.startsWith(prefix)));
if (forbiddenMatches.length > 0) {
  console.error(`COUNCIL_MVP_FORBIDDEN_SURFACE: ${forbiddenMatches.join(", ")}`);
  process.exit(1);
}
const text = files.filter((file) => /\.(ts|js|mjs|sh|md)$/.test(file)).map((file) => readFileSync(join(root, file), "utf8")).join("\n");
const forbiddenSymbols = manifest.forbiddenSymbols.filter((symbol) => text.includes(symbol));
if (forbiddenSymbols.length > 0) {
  console.error(`COUNCIL_MVP_FORBIDDEN_SYMBOL: ${forbiddenSymbols.join(", ")}`);
  process.exit(1);
}
console.log("council governance ok");
