#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const command = process.argv[2];
if (!["test", "typecheck", "build"].includes(command)) {
  console.error("usage: run-package-check.mjs <test|typecheck|build>");
  process.exit(2);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false, ...opts });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function changedFiles() {
  const explicit = process.env.PIPELANE_CHANGED_FILES?.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) ?? [];
  const local = [
    ...capture("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB"]).split(/\r?\n/).filter(Boolean),
    ...capture("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"]).split(/\r?\n/).filter(Boolean)
  ];
  const baseCandidates = [
    process.env.PIPELANE_BASE_REF,
    capture("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]),
    "origin/main",
    "origin/master",
    "main",
    "master"
  ].filter(Boolean);
  let committed = [];
  let resolvedMergeBase = "";
  let resolvedBase = "";
  for (const base of baseCandidates) {
    const mergeBase = capture("git", ["merge-base", "HEAD", base]);
    if (!mergeBase) continue;
    resolvedBase = base;
    resolvedMergeBase = mergeBase;
    committed = capture("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", `${mergeBase}..HEAD`]).split(/\r?\n/).filter(Boolean);
    break;
  }
  const independent = [...explicit, ...local].filter(Boolean);
  if (!resolvedMergeBase && independent.length === 0) return ["package.json"];
  const commitsSinceBase = resolvedMergeBase ? Number(capture("git", ["rev-list", "--count", `${resolvedMergeBase}..HEAD`])) : 0;
  if (commitsSinceBase > 0 && committed.length === 0) return ["package.json"];
  if (process.env.PIPELANE_BASE_REF && resolvedBase !== process.env.PIPELANE_BASE_REF) return ["package.json"];
  return [...new Set([...explicit, ...local, ...committed])];
}

function classify(paths) {
  if (paths.length === 0) return "node";
  const nodeSurface = /^(package\.json|package-lock\.json|tsconfig\.json|vitest\.config\.ts|bin\/council(?:-route-probe)?$|extensions\/council\/|tests\/council\/|tests\/conformance\/|schemas\/council-|roles\/council\/|scripts\/(check-council|run-package-check|ensure-node-deps|verify-pipelane)|docs\/public\/council-)/;
  if (paths.some((path) => nodeSurface.test(path))) return "node";
  const shellSurface = /^(bin\/|tests\/conformance\/|SKILL\.md|roles\/|schemas\/)/;
  if (paths.every((path) => shellSurface.test(path))) return "legacy-shell";
  if (paths.every((path) => path.startsWith("docs/") || path === "README.md" || path === "bin/README.md")) return "docs";
  return "node";
}

const surface = classify(changedFiles());
if (surface === "docs") {
  console.log("CHECK_SKIPPED_NON_NODE_SURFACE");
  process.exit(0);
}
if (surface === "legacy-shell") {
  if (command === "test") {
    run("bash", ["-n", "bin/provider-invoke"]);
    run("bash", ["-n", "bin/provider-probe"]);
    run("bash", ["-n", "bin/council"]);
    run("bash", ["-n", "bin/council-route-probe"]);
    run("bash", ["-n", "bin/adapters/claude.sh"]);
    run("bash", ["-n", "bin/adapters/codex.sh"]);
    run("bash", ["tests/conformance/run.sh", "unit"]);
  } else {
    console.log("CHECK_SKIPPED_NON_NODE_SURFACE");
  }
  process.exit(0);
}

if (!existsSync(`${root}/node_modules/.aisynth-deps-stamp`)) {
  run(process.execPath, ["scripts/ensure-node-deps.mjs"]);
}

if (command === "test") {
  run("bash", ["tests/conformance/run.sh", "hermetic"]);
  run("npx", ["vitest", "run"]);
} else if (command === "typecheck") {
  run("npx", ["tsc", "--noEmit"]);
} else {
  run("npx", ["tsc", "--noEmit"]);
  run(process.execPath, ["scripts/check-council-portable-imports.mjs"]);
}
