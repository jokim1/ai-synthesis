import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { invokeProvider, sanitizeProviderInvokeEnv } from "../../extensions/council/lib/executors/provider-invoke.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";

describe("provider-invoke executor", () => {
  it("scrubs Anthropic environment for council Claude subscription calls", () => {
    const route = providerInvokeRoute("claude", true);
    const env = sanitizeProviderInvokeEnv(route, {
      PATH: "/bin",
      ANTHROPIC_API_KEY: "secret",
      ANTHROPIC_OAUTH_TOKEN: "secret",
      ANTHROPIC_BASE_URL: "https://example.invalid"
    });
    expect(env.AISYNTH_COUNCIL).toBe("1");
    expect(Object.keys(env).filter((key) => key.startsWith("ANTHROPIC_"))).toEqual([]);
  });

  it("returns a structured failure when the wrapper cannot spawn", async () => {
    const route = providerInvokeRoute("claude", true);
    const result = await invokeProvider(
      process.cwd(),
      route,
      { id: "entry_a", route: route.ref, role: "architect", effort: "medium", enabled: true },
      "prompt",
      join(process.cwd(), "schemas/council-voice.json"),
      1000,
      { ...process.env, AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "missing-provider-invoke") }
    );
    expect(result).toMatchObject({ ok: false, status: "invocation_failed" });
  });
});
