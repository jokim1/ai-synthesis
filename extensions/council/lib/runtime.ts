import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { CouncilRuntimeContractReport } from "./types.js";

const MIN_NODE = [22, 19, 0] as const;

export function nodeVersionSupported(version: string): boolean {
  const normalized = version.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < MIN_NODE.length; index += 1) {
    const got = normalized[index] ?? 0;
    const want = MIN_NODE[index];
    if (got > want) return true;
    if (got < want) return false;
  }
  return true;
}

export function packageRootFrom(importMetaUrl: string): string {
  let dir = fileURLToPath(new URL(".", importMetaUrl));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "bin/provider-invoke"))) return dir.replace(/\/$/, "");
    dir = join(dir, "..");
  }
  if (process.env.AISYNTH_HOME && existsSync(join(process.env.AISYNTH_HOME, "bin/provider-invoke"))) return process.env.AISYNTH_HOME;
  throw Object.assign(new Error("council package root not found from import.meta.url; set AISYNTH_HOME to the ai-synthesis package root"), { exitCode: 5 });
}

function helpContains(path: string, flag: string): boolean {
  const result = spawnSync(path, ["--help"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.includes(flag);
}

export function selfTest(packageRoot: string, opts: { nodeVersion?: string } = {}): CouncilRuntimeContractReport {
  const errors: string[] = [];
  const nodeVersion = opts.nodeVersion ?? process.version;
  if (!nodeVersionSupported(nodeVersion)) errors.push(`NODE_VERSION_UNSUPPORTED: node ${nodeVersion}; require >=22.19.0`);
  const providerInvoke = join(packageRoot, "bin/provider-invoke");
  const providerProbe = join(packageRoot, "bin/provider-probe");
  if (!existsSync(providerInvoke)) errors.push("missing bin/provider-invoke");
  if (!existsSync(providerProbe)) errors.push("missing bin/provider-probe");
  const providerInvokeAuthFlag = existsSync(providerInvoke) && helpContains(providerInvoke, "--auth");
  const providerInvokeEffortFlag = existsSync(providerInvoke) && helpContains(providerInvoke, "--effort");
  const providerProbeAuthFlag = existsSync(providerProbe) && helpContains(providerProbe, "--auth");
  if (!providerInvokeAuthFlag) errors.push("bin/provider-invoke must expose --auth");
  if (!providerInvokeEffortFlag) errors.push("bin/provider-invoke must expose --effort");
  if (!providerProbeAuthFlag) errors.push("bin/provider-probe must expose --auth");
  return {
    ok: errors.length === 0,
    nodeVersion,
    packageRoot,
    loader: "jiti",
    providerInvokeAuthFlag,
    providerInvokeEffortFlag,
    providerProbeAuthFlag,
    errors
  };
}
