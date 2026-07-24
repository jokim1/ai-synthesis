import { spawn } from "node:child_process";
import { join } from "node:path";
import type { CouncilRoute, CouncilRosterEntryV1 } from "../types.js";

export interface ProviderInvokeResult {
  ok: boolean;
  status: string;
  structured?: unknown;
  text: string;
  error?: string;
  model?: string;
  attempts?: number;
}

export function sanitizeProviderInvokeEnv(route: CouncilRoute, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv, AISYNTH_COUNCIL: "1" };
  if (route.ref.provider === "claude" && route.auth.policy === "subscription_only") {
    for (const key of Object.keys(env)) {
      if (key.startsWith("ANTHROPIC_")) delete env[key];
    }
  }
  return env;
}

export function invokeProvider(packageRoot: string, route: CouncilRoute, entry: CouncilRosterEntryV1, prompt: string, schemaPath: string, timeoutMs: number, env: NodeJS.ProcessEnv = process.env): Promise<ProviderInvokeResult> {
  const bin = env.AISYNTH_COUNCIL_PROVIDER_INVOKE ?? join(packageRoot, "bin/provider-invoke");
  const args = [
    route.ref.provider,
    "--prompt",
    prompt,
    "--schema-file",
    schemaPath,
    "--effort",
    entry.effort,
    "--timeout",
    String(Math.ceil(timeoutMs / 1000))
  ];
  if (route.ref.provider === "claude") args.push("--auth", "subscription");
  const childEnv = sanitizeProviderInvokeEnv(route, env);
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: packageRoot, env: childEnv, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        // best effort
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout);
        resolve({
          ok: parsed.ok === true,
          status: parsed.status ?? "unknown",
          structured: parsed.structured,
          text: parsed.text ?? "",
          error: parsed.error,
          model: parsed.model,
          attempts: parsed.meta?.attempts
        });
      } catch {
        resolve({ ok: false, status: "malformed", text: stdout, error: stderr || "provider-invoke returned non-JSON" });
      }
    });
  });
}
