import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CouncilAuthPolicy, CouncilRoute, CouncilRouteProbeEnvelopeV1 } from "./types.js";
import { routeId } from "./util.js";

export interface DiscoverRoutesOptions {
  packageRoot: string;
  authPolicy: CouncilAuthPolicy;
  env?: NodeJS.ProcessEnv;
}

export function familyFor(provider: string, model: string): string {
  const text = `${provider} ${model}`.toLowerCase();
  if (text.includes("claude") || text.includes("anthropic")) return "claude";
  if (text.includes("codex") || text.includes("gpt") || text.includes("openai")) return "openai";
  if (text.includes("gemini")) return "gemini";
  if (text.includes("mistral")) return "mistral";
  if (text.includes("deepseek")) return "deepseek";
  if (text.includes("qwen")) return "qwen";
  if (text.includes("kimi")) return "kimi";
  if (text.includes("grok")) return "grok";
  if (text.includes("local")) return "local";
  return "unknown";
}

export function providerInvokeRoute(provider: "claude" | "codex", runnable: boolean, reason?: string): CouncilRoute {
  const model = "adapter-default";
  const id = routeId("provider-invoke", provider, model);
  const isClaude = provider === "claude";
  return {
    ref: { executor: "provider-invoke", provider, model, routeId: id },
    displayName: `${isClaude ? "Claude Code" : "Codex CLI"} (${model})`,
    family: familyFor(provider, model),
    providerDisplayName: isClaude ? "Claude Code" : "Codex CLI",
    supportedEfforts: isClaude ? ["low", "medium", "high", "xhigh", "max"] : ["minimal", "low", "medium", "high", "xhigh"],
    effortSupport: {
      source: isClaude ? "provider_invoke_help_cli_help_passthrough" : "provider_adapter_static",
      confidence: isClaude ? "wrapper_contract" : "static_adapter_contract",
      verifiedBy: isClaude ? ["bin/provider-invoke --help", "claude --help", "fake claude --effort pass-through"] : ["bin/provider-invoke --help", "bin/adapters/codex.sh"]
    },
    structuredOutput: {
      retryOwner: provider === "codex" ? "adapter" : "engine",
      maxProviderCalls: 2,
      verifiedBy: provider === "codex" ? ["bin/adapters/codex.sh schema retry"] : ["engine JSON retry"]
    },
    auth: {
      configured: runnable,
      runnable,
      policy: isClaude ? "subscription_only" : "default",
      source: runnable ? "subscription" : undefined,
      billing: runnable ? "subscription" : "unknown",
      reason
    },
    cost: { known: false },
    limits: {}
  };
}

function probe(packageRoot: string, provider: "claude" | "codex", auth: string, env: NodeJS.ProcessEnv): { ok: boolean; status: string; message: string } {
  const result = spawnSync(join(packageRoot, "bin/provider-probe"), [provider, "--auth", auth], {
    cwd: packageRoot,
    encoding: "utf8",
    env
  });
  if (result.status !== 0) return { ok: false, status: "error", message: result.stderr || result.stdout || `provider-probe ${provider} failed` };
  try {
    const parsed = JSON.parse(result.stdout);
    return { ok: parsed.ok === true, status: parsed.status ?? "error", message: parsed.error ?? parsed.text ?? "" };
  } catch {
    return { ok: false, status: "error", message: `provider-probe ${provider} returned non-JSON` };
  }
}

export function discoverRoutes(opts: DiscoverRoutesOptions): CouncilRouteProbeEnvelopeV1 {
  if (opts.env?.AISYNTH_COUNCIL_FAKE_ROUTES) {
    return JSON.parse(opts.env.AISYNTH_COUNCIL_FAKE_ROUTES) as CouncilRouteProbeEnvelopeV1;
  }
  const diagnostics: CouncilRouteProbeEnvelopeV1["diagnostics"] = [];
  const routes: CouncilRoute[] = [];
  const env = opts.env ?? process.env;
  if (Object.keys(env).some((key) => key === "ANTHROPIC_BASE_URL")) {
    const route = providerInvokeRoute("claude", false, "claude_subscription_custom_endpoint_not_allowed");
    routes.push(route);
    diagnostics.push({ executor: "provider-invoke", provider: "claude", status: "auth", message: route.auth.reason ?? "" });
  } else {
    const claude = probe(opts.packageRoot, "claude", "subscription", env);
    const reason = claude.ok ? undefined : (env.ANTHROPIC_API_KEY ? "Claude API key detected, but council requires subscription auth" : claude.message || "claude_subscription_login_required_after_env_token_scrub");
    routes.push(providerInvokeRoute("claude", claude.ok, reason));
    diagnostics.push({ executor: "provider-invoke", provider: "claude", status: claude.ok ? "ok" : (claude.status === "auth" ? "auth" : "unavailable"), message: reason ?? "claude subscription route ready" });
  }
  const codexProbe = probe(opts.packageRoot, "codex", "auto", env);
  const codex = providerInvokeRoute("codex", false, codexProbe.ok ? "tool_policy_unproven" : codexProbe.message);
  if (!existsSync("/usr/bin/python3") && !spawnSync("python3", ["--version"], { encoding: "utf8" }).stdout) {
    codex.auth.reason = "python3 is required for Codex adapter output parsing";
  }
  routes.push(codex);
  diagnostics.push({ executor: "provider-invoke", provider: "codex", status: "unavailable", message: codex.auth.reason ?? "tool_policy_unproven" });
  return { version: 1, routes, diagnostics };
}

export function assertClaudeToolPolicy(packageRoot: string): boolean {
  const text = readFileSync(join(packageRoot, "bin/adapters/claude.sh"), "utf8");
  return ["--tools \"\"", "--permission-mode dontAsk", "--no-session-persistence", "--strict-mcp-config", "--setting-sources local", "--disable-slash-commands"].every((flag) => text.includes(flag));
}
