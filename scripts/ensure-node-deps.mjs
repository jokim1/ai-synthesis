#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const min = [22, 19, 0];
const got = process.versions.node.split(".").map(Number);
for (let i = 0; i < min.length; i += 1) {
  if (got[i] > min[i]) break;
  if (got[i] < min[i]) {
    console.error(`NODE_VERSION_UNSUPPORTED: node ${process.versions.node}; require >=22.19.0`);
    process.exit(1);
  }
}

const packageJson = readFileSync(join(root, "package.json"));
const lockPath = join(root, "package-lock.json");
if (!existsSync(lockPath)) {
  console.error("DEPENDENCY_INSTALL_UNAVAILABLE: package-lock.json is missing; run npm install to repair the lockfile.");
  process.exit(1);
}
const packageLock = readFileSync(lockPath);
const stamp = createHash("sha256").update(packageJson).update(packageLock).digest("hex");
const stampPath = join(root, "node_modules", ".aisynth-deps-stamp");

if (existsSync(join(root, "node_modules")) && existsSync(stampPath) && readFileSync(stampPath, "utf8").trim() === stamp) {
  process.exit(0);
}

const npm = process.env.npm_execpath ? process.execPath : "npm";
const args = process.env.npm_execpath
  ? [process.env.npm_execpath, "ci", "--prefer-offline", "--no-audit", "--fund=false"]
  : ["ci", "--prefer-offline", "--no-audit", "--fund=false"];
const result = spawnSync(npm, args, { cwd: root, stdio: "inherit", env: process.env });
if (result.status !== 0) {
  console.error("DEPENDENCY_INSTALL_UNAVAILABLE: npm ci --prefer-offline --no-audit --fund=false failed.");
  process.exit(result.status ?? 1);
}
mkdirSync(dirname(stampPath), { recursive: true });
writeFileSync(stampPath, `${stamp}\n`, { mode: 0o644 });
