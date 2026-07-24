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

export function invokeProvider(
  packageRoot: string,
  route: CouncilRoute,
  entry: CouncilRosterEntryV1,
  prompt: string,
  schemaPath: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal
): Promise<ProviderInvokeResult> {
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
    if (signal?.aborted) {
      resolve({ ok: false, status: "canceled", text: "", error: String(signal.reason ?? "canceled") });
      return;
    }
    const child = spawn(bin, args, { cwd: packageRoot, env: childEnv, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    const kill = (force: boolean) => {
      try {
        const signalName = force ? "SIGKILL" : "SIGTERM";
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signalName);
        else child.kill(signalName);
      } catch {
        return;
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill(true);
    }, timeoutMs);
    const abortHandler = () => {
      aborted = true;
      kill(false);
      setTimeout(() => kill(true), Math.min(1000, Math.max(1, timeoutMs)));
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortHandler);
      if (aborted) {
        resolve({ ok: false, status: "canceled", text: stdout, error: String(signal?.reason ?? "canceled") });
        return;
      }
      if (timedOut) {
        resolve({ ok: false, status: "timeout", text: stdout, error: `provider-invoke exceeded ${timeoutMs}ms` });
        return;
      }
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
