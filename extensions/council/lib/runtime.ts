import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { CouncilRuntimeContractReport } from "./types.js";

export function packageRootFrom(importMetaUrl: string): string {
  let dir = new URL(".", importMetaUrl).pathname;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "bin/provider-invoke"))) return dir.replace(/\/$/, "");
    dir = join(dir, "..");
  }
  if (process.env.AISYNTH_HOME && existsSync(join(process.env.AISYNTH_HOME, "bin/provider-invoke"))) return process.env.AISYNTH_HOME;
  return process.cwd();
}

function helpContains(path: string, flag: string): boolean {
  const result = spawnSync(path, ["--help"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.includes(flag);
}

export function selfTest(packageRoot: string): CouncilRuntimeContractReport {
  const errors: string[] = [];
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
    nodeVersion: process.version,
    packageRoot,
    loader: "jiti",
    providerInvokeAuthFlag,
    providerInvokeEffortFlag,
    providerProbeAuthFlag,
    errors
  };
}
