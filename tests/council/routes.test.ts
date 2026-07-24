import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeId } from "../../extensions/council/lib/util.js";
import { discoverRoutes, familyFor, providerInvokeRoute } from "../../extensions/council/lib/routes.js";

describe("routes", () => {
  it("builds stable percent-encoded route ids independent of labels", () => {
    expect(routeId("provider-invoke", "claude", "adapter-default")).toBe("v1:provider-invoke:claude:adapter-default");
    expect(routeId("provider invoke", "claude/sonnet", "mødel")).toBe("v1:provider%20invoke:claude%2Fsonnet:m%C3%B8del");
  });

  it("keeps Codex unavailable while tool policy is unproven", () => {
    const codex = providerInvokeRoute("codex", false, "tool_policy_unproven");
    expect(codex.auth.runnable).toBe(false);
    expect(codex.auth.reason).toBe("tool_policy_unproven");
    expect(familyFor("codex", "adapter-default")).toBe("openai");
  });

  it("keeps Claude unavailable when its no-tools policy cannot be proven", () => {
    const root = mkdtempSync(join(tmpdir(), "council-route-policy-"));
    mkdirSync(join(root, "bin", "adapters"), { recursive: true });
    writeFileSync(join(root, "bin", "adapters", "claude.sh"), "adapter_invoke() { :; }\n");
    const result = discoverRoutes({ packageRoot: root, authPolicy: "subscription_only", env: { PATH: process.env.PATH } });
    const claude = result.routes.find((candidate) => candidate.ref.provider === "claude");
    expect(claude?.auth.runnable).toBe(false);
    expect(claude?.auth.reason).toBe("tool_policy_unproven");
  });
});
