#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const mode = process.argv[2] ?? "--assert-shape";
const artifactPath = join(root, "docs/public/pipelane-prepr-checks.v1.json");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function runShell(cwd, command, env) {
  return run("sh", ["-lc", command], { cwd, env, stdio: "pipe" });
}

function currentShape() {
  const pipelane = run("pipelane", ["--version"]);
  return {
    version: pipelane.status === 0 ? pipelane.stdout.trim() : "unavailable",
    execution: "sh -lc <check>",
    checks: ["npm run test", "npm run typecheck", "npm run build"]
  };
}

function requireBootstrapPreconditions() {
  const required = {
    installedPipelanePrConfirmed: process.env.AISYNTH_TRACK_A_PR_PATH_CONFIRMED === "1",
    ownerAcceptedRollback: process.env.AISYNTH_TRACK_A_OWNER_ACCEPTED === "1",
    noSharedCiOrPipelaneHomes: process.env.AISYNTH_TRACK_A_NO_SHARED_CI === "1"
  };
  const failed = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(`TRACK_A_PRECONDITION_UNKNOWN: ${failed.join(", ")}; set the matching AISYNTH_TRACK_A_* evidence variables only after confirming each precondition`);
  }
  const prHelp = run("pipelane", ["pr", "--help"]);
  if (prHelp.status !== 0) throw new Error("TRACK_A_PRECONDITION_FAILED: installed Pipelane /pr is unavailable");
  return required;
}

function cleanCheckout(parent, name) {
  const checkout = join(parent, name);
  mkdirSync(checkout, { recursive: true });
  const archive = join(parent, `${name}.tar`);
  const archived = run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"], { cwd: root });
  if (archived.status !== 0) throw new Error(`git archive failed: ${archived.stderr}`);
  const extracted = run("tar", ["-xf", archive, "-C", checkout]);
  if (extracted.status !== 0) throw new Error(`throwaway checkout extraction failed: ${extracted.stderr}`);
  return checkout;
}

function npmFact(cwd, key, env) {
  const result = run("npm", ["config", "get", key], { cwd, env });
  return result.status === 0 ? result.stdout.trim() : `unavailable:${result.stderr.trim()}`;
}

function exerciseCheckout(checkout, env, label) {
  const before = existsSync(join(checkout, "node_modules"));
  const checks = [];
  for (const command of ["npm run test", "npm run typecheck", "npm run build"]) {
    const result = runShell(checkout, command, env);
    checks.push({ command, status: result.status, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) });
    if (result.status !== 0) throw new Error(`${label} failed ${command}: ${result.stderr || result.stdout}`);
  }
  return {
    label,
    pipeLaneHome: env.PIPELANE_HOME,
    node: process.version,
    registry: npmFact(checkout, "registry", env),
    cache: npmFact(checkout, "cache", env),
    noNodeModulesBefore: !before,
    installStampCreated: existsSync(join(checkout, "node_modules", ".aisynth-deps-stamp")),
    checks
  };
}

function bootstrapSmoke() {
  const preconditions = requireBootstrapPreconditions();
  const temporaryRoot = mkdtempSync(join(tmpdir(), "aisynth-pipelane-bootstrap-"));
  try {
    const activeHome = process.env.PIPELANE_HOME ?? join(homedir(), ".pipelane");
    const emptyHome = join(temporaryRoot, "empty-pipelane-home");
    mkdirSync(emptyHome, { recursive: true });
    const baseEnv = { ...process.env };
    const active = exerciseCheckout(cleanCheckout(temporaryRoot, "active-home-checkout"), { ...baseEnv, PIPELANE_HOME: activeHome }, "active PIPELANE_HOME");
    const empty = exerciseCheckout(cleanCheckout(temporaryRoot, "empty-home-checkout"), { ...baseEnv, PIPELANE_HOME: emptyHome }, "empty PIPELANE_HOME");

    const warmCache = join(temporaryRoot, "populated-npm-cache");
    mkdirSync(warmCache, { recursive: true });
    const warmCheckout = cleanCheckout(temporaryRoot, "cache-warm-checkout");
    const warm = run("npm", ["ci", "--prefer-offline", "--no-audit", "--fund=false"], {
      cwd: warmCheckout,
      env: { ...baseEnv, npm_config_cache: warmCache }
    });
    if (warm.status !== 0) throw new Error(`TRACK_A_CACHE_WARM_FAILED: ${warm.stderr || warm.stdout}`);
    const cacheHit = exerciseCheckout(
      cleanCheckout(temporaryRoot, "cache-hit-offline-checkout"),
      { ...baseEnv, PIPELANE_HOME: emptyHome, npm_config_cache: warmCache, npm_config_offline: "true" },
      "populated cache offline"
    );

    const missCheckout = cleanCheckout(temporaryRoot, "cache-miss-checkout");
    const emptyCache = join(temporaryRoot, "empty-npm-cache");
    mkdirSync(emptyCache, { recursive: true });
    const miss = run("npm", ["ci", "--prefer-offline", "--no-audit", "--fund=false"], {
      cwd: missCheckout,
      env: { ...baseEnv, npm_config_cache: emptyCache, npm_config_offline: "true" }
    });
    if (miss.status === 0) throw new Error("TRACK_A_CACHE_MISS_PROOF_FAILED: offline install unexpectedly succeeded with an empty cache");

    const evidence = {
      version: 1,
      createdAt: new Date().toISOString(),
      shape: currentShape(),
      preconditions,
      active,
      empty,
      cacheHit: {
        ...cacheHit,
        offline: true,
        networkAvoided: true,
        populatedCache: warmCache
      },
      cacheMissFailure: {
        status: miss.status,
        registry: npmFact(missCheckout, "registry", baseEnv),
        cache: emptyCache,
        dependencyInstallUnavailableObserved: true
      }
    };
    const evidencePath = join(root, ".ai-synthesis", "council-evidence", "pipelane-prepr-bootstrap.v1.json");
    mkdirSync(dirname(evidencePath), { recursive: true, mode: 0o700 });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, evidencePath, evidence }, null, 2));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (mode === "--bootstrap-smoke") {
  try {
    bootstrapSmoke();
    process.exit(0);
  } catch (error) {
    console.error((error).message);
    process.exit(1);
  }
}

if (!existsSync(artifactPath)) {
  console.error("PIPELANE_SHAPE_DRIFT: docs/public/pipelane-prepr-checks.v1.json is missing");
  process.exit(1);
}
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const shape = currentShape();
if (mode === "--check-drift" || mode === "--assert-shape") {
  if (
    artifact.execution !== shape.execution
    || artifact.pipelaneVersion !== shape.version
    || JSON.stringify(artifact.synthesizedPrePrChecks) !== JSON.stringify(shape.checks)
  ) {
    console.error("PIPELANE_SHAPE_DRIFT: installed Pipelane execution shape no longer matches artifact. Run --bootstrap-smoke or apply no-package recovery if npm bootstrap is broken.");
    process.exit(1);
  }
  console.log("pipelane prepr shape ok");
  process.exit(0);
}

console.error("usage: verify-pipelane-prepr.mjs [--assert-shape|--check-drift|--bootstrap-smoke]");
process.exit(2);
